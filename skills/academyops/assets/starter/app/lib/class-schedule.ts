export type LessonSlot = { date: string; time: string };

export function validScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function timeRange(value: string) {
  const match = value.match(/(\d{1,2}:\d{2})\s*[–—－-]\s*(\d{1,2}:\d{2})/);
  return match ? `${match[1].padStart(5, "0")}–${match[2].padStart(5, "0")}` : "";
}

export function validScheduleTime(value: string) {
  const match = /^(\d{2}):(\d{2})–(\d{2}):(\d{2})$/.exec(timeRange(value));
  if (!match) return false;
  const [, h1, m1, h2, m2] = match.map(Number);
  return h1 < 24 && h2 < 24 && m1 < 60 && m2 < 60 && h2 * 60 + m2 > h1 * 60 + m1;
}

export function parseLessonSlots(value: unknown, fallbackTime = ""): LessonSlot[] {
  return String(value || "").split(/\n|[;；]/).flatMap((line) => {
    const date = line.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return date ? [{ date, time: timeRange(line) || timeRange(fallbackTime) }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function weeklySlots(startDate: string, count: number, time: string): LessonSlot[] {
  if (!validScheduleDate(startDate) || !Number.isInteger(count) || count < 1 || count > 200) return [];
  const first = new Date(`${startDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index * 7);
    return { date: date.toISOString().slice(0, 10), time: timeRange(time) };
  });
}

export function nextWeekday(date: string, weekday: number, strictlyAfter = false) {
  if (!validScheduleDate(date) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "";
  const value = new Date(`${date}T00:00:00Z`);
  let offset = (weekday - value.getUTCDay() + 7) % 7;
  if (strictlyAfter && offset === 0) offset = 7;
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function serializeSlots(slots: LessonSlot[]) {
  return slots.map((slot) => `${slot.date} ${timeRange(slot.time)}`).join("\n");
}

export function validateLessonSlots(slots: LessonSlot[]) {
  if (!slots.length || slots.length > 200) return "请安排 1–200 节课";
  const keys = new Set<string>();
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!validScheduleDate(slot.date)) return `第 ${index + 1} 节课日期不正确`;
    if (!validScheduleTime(slot.time)) return `第 ${index + 1} 节课请填写有效的开始和结束时间`;
    const key = `${slot.date} ${timeRange(slot.time)}`;
    if (keys.has(key)) return `第 ${index + 1} 节课与其他课次重复`;
    keys.add(key);
  }
  return "";
}

export function normalizeSpecificSchedule(value: string, fallbackTime: string) {
  if (value.length > 8000) throw new Error("课表内容过长，请限制在 200 节以内");
  if (value.split(/\n|[;；]/).some((line) => line.trim() && !/^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(line.trim()))) {
    throw new Error("课表每行须以 YYYY-MM-DD 日期开头");
  }
  const slots = parseLessonSlots(value, fallbackTime);
  const error = validateLessonSlots(slots);
  if (error) throw new Error(error);
  return { startDate: slots[0].date, endDate: slots.at(-1)!.date, specificDates: serializeSlots(slots) };
}
