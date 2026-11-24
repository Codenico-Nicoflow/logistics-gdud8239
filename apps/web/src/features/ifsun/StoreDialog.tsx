import { useState } from 'react';
import { useStoreItemMutation } from '../../lib/api';
import { apiErrorMessage, Button, Modal, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { SignerFields, type SignerValue } from './SignerFields';

/** What the dialog needs to know about a signature — works for a holders row or a flat signature. */
export type StorableSignature = {
  id: string;
  itemName: string;
  /** How many units are still free to store: signed minus what is already on the shelf. */
  quantity: number;
  serial: string | null;
};

/** Units of a signature already on the shelf; the rest can still be stored. */
export function storedQty(s: { ifsunRecords?: { quantity: number }[] }): number {
  return (s.ifsunRecords ?? []).reduce((n, r) => n + r.quantity, 0);
}

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
  // A soldier may leave only some of what he holds, e.g. 2 of 3 מתפסים. A מסד item is always one unit.
  const canPickQty = signature.serial === null && signature.quantity > 1;
  const [qty, setQty] = useState(String(signature.quantity));
  const qtyNum = Number(qty);
  const qtyValid = !canPickQty || (Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= signature.quantity);
  const [signer, setSigner] = useState<SignerValue>({
    signatureImage: null,
    signerName: undefined,
    valid: false,
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    if (!signer.signatureImage) return;
    const result = await store({
      signatureId: signature.id,
      signatureImage: signer.signatureImage,
      signerName: signer.signerName,
      ...(canPickQty ? { quantity: qtyNum } : {}),
      notes: notes.trim() || undefined,
    });
    if ('error' in result) {
      setError(apiErrorMessage(result.error) ?? he.toast.failed);
      return;
    }
    toast.success({
      title: he.ifsun.storeDone,
      detail: `${soldierName} · ${signature.itemName}`,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-h-[92dvh] w-full max-w-md overflow-y-auto">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{he.ifsun.storeTitle}</h2>
        <p className="text-meta text-ink-soft">{he.ifsun.storeBody(soldierName, signature.itemName)}</p>
        {canPickQty && (
          <TextField
            label={he.ifsun.storeQty(signature.quantity)}
            type="number"
            inputMode="numeric"
            value={qty}
            onChange={setQty}
            required
          />
        )}
        <SignerFields hint={he.ifsun.signStoreHint} disabled={isLoading} onChange={setSigner} />
        <TextField label={he.ifsun.notes} value={notes} onChange={setNotes} />
        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button onClick={() => void submit()} disabled={isLoading || !signer.valid || !qtyValid}>
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
