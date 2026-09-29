// 浏览器本地持久化：localStorage
// - 已提交内容写入后立即落盘（同步 API，提交返回时数据已持久化，意外关页不丢）
// - 表单草稿单独存储，意外关闭后可恢复，提交成功即清除
import type { Database, WorkEntry } from "./domain";
import { uid } from "./domain";

const DB_KEY = "farrier.db.v1";
const DRAFT_PREFIX = "farrier.draft.v1.";

export const emptyDb = (): Database => ({ version: 1, horses: [], entries: [] });

export function loadDb(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return seedDb();
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.horses) || !Array.isArray(parsed.entries)) {
      throw new Error("bad db");
    }
    return parsed;
  } catch {
    // 数据损坏时不清空，搬到一旁便于人工找回，再用初始数据启动
    const raw = localStorage.getItem(DB_KEY);
    if (raw) localStorage.setItem(DB_KEY + ".corrupt." + Date.now(), raw);
    return emptyDb();
  }
}

/** 同步原子写：序列化成功后一次 setItem 覆盖，提交即落盘 */
export function saveDb(db: Database): void {
  const raw = JSON.stringify(db);
  localStorage.setItem(DB_KEY, raw);
}

export function exportFile(db: Database): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `修蹄档案备份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseBackupFile(file: File): Promise<Database> {
  const text = await file.text();
  const data = JSON.parse(text) as Database;
  if (data.version !== 1 || !Array.isArray(data.horses) || !Array.isArray(data.entries)) {
    throw new Error("备份文件格式不正确");
  }
  // 基本清洗：补齐缺失字段
  return {
    version: 1,
    horses: data.horses.map((h) => ({
      id: h.id || uid("horse"),
      code: h.code ?? "",
      name: h.name ?? "",
      breed: h.breed ?? "",
      status: h.status ?? "运动马",
      owner: h.owner ?? "",
      note: h.note ?? "",
      createdAt: h.createdAt ?? Date.now(),
    })),
    entries: data.entries.map((e) => ({
      id: e.id || uid("ent"),
      horseId: e.horseId,
      date: e.date ?? "",
      gait: e.gait ?? "",
      gaitNote: e.gaitNote ?? "",
      gaitAbnormal: !!e.gaitAbnormal,
      hooves: e.hooves ?? ({} as WorkEntry["hooves"]),
      shoeChanges: e.shoeChanges ?? [],
      nextReview: e.nextReview ?? "",
      note: e.note ?? "",
      photoData: e.photoData ?? "",
      photoCaption: e.photoCaption ?? "",
      farrier: e.farrier ?? "",
      createdAt: e.createdAt ?? Date.now(),
    })),
  };
}

// ---------- 表单草稿（防意外关页丢失正在填写的内容） ----------

export interface Draft {
  horseId: string;
  savedAt: number;
  form: unknown;
}

export function saveDraft(horseId: string, form: unknown): void {
  const draft: Draft = { horseId, savedAt: Date.now(), form };
  try {
    localStorage.setItem(DRAFT_PREFIX + horseId, JSON.stringify(draft));
  } catch {
    // 草稿（可能含照片）超容量时静默失败，不影响正式数据
  }
}

export function loadDraft(horseId: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + horseId);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(horseId: string): void {
  localStorage.removeItem(DRAFT_PREFIX + horseId);
}

export function listDrafts(): Draft[] {
  const out: Draft[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) {
      try {
        out.push(JSON.parse(localStorage.getItem(key)!) as Draft);
      } catch {
        // 忽略损坏草稿
      }
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

// ---------- 初始演示数据（仅首次打开） ----------
function seedDb(): Database {
  const now = Date.now();
  const day = 86400000;
  const db: Database = {
    version: 1,
    horses: [
      { id: "h18", code: "HORSE-18", name: "疾风", breed: "荷兰温血马", status: "运动马", owner: "李教练", note: "右前肢曾有旧伤", createdAt: now - 60 * day },
      { id: "h27", code: "HORSE-27", name: "板栗", breed: "纯血马", status: "运动马", owner: "王会员", note: "后蹄壁偏脆", createdAt: now - 45 * day },
      { id: "h31", code: "HORSE-31", name: "阿灰", breed: "阿拉伯马", status: "休养马", owner: "俱乐部", note: "步态观察中", createdAt: now - 30 * day },
    ],
    entries: [
      {
        id: "e18a", horseId: "h18", date: isoDaysAgo(28), gait: "正常", gaitNote: "", gaitAbnormal: false,
        hooves: hoofMap({ RF: { issues: ["磨耗不均"], shape: "外展" } }),
        shoeChanges: [{ hoof: "RF", oldShoe: "普通钢蹄铁", newShoe: "铝蹄铁", nails: "外7内6", reason: "右前外侧磨耗，换轻铝铁减负" }],
        nextReview: isoFrom(new Date(isoDaysAgo(28) + "T00:00:00").getTime() + 14 * day), // 修蹄后14天复查，现已逾期
        note: "14天后复查", photoData: "", photoCaption: "", farrier: "老赵", createdAt: now - 28 * day,
      },
      {
        id: "e27a", horseId: "h27", date: isoDaysAgo(6), gait: "正常", gaitNote: "", gaitAbnormal: false,
        hooves: hoofMap({ LH: { issues: ["裂纹"], shape: "良好" }, RH: { issues: ["裂纹"], shape: "良好" } }),
        shoeChanges: [{ hoof: "LH", oldShoe: "普通钢蹄铁", newShoe: "加护蹄垫", nails: "外7内7", reason: "后蹄裂纹，加装护蹄垫" }],
        nextReview: isoDaysAhead(8), note: "拍照归档，裂纹随诊", photoData: "", photoCaption: "", farrier: "老赵", createdAt: now - 6 * day,
      },
      {
        id: "e31a", horseId: "h31", date: isoDaysAgo(2), gait: "运步不稳", gaitNote: "硬地右转时明显", gaitAbnormal: true,
        hooves: hoofMap({ LF: { issues: ["蹄形不良"], shape: "偏陡" } }),
        shoeChanges: [],
        nextReview: isoDaysAhead(1), note: "需教练复核后再安排矫正", photoData: "", photoCaption: "", farrier: "老赵", createdAt: now - 2 * day,
      },
    ],
  };
  saveDb(db);
  return db;
}

function isoDaysAgo(n: number): string {
  return isoFrom(Date.now() - n * 86400000);
}
function isoDaysAhead(n: number): string {
  return isoFrom(Date.now() + n * 86400000);
}
function isoFrom(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hoofMap(partial: Partial<Record<string, { issues?: string[]; shape?: string }>>): WorkEntry["hooves"] {
  const mk = (h: { issues?: string[]; shape?: string }) => ({
    shape: h.shape ?? "",
    balance: "",
    issues: h.issues ?? [],
    note: "",
  });
  return {
    LF: mk(partial.LF ?? {}),
    RF: mk(partial.RF ?? {}),
    LH: mk(partial.LH ?? {}),
    RH: mk(partial.RH ?? {}),
  };
}
