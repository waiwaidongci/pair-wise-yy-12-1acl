import { useSyncExternalStore } from "react";
import { store } from "./store";
import {
  HOOF_KEYS,
  type AppState,
  type Exam,
  type Horse,
  type ShoeChange,
} from "../types";
import { daysFromToday } from "./utils";

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function latestExam(state: AppState, horseId: string): Exam | undefined {
  return state.exams
    .filter((e) => e.horseId === horseId)
    .sort(byDateDesc)[0];
}

export function previousExam(
  state: AppState,
  horseId: string,
  examId: string
): Exam | undefined {
  const list = state.exams
    .filter((e) => e.horseId === horseId)
    .sort(byDateDesc);
  const i = list.findIndex((e) => e.id === examId);
  return i >= 0 ? list[i + 1] : undefined;
}

export const byDateDesc = (a: Exam | ShoeChange, b: Exam | ShoeChange) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

export function horseExams(state: AppState, horseId: string): Exam[] {
  return state.exams
    .filter((e) => e.horseId === horseId)
    .sort(byDateDesc);
}

export function horseShoes(state: AppState, horseId: string): ShoeChange[] {
  return state.shoeChanges
    .filter((s) => s.horseId === horseId)
    .sort(byDateDesc);
}

export type RecheckStatus = "overdue" | "today" | "soon" | "future" | "none";

export interface RecheckItem {
  horse: Horse;
  exam: Exam;
  daysLeft: number;
  status: RecheckStatus;
}

/** 每匹马取最近一次检查上的下次复查日期 */
export function recheckList(
  state: AppState,
  withinDays = 14
): RecheckItem[] {
  const items: RecheckItem[] = [];
  for (const horse of state.horses) {
    const exam = latestExam(state, horse.id);
    if (!exam?.nextRecheck) continue;
    const daysLeft = daysFromToday(exam.nextRecheck);
    let status: RecheckStatus;
    if (daysLeft < 0) status = "overdue";
    else if (daysLeft === 0) status = "today";
    else if (daysLeft <= withinDays) status = "soon";
    else continue; // 更远的复查不进提醒列表
    items.push({ horse, exam, daysLeft, status });
  }
  const order: Record<RecheckStatus, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
    future: 3,
    none: 4,
  };
  return items.sort(
    (a, b) =>
      order[a.status] - order[b.status] || a.daysLeft - b.daysLeft
  );
}

export function abnormalHorseCount(state: AppState): number {
  return state.horses.filter((h) => {
    const e = latestExam(state, h.id);
    return e ? HOOF_KEYS.some((k) => e.hooves[k].abnormalGait) : false;
  }).length;
}

export function findHorseByCode(
  state: AppState,
  code: string
): Horse | undefined {
  const norm = code.trim().toLowerCase();
  return state.horses.find((h) => h.code.trim().toLowerCase() === norm);
}
