import { describe, expect, it } from 'vitest';
import type { IfsunRecord } from '@prisma/client';
import { renderIfsun } from './ifsun.html';

const unit = { name: 'גדוד 8239', number: '8239' } as never;

describe('renderIfsun', () => {
  it('lets long unbroken text wrap instead of pushing the page sideways', () => {
    const record = {
      soldierNameSnapshot: 'ש'.repeat(300),
      itemNameSnapshot: 'פריט',
      serialSnapshot: '1'.repeat(200),
      quantity: 1,
      status: 'STORED',
      storeSignerName: 'א'.repeat(120),
      storedAt: new Date(),
      storeSignatureImage: null,
      storedByName: 'x',
      notes: 'ה'.repeat(500),
      closeNotes: null,
    } as unknown as IfsunRecord;
    const html = renderIfsun(record, unit, 'n');
    expect(html).toContain('table-layout: fixed');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('minmax(0, 1fr)');
  });
});
