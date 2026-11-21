import { useState } from 'react';
import { Button, Modal, TextField } from './ui';
import { he } from '../i18n/he';

/**
 * Confirmation for a permanent delete. With `reasonLabel` it also collects a
 * reason (≥3 chars) — used where the deletion is recorded in an audit log.
 */
export function DeleteDialog({
  title,
  body,
  reasonLabel,
  isLoading,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  reasonLabel?: string;
  isLoading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = !reasonLabel || reason.trim().length >= 3;
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
            <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
          </span>
          <h2 className="text-lead font-semibold">{title}</h2>
        </div>
        <p className="text-meta text-ink-soft">{body}</p>
        {reasonLabel && (
          <TextField label={reasonLabel} value={reason} onChange={setReason} autoFocus required />
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={() => onConfirm(reason)} disabled={isLoading || !valid}>
            {he.common.delete}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
