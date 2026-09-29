import type {
  AppState,
  Exam,
  Horse,
  ShoeChange,
  ShoeTarget,
} from "../types";
import { findHorseByCode } from "./selectors";
import { toDateStr, uid } from "./utils";

export interface BackupFile {
  format: "farrier-backup";
  version: 1;
  exportedAt: string;
  app: "马术蹄铁修整档案";
  state: AppState;
}

export function createBackup(state: AppState): BackupFile {
  return {
    format: "farrier-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "马术蹄铁修整档案",
    state,
  };
}

export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `蹄铁档案备份-${toDateStr(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ParsedBackup {
  horses: Horse[];
  exams: Exam[];
  shoeChanges: ShoeChange[];
  exportedAt?: string;
}

export function parseBackupText(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON，请选择本系统导出的备份文件。");
  }
  const obj = data as Partial<BackupFile>;
  if (!obj || obj.format !== "farrier-backup" || !obj.state) {
    throw new Error("无法识别的备份格式，请确认文件由本系统导出。");
  }
  const state = obj.state as Partial<AppState>;
  return {
    horses: Array.isArray(state.horses) ? (state.horses as Horse[]) : [],
    exams: Array.isArray(state.exams) ? (state.exams as Exam[]) : [],
    shoeChanges: Array.isArray(state.shoeChanges)
      ? (state.shoeChanges as ShoeChange[])
      : [],
    exportedAt: obj.exportedAt,
  };
}

// ---- 导入冲突分析 ----

export type ConflictChoice = "keep" | "merge";

export interface ConflictRow {
  /** 备份里的马（待导入） */
  backupHorse: Horse;
  /** 现有档案里同编号的马 */
  existingHorse: Horse;
  choice: ConflictChoice;
  examCount: number;
  shoeCount: number;
  latestDate: string;
}

export interface ImportPlan {
  parsed: ParsedBackup;
  /** 备份中全新的马（编号不冲突） */
  newHorses: Horse[];
  /** 编号冲突，需要蹄铁师定夺 */
  conflicts: ConflictRow[];
  newExamCount: number;
  newShoeCount: number;
}

function lastDate(parsed: ParsedBackup, horseId: string): string {
  const dates = [
    ...parsed.exams
      .filter((e) => e.horseId === horseId)
      .map((e) => e.date),
    ...parsed.shoeChanges
      .filter((s) => s.horseId === horseId)
      .map((s) => s.date),
  ];
  return dates.sort().reverse()[0] ?? "—";
}

export function analyzeImport(
  current: AppState,
  parsed: ParsedBackup
): ImportPlan {
  const newHorses: Horse[] = [];
  const conflicts: ConflictRow[] = [];

  for (const backupHorse of parsed.horses) {
    const existing = findHorseByCode(current, backupHorse.code);
    const examCount = parsed.exams.filter(
      (e) => e.horseId === backupHorse.id
    ).length;
    const shoeCount = parsed.shoeChanges.filter(
      (s) => s.horseId === backupHorse.id
    ).length;
    if (existing) {
      conflicts.push({
        backupHorse,
        existingHorse: existing,
        choice: "merge",
        examCount,
        shoeCount,
        latestDate: lastDate(parsed, backupHorse.id),
      });
    } else {
      newHorses.push(backupHorse);
    }
  }

  return {
    parsed,
    newHorses,
    conflicts,
    newExamCount: parsed.exams.length,
    newShoeCount: parsed.shoeChanges.length,
  };
}

// ---- 按选择生成最终导入数据（重新分配 id、去重） ----

function examChecksum(e: Exam): string {
  return [
    e.horseId,
    e.date,
    e.gaitSummary ?? "",
    e.note ?? "",
    e.nextRecheck ?? "",
    JSON.stringify(e.hooves),
  ].join("|");
}

function shoeChecksum(s: ShoeChange): string {
  return [
    s.horseId,
    s.date,
    s.hoof,
    s.fromShoe ?? "",
    s.toShoe,
    s.reason ?? "",
    s.nailPositions ?? "",
  ].join("|");
}

export interface ImportPayload {
  horses: Horse[];
  exams: Exam[];
  shoeChanges: ShoeChange[];
  /** 并入时跳过的重复检查条数 */
  duplicatedExams: number;
  duplicatedShoes: number;
  importedHorseCount: number;
}

export function buildImportPayload(
  current: AppState,
  plan: ImportPlan
): ImportPayload {
  const horses: Horse[] = [];
  const exams: Exam[] = [];
  const shoeChanges: ShoeChange[] = [];
  const seenExam = new Set(
    current.exams.map(examChecksum)
  );
  const seenShoe = new Set(
    current.shoeChanges.map(shoeChecksum)
  );
  let duplicatedExams = 0;
  let duplicatedShoes = 0;
  let importedHorseCount = 0;

  const addExam = (e: Exam, horseId: string) => {
    const remapped: Exam = {
      ...e,
      id: uid("e"),
      horseId,
      photos: Array.isArray(e.photos) ? e.photos : [],
      hooves: e.hooves,
    };
    const sum = examChecksum(remapped);
    if (seenExam.has(sum)) {
      duplicatedExams += 1;
      return;
    }
    seenExam.add(sum);
    exams.push(remapped);
  };

  const addShoe = (s: ShoeChange, horseId: string) => {
    const hoof: ShoeTarget = s.hoof ?? "ALL";
    const remapped: ShoeChange = {
      ...s,
      id: uid("s"),
      horseId,
      hoof,
    };
    const sum = shoeChecksum(remapped);
    if (seenShoe.has(sum)) {
      duplicatedShoes += 1;
      return;
    }
    seenShoe.add(sum);
    shoeChanges.push(remapped);
  };

  // 全新马匹：分配新 id，其下检查/换蹄记录一并重挂
  for (const backupHorse of plan.newHorses) {
    const newId = uid("h");
    horses.push({ ...backupHorse, id: newId });
    importedHorseCount += 1;
    plan.parsed.exams
      .filter((e) => e.horseId === backupHorse.id)
      .forEach((e) => addExam(e, newId));
    plan.parsed.shoeChanges
      .filter((s) => s.horseId === backupHorse.id)
      .forEach((s) => addShoe(s, newId));
  }

  // 冲突马匹：按蹄铁师选择处理
  for (const c of plan.conflicts) {
    if (c.choice === "keep") {
      // 保留现有记录：整匹马及其历史全部跳过
      continue;
    }
    // 并入历史：挂到现有马 id 下；档案资料以现有为准
    const targetId = c.existingHorse.id;
    plan.parsed.exams
      .filter((e) => e.horseId === c.backupHorse.id)
      .forEach((e) => addExam(e, targetId));
    plan.parsed.shoeChanges
      .filter((s) => s.horseId === c.backupHorse.id)
      .forEach((s) => addShoe(s, targetId));
  }

  return {
    horses,
    exams,
    shoeChanges,
    duplicatedExams,
    duplicatedShoes,
    importedHorseCount,
  };
}
