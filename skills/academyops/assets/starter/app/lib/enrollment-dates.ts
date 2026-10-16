import { validScheduleDate } from "./class-schedule";

// Resolve against the current class on the server, so a stale form cannot
// accidentally submit an outdated class end date as a personal override.
export function resolveEnrollmentEndDate(requested: unknown, classEndDate: unknown, mode?: unknown) {
  const entered = String(requested ?? "").trim();
  const fallback = String(classEndDate ?? "").trim();
  const value = mode === "class" ? fallback : entered || fallback;
  if (!value) return null;
  if (!validScheduleDate(value)) throw new Error("结束日期格式不正确");
  return value;
}
