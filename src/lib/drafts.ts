import {
  emptyHoofMap,
  type ExamDraft,
  type ShoeDraft,
} from "../types";
import { addDays, today } from "./utils";

const EXAM_PREFIX = "farrier.draft.exam.";
const SHOE_PREFIX = "farrier.draft.shoe.";

/** 检查表单草稿：每匹马一份，自动暂存，未提交也不丢 */
export function newExamDraft(
  prefills?: Partial<ExamDraft>
): ExamDraft {
  return {
    date: today(),
    nextRecheck: addDays(today(), 14),
    gaitSummary: "",
    note: "",
    hooves: emptyHoofMap(),
    photos: [],
    ...prefills,
  };
}

export function newShoeDraft(prefills?: Partial<ShoeDraft>): ShoeDraft {
  return {
    date: today(),
    hoof: "ALL",
    fromShoe: "",
    toShoe: "普通钢蹄铁",
    reason: "例行更换",
    nailPositions: "",
    note: "",
    ...prefills,
  };
}

export function loadExamDraft(horseId: string): ExamDraft | undefined {
  try {
    const raw = localStorage.getItem(EXAM_PREFIX + horseId);
    return raw ? (JSON.parse(raw) as ExamDraft) : undefined;
  } catch {
    return undefined;
  }
}

export function saveExamDraft(horseId: string, draft: ExamDraft): boolean {
  try {
    localStorage.setItem(EXAM_PREFIX + horseId, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearExamDraft(horseId: string): void {
  localStorage.removeItem(EXAM_PREFIX + horseId);
}

export function loadShoeDraft(horseId: string): ShoeDraft | undefined {
  try {
    const raw = localStorage.getItem(SHOE_PREFIX + horseId);
    return raw ? (JSON.parse(raw) as ShoeDraft) : undefined;
  } catch {
    return undefined;
  }
}

export function saveShoeDraft(horseId: string, draft: ShoeDraft): boolean {
  try {
    localStorage.setItem(SHOE_PREFIX + horseId, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearShoeDraft(horseId: string): void {
  localStorage.removeItem(SHOE_PREFIX + horseId);
}
