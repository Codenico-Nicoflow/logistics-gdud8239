/**
 * The optional parts of the product. Everything not listed here is core and always on: soldiers, the
 * catalog, ניפוק and signatures, counts, movements, reports, users, companies.
 *
 * A battalion's super admin switches these on and off. The manifest is the one place that says what
 * depends on what, so a switch can never leave a module running without something it needs.
 */
export const MODULE_IDS = ['companySplit', 'attendance', 'kits'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleManifest = Record<ModuleId, { requires: readonly ModuleId[] }>;

/** None of today's modules needs another one; the field exists so the first that does cannot be forgotten. */
export const MODULE_MANIFEST: ModuleManifest = {
  companySplit: { requires: [] },
  attendance: { requires: [] },
  kits: { requires: [] },
};

export type ModuleState = Record<ModuleId, boolean>;

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

/** Why the switch is refused, in Hebrew for the admin, or null when it is allowed. */
export function toggleRefusal(
  manifest: ModuleManifest,
  state: ModuleState,
  id: ModuleId,
  on: boolean,
  nameOf: (id: ModuleId) => string,
): string | null {
  if (on) {
    const missing = manifest[id].requires.filter((dep) => !state[dep]);
    if (missing.length > 0) return `כדי להפעיל את ${nameOf(id)} יש להפעיל קודם: ${missing.map(nameOf).join(', ')}`;
    return null;
  }
  const dependants = MODULE_IDS.filter((other) => other !== id && state[other] && manifest[other].requires.includes(id));
  if (dependants.length > 0) return `לא ניתן לכבות את ${nameOf(id)}: ${dependants.map(nameOf).join(', ')} תלוי בו`;
  return null;
}
