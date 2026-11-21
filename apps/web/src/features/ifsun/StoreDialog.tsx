import { useState } from 'react';
import { useStoreItemMutation } from '../../lib/api';
import { apiErrorMessage, Button, Modal, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';

/** What the dialog needs to know about a signature — works for a holders row or a flat signature. */
export type StorableSignature = { id: string; itemName: string; quantity: number; serial: string | null };

/**
 * אפסון of one signed item. The signature is not touched: the soldier keeps
 * the responsibility, the armory just counts the item as present.
 */
export function StoreDialog({
  signature,
  soldierName,
  onClose,
}: {
  signature: StorableSignature;
  soldierName: string;
  onClose: () => void;
}) {
  const [store, { isLoading }] = useStoreItemMutation();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    const result = await store({ signatureId: signature.id, notes: notes.trim() || undefined });
    if ('error' in result) {
      setError(apiErrorMessage(result.error) ?? he.toast.failed);
      return;
    }
    toast.success({ title: he.ifsun.storeDone, detail: `${soldierName} · ${signature.itemName}` });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{he.ifsun.storeTitle}</h2>
        <p className="text-meta text-ink-soft">{he.ifsun.storeBody(soldierName, signature.itemName)}</p>
        <TextField label={he.ifsun.notes} value={notes} onChange={setNotes} />
        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button onClick={() => void submit()} disabled={isLoading}>
            {he.ifsun.storeAction}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
