import {
  type AppState,
  type Event,
  type Exam,
  type Horse,
  type ShoeChange,
} from "../types";
import { buildSeed } from "./seed";

const SNAPSHOT_KEY = "farrier.state.v1";
const JOURNAL_KEY = "farrier.journal.v1";
const BOOTSTRAP_KEY = "farrier.bootstrapped.v1";

/** 超过该事件数后做一次快照压缩，控制 localStorage 体积 */
const COMPACT_AT = 100;

interface Snapshot {
  version: 1;
  /** 该快照已经包含的事件数（journal 下标，用于去重） */
  seq: number;
  state: AppState;
}

type JournalEntry = { seq: number; event: Event };

// ---- 事件归约（幂等：按实体 id upsert，重复回放结果一致） ----

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

function applyEvent(state: AppState, event: Event): AppState {
  switch (event.type) {
    case "horse-upsert":
      return { ...state, horses: upsert(state.horses, event.horse) };
    case "horse-delete":
      return {
        horses: state.horses.filter((h) => h.id !== event.id),
        exams: state.exams.filter((e) => e.horseId !== event.id),
        shoeChanges: state.shoeChanges.filter((s) => s.horseId !== event.id),
      };
    case "exam-add":
      return { ...state, exams: upsert(state.exams, event.exam) };
    case "exam-delete":
      return { ...state, exams: state.exams.filter((e) => e.id !== event.id) };
    case "shoe-add":
      return {
        ...state,
        shoeChanges: upsert(state.shoeChanges, event.change),
      };
    case "shoe-delete":
      return {
        ...state,
        shoeChanges: state.shoeChanges.filter((s) => s.id !== event.id),
      };
    case "bulk-import":
      return {
        horses: mergeById(state.horses, event.horses),
        exams: mergeById(state.exams, event.exams),
        shoeChanges: mergeById(state.shoeChanges, event.shoeChanges),
      };
    default:
      return state;
  }
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  let out = a;
  for (const item of b) out = upsert(out, item);
  return out;
}

// ---- 加载：快照 + 日志重放 ----

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function load(): {
  state: AppState;
  seq: number;
  journal: JournalEntry[];
  seeded: boolean;
} {
  const bootstrapped = localStorage.getItem(BOOTSTRAP_KEY);
  let base: AppState = { horses: [], exams: [], shoeChanges: [] };
  let seq = 0;
  let seeded = false;

  const snap = readJson<Snapshot>(SNAPSHOT_KEY);
  if (snap && snap.version === 1 && snap.state) {
    base = snap.state;
    seq = snap.seq;
  } else if (!bootstrapped) {
    // 全新用户：铺一批示例档案
    base = buildSeed();
    seeded = true;
  }

  const journal = readJson<JournalEntry[]>(JOURNAL_KEY) ?? [];
  let state = base;
  for (const entry of journal) {
    if (entry.seq >= seq) state = applyEvent(state, entry.event);
  }
  seq = journal.length
    ? Math.max(seq, journal[journal.length - 1].seq + 1)
    : seq;
  // 日志被清空（压缩过）时 seq 以快照为准
  if (journal.length === 0 && snap) seq = snap.seq;

  if (!bootstrapped) {
    try {
      localStorage.setItem(BOOTSTRAP_KEY, "1");
    } catch {
      /* 存储不可写时不阻断读取流程 */
    }
  }
  return { state, seq, journal, seeded };
}

// ---- Store（外部订阅，useSyncExternalStore 接入 React） ----

class FarrierStore {
  private state: AppState;
  private seq: number;
  private journal: JournalEntry[];
  private listeners = new Set<() => void>();

  constructor() {
    const loaded = load();
    this.state = loaded.state;
    this.seq = loaded.seq;
    this.journal = loaded.journal;
    if (loaded.seeded) {
      // 全新用户的示例档案立即落快照：即使没提交任何内容就关页也不丢。
      // seq=0 表示快照包含 0 个事件，重放规则（entry.seq >= snap.seq）
      // 会把之后的第一条事件 seq 0 正常追加，不会漏也不会重复。
      try {
        localStorage.setItem(
          SNAPSHOT_KEY,
          JSON.stringify({
            version: 1,
            seq: 0,
            state: this.state,
          } satisfies Snapshot)
        );
      } catch {
        /* 空间异常时忽略，BOOTSTRAP 标记会避免重复 seed */
      }
    }
  }

  getState = (): AppState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /**
   * 提交一个事件。
   * 持久化顺序：先把事件追加进日志并同步写入 localStorage（提交成功即落盘，
   * 意外关页/刷新后下次打开会重放日志恢复），再更新内存状态；
   * 日志累积到阈值时，把完整状态写成快照并清空日志完成压缩。
   * 快照是日志的压缩副本，写入失败不影响已落盘的日志数据。
   */
  commit(event: Event): void {
    const entry: JournalEntry = { seq: this.seq, event };
    const nextJournal = [...this.journal, entry];
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(nextJournal));
    } catch (err) {
      const e = new StorageError(
        "浏览器存储空间不足，本次内容未能写入。可先导出备份或删除旧照片后重试。"
      );
      (e as Error & { cause?: unknown }).cause = err;
      throw e;
    }
    // 日志落盘成功后再更新状态
    this.journal = nextJournal;
    this.seq += 1;
    this.state = applyEvent(this.state, event);

    if (this.journal.length >= COMPACT_AT) {
      this.compact();
    }

    this.emit();
  }

  /**
   * 压缩：把当前完整状态（含全部已重放事件）写成快照，再清空日志。
   * 任一步失败都保留日志，数据不丢，下次提交会再次尝试。
   */
  private compact(): void {
    try {
      localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({
          version: 1,
          seq: this.seq,
          state: this.state,
        } satisfies Snapshot)
      );
      localStorage.setItem(JOURNAL_KEY, "[]");
      this.journal = [];
    } catch {
      /* 快照写不下（通常是照片太多）：日志仍在，留待下次提交再压缩 */
    }
  }

  /** 存储写满时去掉新记录里的照片再重试一次（文本历史优先保住） */
  commitWithoutPhotos(event: Event): void {
    this.commit(stripPhotos(event));
  }
}

function stripPhotos(event: Event): Event {
  if (event.type === "exam-add") {
    return {
      ...event,
      exam: { ...event.exam, photos: [] },
    };
  }
  if (event.type === "bulk-import") {
    return {
      ...event,
      exams: event.exams.map((e) => ({ ...e, photos: [] })),
    };
  }
  return event;
}

export class StorageError extends Error {}

export const store = new FarrierStore();

// ---- 面向组件的命令封装 ----

export const actions = {
  saveHorse(horse: Horse): void {
    store.commit({ type: "horse-upsert", horse });
  },
  deleteHorse(id: string): void {
    store.commit({ type: "horse-delete", id });
  },
  saveExam(exam: Exam): { photosDropped: boolean } {
    try {
      store.commit({ type: "exam-add", exam });
      return { photosDropped: false };
    } catch (err) {
      if (err instanceof StorageError && exam.photos.length > 0) {
        // 空间不足时先保住文字与四蹄记录，照片退回给用户另行归档
        store.commitWithoutPhotos({ type: "exam-add", exam });
        return { photosDropped: true };
      }
      throw err;
    }
  },
  deleteExam(id: string): void {
    store.commit({ type: "exam-delete", id });
  },
  saveShoe(change: ShoeChange): void {
    store.commit({ type: "shoe-add", change });
  },
  deleteShoe(id: string): void {
    store.commit({ type: "shoe-delete", id });
  },
  bulkImport(payload: {
    horses: Horse[];
    exams: Exam[];
    shoeChanges: ShoeChange[];
  }): { photosDropped: boolean } {
    try {
      store.commit({ type: "bulk-import", ...payload });
      return { photosDropped: false };
    } catch (err) {
      if (err instanceof StorageError) {
        const hasPhoto = payload.exams.some((e) => e.photos.length > 0);
        if (hasPhoto) {
          // 空间不足：档案与历史优先并入，照片放弃
          store.commitWithoutPhotos({
            type: "bulk-import",
            horses: payload.horses,
            exams: payload.exams.map((e) => ({ ...e, photos: [] })),
            shoeChanges: payload.shoeChanges,
          });
          return { photosDropped: true };
        }
      }
      throw err;
    }
  },
};
