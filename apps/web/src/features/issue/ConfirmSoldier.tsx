import { useState } from 'react';
import { useSoldierQuery, useUpdateSoldierMutation } from '../../lib/api';
import { apiErrorMessage, Button, Panel, Select, Spinner, Tag, TextField } from '../../components/ui';
import { he } from '../../i18n/he';
import { COMPANIES, type Company } from '../../lib/types';

/**
 * Step 2 — confirm the soldier before anything is signed to them.
 *
 * A weapon recorded against the wrong person is the expensive mistake this
 * flow exists to prevent, and the four fields that identify someone are not
 * all visible in a search result. Missing details are called out rather than
 * left blank, and can be filled in here instead of in another tab.
 */
export function ConfirmSoldier({
  soldierId,
  onBack,
  onContinue,
}: {
  soldierId: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { data, isLoading } = useSoldierQuery(soldierId);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <Spinner />;
  if (!data) return null;

  return (
    <Panel
      title={he.issue.confirmSoldier}
      action={
        <button onClick={onBack} className="text-meta font-semibold text-field hover:underline">
          {he.issue.changeSoldier}
        </button>
      }
    >
      <div className="space-y-4 px-4 py-4">
        {editing ? (
          <EditSoldier soldier={data} onDone={() => setEditing(false)} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Detail label={he.issue.fullName} value={`${data.firstName} ${data.lastName}`} />
              <Detail label={he.issue.personalNumber} value={data.personalNumber} mono />
              <Detail label={he.issue.company} value={he.companies[data.company]} />
              <Detail label={he.issue.phone} value={data.phone} mono />
            </dl>

            <div className="border-t border-rule pt-3">
              <span className="text-meta font-semibold text-ink-soft">
                {he.issue.currentlyHolds}
              </span>
              {data.signatures.length === 0 ? (
                <p className="mt-1 text-meta text-graphite">{he.issue.holdsNothing}</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.signatures.map((s) => (
                    <Tag key={s.id}>
                      {s.item.name}
                      {s.itemInstance ? ` · ${s.itemInstance.serial}` : ''}
                      {s.quantity > 1 ? ` ×${s.quantity}` : ''}
                    </Tag>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={onContinue}>{he.issue.continueToItem}</Button>
              <Button variant="quiet" onClick={() => setEditing(true)}>
                {he.issue.editDetails}
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-meta text-graphite">{label}</dt>
      {/* A missing field is named as missing: a blank cell reads as "nothing
          to see here" when it actually means nobody has recorded it. */}
      <dd
        className={`font-semibold ${value ? '' : 'text-oxide'} ${mono && value ? 'serial' : ''}`}
      >
        {value || he.issue.missing}
      </dd>
    </div>
  );
}

/** Correcting details in place, so a wrong מ.א. does not send you to another tab. */
function EditSoldier({
  soldier,
  onDone,
}: {
  soldier: import('../../lib/types').SoldierDetail;
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState(soldier.firstName);
  const [lastName, setLastName] = useState(soldier.lastName);
  const [personalNumber, setPersonalNumber] = useState(soldier.personalNumber ?? '');
  const [phone, setPhone] = useState(soldier.phone ?? '');
  const [company, setCompany] = useState<Company>(soldier.company);
  const [update, { isLoading, error }] = useUpdateSoldierMutation();

  async function submit(): Promise<void> {
    const result = await update({
      id: soldier.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company,
      ...(personalNumber.trim() ? { personalNumber: personalNumber.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    });
    if ('data' in result) onDone();
  }

  const message = apiErrorMessage(error);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={he.issue.fullName} value={firstName} onChange={setFirstName} required />
        <TextField label=" " value={lastName} onChange={setLastName} required />
        <TextField
          label={he.issue.personalNumber}
          value={personalNumber}
          onChange={setPersonalNumber}
        />
        <TextField label={he.issue.phone} value={phone} onChange={setPhone} />
        <Select
          label={he.issue.company}
          value={company}
          onChange={(v) => v && setCompany(v as Company)}
          options={COMPANIES.map((c) => ({ value: c, label: he.companies[c] }))}
        />
      </div>
      {message && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={isLoading}>
          {he.issue.saveDetails}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {he.common.cancel}
        </Button>
      </div>
    </div>
  );
}
