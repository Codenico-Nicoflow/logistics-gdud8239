import { describe, expect, it } from 'vitest';
import { expandKit, findGraphProblem, type KitMap } from './kit-graph';

const kits = (entries: Record<string, [string, number][]>): KitMap =>
  new Map(Object.entries(entries).map(([id, lines]) => [id, lines.map(([itemId, quantity]) => ({ itemId, quantity }))]));

describe('expandKit', () => {
  it('returns the lines of the kit, in order', () => {
    const map = kits({ rifle: [['mag', 5], ['sling', 1]] });
    expect([...expandKit(map, 'rifle')]).toEqual([['mag', 5], ['sling', 1]]);
  });

  it('expands a line that is itself the base of a kit (מטולון → M-203)', () => {
    const map = kits({ rifle: [['launcher', 1]], launcher: [['m203', 1]] });
    expect([...expandKit(map, 'rifle')]).toEqual([['launcher', 1], ['m203', 1]]);
  });

  it('multiplies quantities down the chain and merges the same item reached twice', () => {
    const map = kits({ rifle: [['pouch', 2], ['mag', 1]], pouch: [['mag', 3]] });
    const out = expandKit(map, 'rifle');
    expect(out.get('pouch')).toBe(2);
    expect(out.get('mag')).toBe(1 + 2 * 3);
  });

  it('never returns the root item itself', () => {
    const map = kits({ a: [['b', 1]], b: [['a', 1]] });
    expect(expandKit(map, 'a').has('a')).toBe(false);
  });

  it('returns nothing for an item with no kit', () => {
    expect(expandKit(kits({}), 'x').size).toBe(0);
  });
});

describe('findGraphProblem', () => {
  it('accepts a flat kit and a two-level chain', () => {
    expect(findGraphProblem(kits({ a: [['b', 1]] }), 'a')).toBeNull();
    expect(findGraphProblem(kits({ a: [['b', 1]], b: [['c', 1]] }), 'a')).toBeNull();
  });

  it('accepts three levels and refuses four', () => {
    const three = kits({ a: [['b', 1]], b: [['c', 1]], c: [['d', 1]] });
    expect(findGraphProblem(three, 'a')).toBeNull();
    const four = kits({
      a: [['b', 1]],
      b: [['c', 1]],
      c: [['d', 1]],
      d: [['e', 1]],
    });
    expect(findGraphProblem(four, 'a')).toEqual({ kind: 'tooDeep', depth: 4 });
  });

  it('finds a loop and reports its path', () => {
    const map = kits({ a: [['b', 1]], b: [['c', 1]], c: [['a', 1]] });
    expect(findGraphProblem(map, 'a')).toEqual({ kind: 'cycle', path: ['a', 'b', 'c', 'a'] });
  });

  it('finds a loop that does not pass through the start item', () => {
    const map = kits({ a: [['b', 1]], b: [['c', 1]], c: [['b', 1]] });
    expect(findGraphProblem(map, 'a')?.kind).toBe('cycle');
  });
});
