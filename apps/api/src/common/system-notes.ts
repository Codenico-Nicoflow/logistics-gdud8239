/**
 * The sentence "מחליף טופס 1008 מספר N (date)" that a reissue used to type into notes: it is the system's
 * bookkeeping, not something the operator wrote, and it is of no use to the person reading the form. Forms and
 * movements are append-only, so the stored text of older rows cannot be rewritten; it is taken out when read.
 * Whatever else was written next to it is kept ("עריכת טופס — מחליף טופס 1008 מספר 393" reads "עריכת טופס").
 */
const SYSTEM_NOTE = /\s*(?:—\s*)?מחליף טופס 1008 מספר \d+(?:\s*\([^)]*\))?\s*(?:—\s*)?/g;

export function withoutSystemNote(notes: string | null): string | null {
  if (notes === null) return null;
  const cleaned = notes.replace(SYSTEM_NOTE, ' ').trim();
  return cleaned === '' ? null : cleaned;
}
