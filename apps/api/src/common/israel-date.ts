const TZ = 'Asia/Jerusalem';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The calendar date in Israel right now (`YYYY-MM-DD`) — not the server's UTC date, which is still "yesterday" until 02:00–03:00. */
export function israelToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** How far Israel's wall clock is ahead of UTC at an instant, in ms (2h or 3h depending on daylight saving). */
function offsetMs(at: number): number {
  const p = Object.fromEntries(parts.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant an Israeli calendar day begins (`YYYY-MM-DD` → 00:00 Israel time). */
export function israelDayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two passes so a day whose midnight sits right on a clock change still lands correctly.
  let guess = wallAsUtc - offsetMs(wallAsUtc);
  guess = wallAsUtc - offsetMs(guess);
  return new Date(guess);
}

/** The last millisecond of an Israeli calendar day — so a "to" date includes that whole day. */
export function israelDayEnd(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(israelDayStart(next).getTime() - 1);
}

/** `iso` shifted by whole calendar days — pure date arithmetic, no timezone can move it. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
