/** 生成短随机 ID，足够本地档案使用 */
export function uid(prefix = ""): string {
  const s =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${s}` : s;
}

/** 当天日期 YYYY-MM-DD（本地时区） */
export function today(): string {
  const d = new Date();
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 在某天基础上加减天数，返回 YYYY-MM-DD */
export function addDays(dateStr: string, days: number): string {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 与今天相差的整天数：负数=已过期，0=今天，正数=还有 N 天 */
export function daysFromToday(dateStr: string): number {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const now = new Date();
  const today0 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return Math.round((target - today0) / 86400000);
}

export function uidForPhoto(): string {
  return uid("photo");
}
