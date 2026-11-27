import { useState } from 'react';
import { useSetModuleMutation } from '../../lib/api';
import { apiErrorMessage, Button, Panel, Spinner, Tag } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { MODULE_IDS, type ModuleId } from '../../lib/types';
import { useModules } from './useModules';

/**
 * מודולים: the battalion's super admin chooses which optional parts it uses. Turning one off hides it
 * everywhere and the server refuses it, but nothing is deleted, so turning it back on restores it as it was.
 */
export function ModulesPage() {
  const { enabled, canChange, isLoading } = useModules();
  const [setModule, { isLoading: saving }] = useSetModuleMutation();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  if (isLoading) return <Spinner />;

  async function flip(id: ModuleId): Promise<void> {
    setError(null);
    const result = await setModule({ id, enabled: !enabled[id] });
    if (result.error) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    toast.success({ title: he.modules.items[id].name });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.modules.title}</h1>
        <p className="mt-1 text-ink-soft">{he.modules.subtitle}</p>
      </div>

      {error && (
        <p role="alert" className="text-meta text-oxide">
          {error}
        </p>
      )}

      <Panel>
        <ul className="divide-y divide-rule">
          {MODULE_IDS.map((id) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-body font-semibold">{he.modules.items[id].name}</span>
                  <Tag tone={enabled[id] ? 'field' : 'brass'}>{enabled[id] ? he.modules.on : he.modules.off}</Tag>
                </span>
                <p className="mt-1 text-meta text-graphite">{he.modules.items[id].about}</p>
              </div>
              <Button
                variant={enabled[id] ? 'quiet' : 'primary'}
                onClick={() => void flip(id)}
                disabled={saving || !canChange}
              >
                {enabled[id] ? he.modules.turnOff : he.modules.turnOn}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-meta text-graphite">{canChange ? he.modules.core : he.modules.onlySuperAdmin}</p>
    </div>
  );
}
