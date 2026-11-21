const TZ = 'Asia/Jerusalem';

/**
 * Today's date in Israel (`YYYY-MM-DD`). Not `new Date().toISOString()`, which
 * is the UTC date and still says "yesterday" between midnight and 02:00–03:00
 * here — exactly when the late evening count and מסכם get filled in.
 */
export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** `iso` shifted by whole days. Pure calendar arithmetic, so no timezone can move it. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
