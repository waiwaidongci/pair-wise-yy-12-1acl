// 领域模型：马匹档案、四蹄检查、蹄铁更换、复查提醒

export type HoofKey = "LF" | "RF" | "LH" | "RH";

export const HOOF_KEYS: HoofKey[] = ["LF", "RF", "LH", "RH"];

export const HOOF_LABELS: Record<HoofKey, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export type HorseRole = "运动马" | "休养马" | "教学马";
export const HORSE_ROLES: HorseRole[] = ["运动马", "休养马", "教学马"];

export interface Horse {
  id: string;
  /** 马匹编号，唯一，用于档案识别与备份匹配 */
  code: string;
  name?: string;
  role: HorseRole;
  breed?: string;
  notes?: string;
  createdAt: number;
}

export interface Photo {
  id: string;
  dataUrl: string;
  caption?: string;
}

/** 单只蹄的检查明细 */
export interface HoofDetails {
  /** 蹄形评估 */
  shape: string;
  /** 蹄铁类型（未钉蹄铁 / 铝蹄铁 / …） */
  shoeType: string;
  /** 钉位描述，如 3-4 钉、外侧重钉 */
  nailPositions: string;
  /** 磨耗情况 */
  wear: string;
  /** 异常步态标记 */
  abnormalGait: boolean;
  /** 步态说明 */
  gaitNote?: string;
  note?: string;
}

export type HoofMap = Record<HoofKey, HoofDetails>;

export interface Exam {
  id: string;
  horseId: string;
  /** 检查日期 YYYY-MM-DD */
  date: string;
  gaitSummary?: string;
  hooves: HoofMap;
  photos: Photo[];
  /** 下次复查日期 YYYY-MM-DD */
  nextRecheck?: string;
  note?: string;
  createdAt: number;
}

export type ShoeTarget = HoofKey | "ALL";

export interface ShoeChange {
  id: string;
  horseId: string;
  /** 更换日期 YYYY-MM-DD */
  date: string;
  /** 更换蹄位，ALL 表示四蹄整体更换 */
  hoof: ShoeTarget;
  fromShoe?: string;
  toShoe: string;
  reason?: string;
  nailPositions?: string;
  note?: string;
  createdAt: number;
}

export interface AppState {
  horses: Horse[];
  exams: Exam[];
  shoeChanges: ShoeChange[];
}

/** 持久化事件（只追加，保证已提交记录可追溯、意外关页不丢） */
export type Event =
  | { type: "horse-upsert"; horse: Horse }
  | { type: "horse-delete"; id: string }
  | { type: "exam-add"; exam: Exam }
  | { type: "exam-delete"; id: string }
  | { type: "shoe-add"; change: ShoeChange }
  | { type: "shoe-delete"; id: string }
  | {
      type: "bulk-import";
      horses: Horse[];
      exams: Exam[];
      shoeChanges: ShoeChange[];
    };

/** 检查表单草稿（自动暂存，未提交也不丢） */
export interface ExamDraft {
  date: string;
  nextRecheck: string;
  gaitSummary: string;
  note: string;
  hooves: HoofMap;
  photos: Photo[];
}

export interface ShoeDraft {
  date: string;
  hoof: ShoeTarget;
  fromShoe: string;
  toShoe: string;
  reason: string;
  nailPositions: string;
  note: string;
}

// ---- 下拉选项 ----

export const SHAPE_OPTIONS = [
  "正常",
  "蹄壁偏长",
  "蹄底过厚",
  "裂纹",
  "崩损",
  "角质脆弱",
  "白线异常",
  "感染迹象",
];

export const SHOE_OPTIONS = [
  "未钉蹄铁",
  "普通钢蹄铁",
  "铝蹄铁",
  "塑料蹄铁",
  "加护蹄垫",
  "矫正蹄铁",
  "治疗蹄铁",
];

export const WEAR_OPTIONS = [
  "正常",
  "轻微磨耗",
  "外侧偏磨",
  "内侧偏磨",
  "蹄尖磨耗",
  "过度磨耗",
];

export const SHOE_REASONS = [
  "例行更换",
  "磨耗报废",
  "蹄铁松动脱落",
  "裂纹加护",
  "步态矫正",
  "治疗需要",
];

export function emptyHoof(): HoofDetails {
  return {
    shape: "正常",
    shoeType: "普通钢蹄铁",
    nailPositions: "",
    wear: "正常",
    abnormalGait: false,
    gaitNote: "",
    note: "",
  };
}

export function emptyHoofMap(): HoofMap {
  return {
    LF: emptyHoof(),
    RF: emptyHoof(),
    LH: emptyHoof(),
    RH: emptyHoof(),
  };
}
