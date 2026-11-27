import { describe, expect, it } from 'vitest';
import { withoutSystemNote } from './system-notes';

describe('withoutSystemNote', () => {
  it('drops a form note that is only the system sentence, with or without its date', () => {
    expect(withoutSystemNote('מחליף טופס 1008 מספר 393 (27.11.2026)')).toBeNull();
    expect(withoutSystemNote('מחליף טופס 1008 מספר 393')).toBeNull();
  });

  it('keeps what the operator wrote next to it', () => {
    expect(withoutSystemNote('מחליף טופס 1008 מספר 393 (27.11.2026) — הערה שלי')).toBe('הערה שלי');
  });

  it('reads a movement note as the edit it was, without the form it replaced', () => {
    expect(withoutSystemNote('עריכת טופס — מחליף טופס 1008 מספר 393 (27.11.2026)')).toBe('עריכת טופס');
    expect(withoutSystemNote('עריכת טופס — מחליף טופס 1008 מספר 393')).toBe('עריכת טופס');
  });

  it('leaves every other note exactly as it is', () => {
    expect(withoutSystemNote(null)).toBeNull();
    expect(withoutSystemNote('החזרה רגילה')).toBe('החזרה רגילה');
    expect(withoutSystemNote('מחליף את הרצועה')).toBe('מחליף את הרצועה');
    expect(withoutSystemNote('טופס 1008 מספר 393')).toBe('טופס 1008 מספר 393');
  });
});
