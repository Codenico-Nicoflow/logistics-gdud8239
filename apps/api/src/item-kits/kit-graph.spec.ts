import { describe, expect, it } from 'vitest';
import { expandKit, findGraphProblem, type KitMap } from './kit-graph';

const kits = (entries: Record<string, [string, number, 'ALWAYS' | 'IF_ALLOCATED'][]>): KitMap =>
  new Map(Object.entries(entries).map(([id, lines]) => [id, lines.map(([itemId, quantity, mode]) => ({ itemId, quantity, mode }))]));

const none = new Set<string>();

describe('expandKit', () => {
  it('returns ALWAYS lines and skips IF_ALLOCATED lines the soldier does not hold', () => {
    const map = kits({ rifle: [['mag', 5, 'ALWAYS'], ['scope', 1, 'IF_ALLOCATED']] });
    expect([...expandKit(map, 'rifle', { includeOptional: true, allocatedItemIds: none })]).toEqual([['mag', 5]]);
  });

  it('adds an IF_ALLOCATED line when the soldier is allocated it', () => {
    const map = kits({ rifle: [['mag', 5, 'ALWAYS'], ['scope', 1, 'IF_ALLOCATED']] });
    const out = expandKit(map, 'rifle', { includeOptional: true, allocatedItemIds: new Set(['scope']) });
    expect([...out]).toEqual([['mag', 5], ['scope', 1]]);
  });

  it('ignores allocations entirely when only ALWAYS lines are wanted', () => {
    const map = kits({ rifle: [['scope', 1, 'IF_ALLOCATED']] });
    const out = expandKit(map, 'rifle', { includeOptional: false, allocatedItemIds: new Set(['scope']) });
    expect(out.size).toBe(0);
  });

  it('expands a line that is itself the base of a kit (מטולון → M-203)', () => {
    const map = kits({ rifle: [['launcher', 1, 'IF_ALLOCATED']], launcher: [['m203', 1, 'ALWAYS']] });
    const out = expandKit(map, 'rifle', { includeOptional: true, allocatedItemIds: new Set(['launcher']) });
    expect([...out]).toEqual([['launcher', 1], ['m203', 1]]);
  });

  it('does not expand the nested kit of a line that was not included', () => {
    const map = kits({ rifle: [['launcher', 1, 'IF_ALLOCATED']], launcher: [['m203', 1, 'ALWAYS']] });
    expect(expandKit(map, 'rifle', { includeOptional: true, allocatedItemIds: none }).size).toBe(0);
  });

  it('multiplies quantities down the chain and merges the same item reached twice', () => {
    const map = kits({
      rifle: [['pouch', 2, 'ALWAYS'], ['mag', 1, 'ALWAYS']],
      pouch: [['mag', 3, 'ALWAYS']],
    });
    const out = expandKit(map, 'rifle', { includeOptional: false, allocatedItemIds: none });
    expect(out.get('pouch')).toBe(2);
    expect(out.get('mag')).toBe(1 + 2 * 3);
  });

  it('never returns the root item itself', () => {
    const map = kits({ a: [['b', 1, 'ALWAYS']], b: [['a', 1, 'ALWAYS']] });
    expect(expandKit(map, 'a', { includeOptional: false, allocatedItemIds: none }).has('a')).toBe(false);
  });

  it('returns nothing for an item with no kit', () => {
    expect(expandKit(kits({}), 'x', { includeOptional: true, allocatedItemIds: none }).size).toBe(0);
  });
});

describe('findGraphProblem', () => {
  it('accepts a flat kit and a two-level chain', () => {
    expect(findGraphProblem(kits({ a: [['b', 1, 'ALWAYS']] }), 'a')).toBeNull();
    expect(findGraphProblem(kits({ a: [['b', 1, 'ALWAYS']], b: [['c', 1, 'ALWAYS']] }), 'a')).toBeNull();
  });

  it('accepts three levels and refuses four', () => {
    const three = kits({ a: [['b', 1, 'ALWAYS']], b: [['c', 1, 'ALWAYS']], c: [['d', 1, 'ALWAYS']] });
    expect(findGraphProblem(three, 'a')).toBeNull();
    const four = kits({
      a: [['b', 1, 'ALWAYS']],
      b: [['c', 1, 'ALWAYS']],
      c: [['d', 1, 'ALWAYS']],
      d: [['e', 1, 'ALWAYS']],
    });
    expect(findGraphProblem(four, 'a')).toEqual({ kind: 'tooDeep', depth: 4 });
  });

  it('finds a loop and reports its path', () => {
    const map = kits({ a: [['b', 1, 'ALWAYS']], b: [['c', 1, 'ALWAYS']], c: [['a', 1, 'ALWAYS']] });
    expect(findGraphProblem(map, 'a')).toEqual({ kind: 'cycle', path: ['a', 'b', 'c', 'a'] });
  });

  it('finds a loop that does not pass through the start item', () => {
    const map = kits({ a: [['b', 1, 'ALWAYS']], b: [['c', 1, 'ALWAYS']], c: [['b', 1, 'ALWAYS']] });
    expect(findGraphProblem(map, 'a')?.kind).toBe('cycle');
  });
});
