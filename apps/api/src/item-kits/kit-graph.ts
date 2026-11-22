export type KitLineSpec = { itemId: string; quantity: number };

/** base item id → its lines. An item with no entry has no kit. */
export type KitMap = ReadonlyMap<string, readonly KitLineSpec[]>;

/**
 * How many kits may sit inside one another (M-4 → מטולון → M-203 is two). Deep enough for every real
 * case, shallow enough that a mistaken chain cannot silently turn one rifle into a page of lines.
 */
export const MAX_KIT_DEPTH = 3;

export type GraphProblem = { kind: 'cycle'; path: string[] } | { kind: 'tooDeep'; depth: number };

/** Looks for a loop or a chain deeper than MAX_KIT_DEPTH reachable from `startId`. */
export function findGraphProblem(kits: KitMap, startId: string): GraphProblem | null {
  const onPath: string[] = [];
  let deepest = 0;
  let cycle: string[] | null = null;

  const walk = (id: string, depth: number): void => {
    if (cycle) return;
    const loopAt = onPath.indexOf(id);
    if (loopAt !== -1) {
      cycle = [...onPath.slice(loopAt), id];
      return;
    }
    const lines = kits.get(id);
    if (!lines || lines.length === 0) return;
    deepest = Math.max(deepest, depth);
    onPath.push(id);
    for (const line of lines) walk(line.itemId, depth + 1);
    onPath.pop();
  };

  walk(startId, 1);
  if (cycle) return { kind: 'cycle', path: cycle };
  if (deepest > MAX_KIT_DEPTH) return { kind: 'tooDeep', depth: deepest };
  return null;
}

/**
 * Everything that always goes out with `rootId`: its own lines, then the lines of any kit those lines are
 * themselves the base of (מטולון → M-203), multiplying quantities down the chain and merging repeats. The
 * root itself is never part of the result. Insertion order is kept so the basket lists lines the way the
 * kit does.
 */
export function expandKit(kits: KitMap, rootId: string): Map<string, number> {
  const out = new Map<string, number>();

  const walk = (id: string, multiplier: number, depth: number): void => {
    if (depth > MAX_KIT_DEPTH) return;
    for (const line of kits.get(id) ?? []) {
      if (line.itemId === rootId) continue;
      const quantity = line.quantity * multiplier;
      out.set(line.itemId, (out.get(line.itemId) ?? 0) + quantity);
      walk(line.itemId, quantity, depth + 1);
    }
  };

  walk(rootId, 1, 1);
  return out;
}
