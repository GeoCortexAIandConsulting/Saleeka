/**
 * The launch deadline for the countdown: NEXT_PUBLIC_LAUNCH_ENDS, e.g. "2026-12-03T23:59:59" or just
 * "2026-12-03" (the end of that day), read as Pakistan time (UTC+5) unless it names its own offset.
 * Keep it equal to the server's LAUNCH_ENDS.
 */
export function pakistanTime(s: string | undefined): number | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t.length === 10 ? `${t}T23:59:59` : t}+05:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** Unset: the end of 3 Dec 2026, Pakistan time (the server's default too). */
export const LAUNCH_ENDS = pakistanTime(process.env.NEXT_PUBLIC_LAUNCH_ENDS) ?? pakistanTime('2026-12-03')!;

/** Days, hours, minutes and seconds left (all 0 once it has passed). */
export function timeLeft(ends: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((ends - now) / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, over: s === 0 };
}

/** "3 Dec, 11:59 pm" in Pakistan time, for the countdown's label. */
export const deadlineLabel = (ends: number) =>
  new Date(ends).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
