import { describe, expect, it } from 'vitest';
import { isModuleId, toggleRefusal, type ModuleManifest, type ModuleState } from './module-manifest';

// A manifest where kits needs companySplit, to prove the rule works before a real module needs it.
const manifest: ModuleManifest = {
  companySplit: { requires: [] },
  attendance: { requires: [] },
  kits: { requires: ['companySplit'] },
};
const name = (id: string): string => id;
const state = (over: Partial<ModuleState>): ModuleState => ({ companySplit: true, attendance: true, kits: true, ...over });

describe('toggleRefusal', () => {
  it('refuses turning a module on while what it needs is off', () => {
    expect(toggleRefusal(manifest, state({ companySplit: false, kits: false }), 'kits', true, name)).toContain('companySplit');
  });

  it('refuses turning a module off while an enabled one depends on it', () => {
    expect(toggleRefusal(manifest, state({}), 'companySplit', false, name)).toContain('kits');
  });

  it('allows turning it off once the dependant is off, and anything with no dependency', () => {
    expect(toggleRefusal(manifest, state({ kits: false }), 'companySplit', false, name)).toBeNull();
    expect(toggleRefusal(manifest, state({}), 'attendance', false, name)).toBeNull();
    expect(toggleRefusal(manifest, state({ attendance: false }), 'attendance', true, name)).toBeNull();
  });
});

describe('isModuleId', () => {
  it('recognises only the real ones', () => {
    expect(isModuleId('kits')).toBe(true);
    expect(isModuleId('core')).toBe(false);
  });
});
