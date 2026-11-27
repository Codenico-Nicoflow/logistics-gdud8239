// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Item, SoldierSummary } from '../../lib/types';
import type { BasketLine } from './BasketStep';
import { clearDraft, draftScope, loadActiveDraft, loadDraft, parkActiveDraft, saveDraft } from './issueDraft';

const S = draftScope({ id: 'u1', battalionId: 'b1' });

const soldier = (id: string): SoldierSummary => ({
  id, firstName: 'דנה', lastName: 'כהן', personalNumber: '1234567', phone: null, receiptNo: null, company: 'A',
  isActive: true, isAttached: false, openSignatureCount: 0, isEnlisted: true,
});
const item: Item = {
  id: 'i1', name: 'M-4', aliases: [], category: 'WEAPON', isSerialized: true, inSummary: true, ifsunAllowed: false,
  authorizedQty: 5, yamahQty: 0, repairQty: 0, repairSerials: [], unitPrice: null, isActive: true, defaultQty: 1, unitOfMeasure: "יח'",
};
const line = (serial: string): BasketLine => ({ id: `l-${serial}`, item, quantity: 1, serial, lineNotes: '' });
const draft = (id: string, lines: BasketLine[] = [line('943550')]) => ({
  soldier: soldier(id), step: 'basket' as const, lines, receiptNo: '', notes: '',
});

beforeEach(() => localStorage.clear());

describe('issue draft', () => {
  it('brings back the basket, מסד and notes of the soldier who was being served', () => {
    saveDraft(S, { ...draft('s1'), receiptNo: '77', notes: 'חסר רצועה' });
    const back = loadActiveDraft(S);
    expect(back?.soldier.id).toBe('s1');
    expect(back?.lines[0]?.serial).toBe('943550');
    expect(back?.receiptNo).toBe('77');
    expect(back?.notes).toBe('חסר רצועה');
  });

  it('keeps a soldier\'s draft after the operator steps back to the search, but stops auto-resuming it', () => {
    saveDraft(S, draft('s1'));
    parkActiveDraft(S);
    expect(loadActiveDraft(S)).toBeNull();
    expect(loadDraft(S, 's1')?.lines).toHaveLength(1);
  });

  it('keeps one draft per soldier, so picking another soldier never shows the first one\'s items', () => {
    saveDraft(S, draft('s1', [line('111')]));
    saveDraft(S, draft('s2', [line('222')]));
    expect(loadDraft(S, 's1')?.lines[0]?.serial).toBe('111');
    expect(loadDraft(S, 's2')?.lines[0]?.serial).toBe('222');
  });

  it('drops an emptied basket instead of keeping a blank draft', () => {
    saveDraft(S, draft('s1'));
    saveDraft(S, draft('s1', []));
    expect(loadDraft(S, 's1')).toBeNull();
    expect(loadActiveDraft(S)).toBeNull();
  });

  it('forgets a draft after a day', () => {
    const t0 = Date.parse('2026-11-24T08:00:00Z');
    saveDraft(S, draft('s1'), t0);
    expect(loadDraft(S, 's1', t0 + 23 * 3600_000)).not.toBeNull();
    expect(loadDraft(S, 's1', t0 + 25 * 3600_000)).toBeNull();
  });

  it('clears a signed form\'s draft', () => {
    saveDraft(S, draft('s1'));
    clearDraft(S, 's1');
    expect(loadDraft(S, 's1')).toBeNull();
    expect(loadActiveDraft(S)).toBeNull();
  });

  it('ignores damaged storage rather than breaking the form', () => {
    localStorage.setItem(`issue-drafts-v1:${S}`, '{not json');
    expect(loadActiveDraft(S)).toBeNull();
    localStorage.setItem(`issue-drafts-v1:${S}`, JSON.stringify({ active: 's1', drafts: { s1: { soldier: 5 } } }));
    expect(loadActiveDraft(S)).toBeNull();
  });
});

describe('issue draft scope', () => {
  it('keeps a battalion\'s drafts out of another battalion on the same browser, so a switch never resumes a stranger', () => {
    saveDraft(S, draft('s1'));
    const other = draftScope({ id: 'u2', battalionId: 'b2' });
    expect(loadActiveDraft(other)).toBeNull();
    expect(loadDraft(other, 's1')).toBeNull();
    // And it is still there for its own owner.
    expect(loadActiveDraft(S)?.soldier.id).toBe('s1');
  });

  it('keeps one operator\'s draft from another on the same battalion', () => {
    saveDraft(S, draft('s1'));
    expect(loadActiveDraft(draftScope({ id: 'u9', battalionId: 'b1' }))).toBeNull();
  });

  it('keeps nothing and shows nothing when nobody is known yet', () => {
    saveDraft(null, draft('s1'));
    expect(loadActiveDraft(null)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('drops the shared key that earlier versions wrote, which belongs to nobody in particular', () => {
    localStorage.setItem('issue-drafts-v1', JSON.stringify({ active: 's1', drafts: {} }));
    expect(loadActiveDraft(S)).toBeNull();
    expect(localStorage.getItem('issue-drafts-v1')).toBeNull();
  });
});
