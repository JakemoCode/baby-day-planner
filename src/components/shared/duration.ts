/**
 * Format/parse helpers for h:mm duration inputs. Stored as minutes; displayed
 * as h:mm. Bare numeric input ("85") is treated as raw minutes so users can
 * still type quickly without a colon.
 */

export function formatMinutesAsHHMM(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "0:00";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse "1:25", "0:45", "85" into minutes. Returns null for invalid input
 * so callers can distinguish "user is mid-typing" from a committed value.
 */
export function parseHHMMToMinutes(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  if (s.includes(":")) {
    const [hStr, mStr] = s.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || m < 0 || m >= 60) return null;
    return h * 60 + m;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
