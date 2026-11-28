import { z } from 'zod';
import type { AuthUser, Item, SoldierSummary } from '../../lib/types';
import type { BasketLine } from './BasketStep';

/**
 * An unsigned ניפוק, kept on the device so a slip does not cost the operator the basket they built.
 * On a phone a tap on the wrong thing, a reload, or Safari discarding a background tab all remount the
 * page; without this the soldier's items, מסדים, notes and receipt number are gone. One draft per
 * soldier, so stepping back to the search and picking the same soldier again brings his basket back.
 * The signature is never stored: it is the soldier's, drawn once, for exactly what is on screen.
 */
const KEY = 'issue-drafts-v1';
/**
 * Drafts live under a key of their own per battalion and per person. One shared key meant that switching into
 * another battalion (or another operator picking up the same tablet) resumed the last basket, with a soldier of the
 * wrong battalion on screen.
 */
export function draftScope(user: Pick<AuthUser, 'id' | 'battalionId'>): string {
  return `${user.battalionId}:${user.id}`;
}
const keyFor = (scope: string): string => `${KEY}:${scope}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 20;

export type DraftStep = 'confirm' | 'basket' | 'sign';

export type Draft = {
  soldier: SoldierSummary;
  step: DraftStep;
  lines: BasketLine[];
  receiptNo: string;
  notes: string;
  savedAt: number;
};

const itemShape = z.custom<Item>(
  (v) => typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string' && 'name' in v && typeof v.name === 'string',
);
const soldierShape = z.custom<SoldierSummary>(
  (v) => typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string' && 'firstName' in v && 'lastName' in v,
);
const draftSchema = z.object({
  soldier: soldierShape,
  step: z.enum(['confirm', 'basket', 'sign']),
  lines: z.array(
    z.object({ id: z.string(), item: itemShape, quantity: z.number(), serial: z.string(), lineNotes: z.string() }),
  ),
  receiptNo: z.string(),
  notes: z.string(),
  savedAt: z.number(),
});
const storeSchema = z.object({ active: z.string().nullable(), drafts: z.record(z.string(), draftSchema) });
type Store = z.infer<typeof storeSchema>;

function read(scope: string | null, now: number): Store {
  if (scope === null) return { active: null, drafts: {} };
  try {
    // The shared key of earlier versions: its drafts belong to nobody in particular, so they are dropped.
    localStorage.removeItem(KEY);
    const raw = localStorage.getItem(keyFor(scope));
    if (!raw) return { active: null, drafts: {} };
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { active: null, drafts: {} };
    const drafts = Object.fromEntries(Object.entries(parsed.data.drafts).filter(([, d]) => now - d.savedAt < MAX_AGE_MS));
    const active = parsed.data.active && drafts[parsed.data.active] ? parsed.data.active : null;
    return { active, drafts };
  } catch {
    // Unreadable or storage blocked (private mode): behave as if there were no draft.
    return { active: null, drafts: {} };
  }
}

function write(scope: string | null, store: Store): void {
  if (scope === null) return;
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(store));
  } catch {
    // Full or blocked: the draft is a convenience, never a reason to break the form.
  }
}

/** The draft the operator was in the middle of when the page last went away, if it is still fresh. */
export function loadActiveDraft(scope: string | null, now = Date.now()): Draft | null {
  const store = read(scope, now);
  return store.active ? (store.drafts[store.active] ?? null) : null;
}

export function loadDraft(scope: string | null, soldierId: string, now = Date.now()): Draft | null {
  return read(scope, now).drafts[soldierId] ?? null;
}

/** An empty basket with nothing typed is not worth keeping: it removes the soldier's draft instead. */
export function saveDraft(scope: string | null, draft: Omit<Draft, 'savedAt'>, now = Date.now()): void {
  const store = read(scope, now);
  const empty = draft.lines.length === 0 && draft.receiptNo.trim() === '' && draft.notes.trim() === '';
  if (empty) {
    delete store.drafts[draft.soldier.id];
    if (store.active === draft.soldier.id) store.active = null;
    write(scope, store);
    return;
  }
  store.drafts[draft.soldier.id] = { ...draft, savedAt: now };
  store.active = draft.soldier.id;
  const newest = Object.entries(store.drafts)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_DRAFTS);
  store.drafts = Object.fromEntries(newest);
  write(scope, store);
}

/** The operator left the soldier on purpose (back to the search): keep his draft, stop auto-resuming it. */
export function parkActiveDraft(scope: string | null): void {
  const store = read(scope, Date.now());
  store.active = null;
  write(scope, store);
}

export function clearDraft(scope: string | null, soldierId: string): void {
  const store = read(scope, Date.now());
  delete store.drafts[soldierId];
  if (store.active === soldierId) store.active = null;
  write(scope, store);
}
