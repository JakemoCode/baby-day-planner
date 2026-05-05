const TIME_RE = /^(\d{2}):(\d{2})$/;

export function parseTime(s: string): number {
  const m = TIME_RE.exec(s);
  if (!m) throw new Error(`Invalid time: ${s}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid time: ${s}`);
  }
  if (minutes < 0 || minutes > 59) throw new Error(`Invalid minutes: ${s}`);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes: number): string {
  if (totalMinutes < 0) throw new Error(`Negative minutes: ${totalMinutes}`);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutes(time: string, minutes: number): string {
  return formatTime(parseTime(time) + minutes);
}

export function diffMinutes(a: string, b: string): number {
  return parseTime(a) - parseTime(b);
}

export function clampTime(time: string, min: string, max: string): string {
  const t = parseTime(time);
  const lo = parseTime(min);
  const hi = parseTime(max);
  if (t < lo) return min;
  if (t > hi) return max;
  return time;
}

export function formatTimeForDisplay(time: string): string {
  const totalMinutes = parseTime(time) % (24 * 60);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
