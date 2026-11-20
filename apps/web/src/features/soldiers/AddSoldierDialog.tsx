import { useState } from 'react';
import {
  useCheckDuplicateSoldierMutation,
  useCreateSoldierMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, Modal, Select, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type NewSoldier, type SoldierSummary } from '../../lib/types';

/**
 * Creating a soldier.
 *
 * Shared by חיילים and by ניפוק, where a soldier who has never signed for
 * anything turns out not to be in the system — sending the operator to another
 * tab mid-issue loses the thread.
 *
 * Two different checks guard it. A מ.א. is unique and the API refuses a
 * repeat outright, since it identifies exactly one person. A matching name in
 * the same company is only a warning, because two soldiers in one company
 * really can share a name; the existing record is shown with its מ.א. so the
 * operator can compare and decide.
 */
export function AddSoldierDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (soldier: SoldierSummary) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalNumber, setPersonalNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState<Company>('A');
  const [duplicates, setDuplicates] = useState<SoldierSummary[] | null>(null);

  const [checkDuplicate] = useCheckDuplicateSoldierMutation();
  const [create, { isLoading, error }] = useCreateSoldierMutation();
  const toast = useToast();

  function payload(): NewSoldier {
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company,
      ...(personalNumber.trim() ? { personalNumber: personalNumber.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
  }

  async function submit(): Promise<void> {
    // Checked once. A second press means the operator has seen the warning and
    // decided, so it is not asked again.
    if (duplicates === null) {
      const found = await checkDuplicate(payload());
      const matches = 'data' in found ? (found.data ?? []) : [];
      if (matches.length > 0) {
        setDuplicates(matches);
        return;
      }
      setDuplicates([]);
    }
    const result = await create(payload());
    if ('data' in result && result.data) {
      const created = result.data;
      toast.success({
        title: he.toast.soldierCreated,
        detail: `${created.firstName} ${created.lastName} · ${he.companies[created.company]}${
          created.personalNumber ? ` · ${created.personalNumber}` : ''
        }`,
      });
      onCreated(created);
    } else if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  // A מ.א. is required for anyone added from here. The Excel carries soldiers
  // without one and those records are left alone, but a new record created
  // today gets the field that makes a duplicate impossible rather than merely
  // flagged.
  const ready =
    firstName.trim().length > 0 && lastName.trim().length > 0 && /^\d{5,9}$/.test(personalNumber.trim());
  const message = apiErrorMessage(error);

  return (
    <Modal onClose={onClose}>
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.issue.addSoldierTitle}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={he.issue.firstName}
              value={firstName}
              onChange={setFirstName}
              autoFocus
              required
            />
            <TextField
              label={he.issue.lastName}
              value={lastName}
              onChange={setLastName}
              required
            />
          </div>
          <Select
            label={he.issue.company}
            value={company}
            onChange={(v) => v && setCompany(v as Company)}
            options={COMPANIES.map((c) => ({ value: c, label: he.companies[c] }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={he.issue.personalNumber}
              value={personalNumber}
              onChange={setPersonalNumber}
              hint={he.issue.personalNumberHint}
              required
            />
            <TextField
              label={he.issue.phone}
              value={phone}
              onChange={setPhone}
              hint={he.issue.optional}
            />
          </div>

          {duplicates && duplicates.length > 0 && (
            <div className="rounded-ctl bg-brass-wash px-3 py-2">
              <p className="text-meta font-semibold text-brass">{he.issue.duplicateWarning}</p>
              <ul className="mt-1.5 space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="text-meta">
                      {d.firstName} {d.lastName}
                      {d.personalNumber ? ` · ${d.personalNumber}` : ''}
                    </span>
                    <button
                      onClick={() => onCreated(d)}
                      className="text-meta font-semibold text-field hover:underline"
                    >
                      {he.issue.useExisting}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {message && (
            <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {message}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={!ready || isLoading}>
              {duplicates && duplicates.length > 0
                ? he.issue.createAnyway
                : he.issue.createAndContinue}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
    </Modal>
  );
}
