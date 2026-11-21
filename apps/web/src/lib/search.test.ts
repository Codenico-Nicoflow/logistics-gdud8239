import { describe, expect, it } from 'vitest';
import { itemMatches, normalizeSearch } from './search';

const m4 = { name: 'M-4', aliases: ['קרבין'] };

describe('item search', () => {
  it('ignores case', () => {
    expect(itemMatches(m4, normalizeSearch('m-4'))).toBe(true);
    expect(itemMatches(m4, normalizeSearch('M-4'))).toBe(true);
    expect(itemMatches({ name: 'אקילה X4', aliases: [] }, normalizeSearch('x4'))).toBe(true);
  });

  it('ignores surrounding spaces and matches aliases', () => {
    expect(itemMatches(m4, normalizeSearch('  קרב '))).toBe(true);
  });

  it('an empty query matches everything and a miss does not', () => {
    expect(itemMatches(m4, '')).toBe(true);
    expect(itemMatches(m4, normalizeSearch('מאג'))).toBe(false);
  });
});
