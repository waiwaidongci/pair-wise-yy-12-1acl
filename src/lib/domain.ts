// 修蹄档案领域模型与纯函数

export const HOOVES = ["LF", "RF", "LH", "RH"] as const;
export type Hoof = (typeof HOOVES)[number];

export const HOOF_LABEL: Record<Hoof, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const HOOF_SHORT: Record<Hoof, string> = {
  LF: "左前",
  RF: "右前",
  LH: "左后",
  RH: "右后",
};

export const HOOF_SIDE: Record<Hoof, "front" | "hind"> = {
  LF: "front",
  RF: "front",
  LH: "hind",
  RH: "hind",
};

export const HOOF_ISSUE_OPTIONS = [
  "磨耗不均",
  "裂纹",
  "蹄壁缺损",
  "蹄底瘀伤",
  "白线裂",
  "蹄叉腐疽",
  "蹄温偏高",
  "蹄形不良",
] as const;
export type HoofIssue = (typeof HOOF_ISSUE_OPTIONS)[number];

export const HOOF_SHAPE_OPTIONS = ["良好", "偏长", "偏陡", "扁平", "外展", "内卷"] as const;
export type HoofShape = (typeof HOOF_SHAPE_OPTIONS)[number] | string;

export const BALANCE_OPTIONS = ["均衡", "内偏", "外偏", "前倾", "后倾"] as const;

export const SHOE_TYPE_OPTIONS = [
  "普通钢蹄铁",
  "铝蹄铁",
  "塑料蹄铁",
  "矫正蹄铁",
  "加护蹄垫",
  "无铁（裸蹄）",
] as const;
export type ShoeType = (typeof SHOE_TYPE_OPTIONS)[number] | string;

export const GAIT_OPTIONS = ["正常", "跛行", "运步不稳", "点头步态", "臀部下降", "步幅不均"] as const;

export const HORSE_STATUS_OPTIONS = ["运动马", "休养马", "调教马"] as const;
export type HorseStatus = (typeof HORSE_STATUS_OPTIONS)[number] | string;

export type EntryType = "inspection" | "shoeing";

export interface HoofState {
  shape: string; // 蹄形评估
  balance: string; // 均衡度
  issues: string[]; // 异常问题
  note: string; // 备注
}

export interface Horse {
  id: string;
  code: string; // 马匹编号
  name: string;
  breed: string;
  status: HorseStatus;
  owner: string;
  note: string;
  createdAt: number;
}

export interface ShoeChange {
  hoof: Hoof;
  oldShoe: string;
  newShoe: string;
  nails: string; // 钉位
  reason: string;
}

export interface WorkEntry {
  id: string;
  horseId: string;
  date: string; // YYYY-MM-DD
  gait: string;
  gaitNote: string;
  gaitAbnormal: boolean;
  hooves: Record<Hoof, HoofState>;
  shoeChanges: ShoeChange[];
  nextReview: string; // YYYY-MM-DD，空串表示不复查
  note: string;
  photoData: string; // 照片 dataURL，可空
  photoCaption: string;
  farrier: string;
  createdAt: number;
}

export interface Database {
  version: 1;
  horses: Horse[];
  entries: WorkEntry[];
}

export const EMPTY_HOOF: HoofState = { shape: "", balance: "", issues: [], note: "" };

export function emptyHoofMap(): Record<Hoof, HoofState> {
  return {
    LF: { ...EMPTY_HOOF },
    RF: { ...EMPTY_HOOF },
    LH: { ...EMPTY_HOOF },
    RH: { ...EMPTY_HOOF },
  };
}

export function uid(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

// ---------- 日期工具 ----------

export function today(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

/** 相对今天：负数=已逾期，0=今天，正数=还有 N 天，null=无复查 */
export function reviewUrgency(nextReview: string): number | null {
  if (!nextReview) return null;
  return daysBetween(today(), nextReview);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  return iso;
}

// ---------- 排序与选择 ----------

export function entriesOf(db: Database, horseId: string): WorkEntry[] {
  return db.entries
    .filter((e) => e.horseId === horseId)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export function latestEntry(db: Database, horseId: string): WorkEntry | undefined {
  return entriesOf(db, horseId)[0];
}

export function previousEntry(
  db: Database,
  horseId: string,
  before?: string,
): WorkEntry | undefined {
  const list = entriesOf(db, horseId);
  if (!before) return list[1];
  const idx = list.findIndex((e) => e.date === before);
  return idx >= 0 ? list[idx + 1] : list[0];
}

export interface HoofDiff {
  hoof: Hoof;
  addedIssues: string[];
  resolvedIssues: string[];
  shapeChanged: { from: string; to: string } | null;
  shoeChanged: { from: string; to: string } | null;
  hasChange: boolean;
}

export interface EntryDiff {
  perHoof: Record<Hoof, HoofDiff>;
  gaitChanged: { from: string; to: string } | null;
  changeCount: number;
}

function shoeOf(e: WorkEntry, hoof: Hoof): string {
  const c = e.shoeChanges.find((s) => s.hoof === hoof);
  // 更换记录的 newShoe 就是该时点的蹄铁；无更换记录则未知
  return c ? c.newShoe : "";
}

export function diffEntries(prev: WorkEntry | undefined, curr: WorkEntry): EntryDiff {
  const perHoof = {} as Record<Hoof, HoofDiff>;
  let changeCount = 0;
  for (const hoof of HOOVES) {
    const c = curr.hooves[hoof];
    const p = prev?.hooves[hoof];
    const addedIssues = p ? c.issues.filter((i) => !p.issues.includes(i)) : [];
    const resolvedIssues = p ? p.issues.filter((i) => !c.issues.includes(i)) : [];
    const shapeChanged =
      p && c.shape && p.shape && c.shape !== p.shape
        ? { from: p.shape, to: c.shape }
        : null;
    const currShoe = shoeOf(curr, hoof);
    const prevShoe = prev ? shoeOf(prev, hoof) : "";
    const shoeChanged =
      prev && currShoe && prevShoe && currShoe !== prevShoe
        ? { from: prevShoe, to: currShoe }
        : null;
    const hasChange =
      addedIssues.length > 0 || resolvedIssues.length > 0 || !!shapeChanged || !!shoeChanged;
    if (hasChange) changeCount++;
    perHoof[hoof] = { hoof, addedIssues, resolvedIssues, shapeChanged, shoeChanged, hasChange };
  }
  const gaitChanged =
    prev && curr.gait && prev.gait && curr.gait !== prev.gait
      ? { from: prev.gait, to: curr.gait }
      : null;
  if (gaitChanged) changeCount++;
  return { perHoof, gaitChanged, changeCount };
}

/**
 * 某匹马在给定时间点各蹄“当前穿着”的蹄铁：
 * 沿历史倒序，取该蹄最近一次更换记录的 newShoe。
 */
export function currentShoes(db: Database, horseId: string): Partial<Record<Hoof, ShoeChange>> {
  const result: Partial<Record<Hoof, ShoeChange>> = {};
  for (const e of entriesOf(db, horseId)) {
    for (const c of e.shoeChanges) {
      if (!result[c.hoof]) result[c.hoof] = c;
    }
  }
  return result;
}

export interface HorseSummary {
  horse: Horse;
  lastEntry?: WorkEntry;
  nextReview: string;
  urgency: number | null;
  abnormal: boolean;
}

export function horseSummaries(db: Database): HorseSummary[] {
  return db.horses
    .map((horse) => {
      const lastEntry = latestEntry(db, horse.id);
      return {
        horse,
        lastEntry,
        nextReview: lastEntry?.nextReview ?? "",
        urgency: reviewUrgency(lastEntry?.nextReview ?? ""),
        abnormal: !!lastEntry?.gaitAbnormal || HOOVES.some((h) => lastEntry?.hooves[h].issues.length),
      };
    })
    .sort((a, b) => {
      // 逾期/临期优先
      const ua = a.urgency === null ? Number.POSITIVE_INFINITY : a.urgency;
      const ub = b.urgency === null ? Number.POSITIVE_INFINITY : b.urgency;
      if (ua !== ub) return ua - ub;
      return a.horse.code.localeCompare(b.horse.code);
    });
}

export interface Reminder {
  horse: Horse;
  entry: WorkEntry;
  urgency: number;
}

export function dueReminders(db: Database): Reminder[] {
  const out: Reminder[] = [];
  for (const s of horseSummaries(db)) {
    if (s.lastEntry && s.urgency !== null && s.urgency <= 3) {
      out.push({ horse: s.horse, entry: s.lastEntry, urgency: s.urgency });
    }
  }
  return out.sort((a, b) => a.urgency - b.urgency);
}

export function metricStats(db: Database) {
  const since = addDays(today(), -30);
  return {
    horses: db.horses.length,
    pending: horseSummaries(db).filter((s) => s.urgency !== null && s.urgency <= 3).length,
    abnormal: horseSummaries(db).filter((s) => s.abnormal).length,
    shoeChanges30d: db.entries
      .filter((e) => e.date >= since)
      .reduce((n, e) => n + e.shoeChanges.length, 0),
  };
}

// ---------- 导入合并 ----------

export type ConflictChoice = "keep" | "merge";

export interface ImportPreview {
  incoming: Database;
  pairs: {
    incoming: Horse;
    existing?: Horse;
    choice: ConflictChoice;
    entries: WorkEntry[]; // 该马在备份中的工作记录
  }[];
  newCount: number;
  conflictCount: number;
}

export function buildImportPreview(incoming: Database, existing: Database): ImportPreview {
  const pairs = incoming.horses.map((h) => {
    const match = existing.horses.find((x) => x.code.trim() === h.code.trim());
    return {
      incoming: h,
      existing: match,
      choice: (match ? "merge" : "merge") as ConflictChoice, // 新增马一律并入；冲突默认并入，可改保留
      entries: incoming.entries.filter((e) => e.horseId === h.id),
    };
  });
  return {
    incoming,
    pairs,
    newCount: pairs.filter((p) => !p.existing).length,
    conflictCount: pairs.filter((p) => p.existing).length,
  };
}

export function applyImport(db: Database, preview: ImportPreview): Database {
  const horses = [...db.horses];
  const entries = [...db.entries];

  for (const pair of preview.pairs) {
    if (pair.existing) {
      if (pair.choice === "keep") continue; // 保留现有，整匹跳过
      // 并入历史：以现有马 id 为准，备份记录重挂 id、去重（按 createdAt）
      const targetId = pair.existing.id;
      const knownTimes = new Set(entries.filter((e) => e.horseId === targetId).map((e) => e.createdAt));
      for (const e of pair.entries) {
        if (knownTimes.has(e.createdAt)) continue;
        entries.push({ ...e, id: uid("ent"), horseId: targetId });
      }
    } else {
      // 新马：id 冲突时重新生成
      const horseId = horses.some((h) => h.id === pair.incoming.id) ? uid("horse") : pair.incoming.id;
      horses.push({ ...pair.incoming, id: horseId });
      for (const e of pair.entries) {
        entries.push({ ...e, id: uid("ent"), horseId });
      }
    }
  }
  return { version: 1, horses, entries };
}
