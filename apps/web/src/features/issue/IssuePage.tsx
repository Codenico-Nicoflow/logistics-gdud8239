import { useMemo, useState } from 'react';
import {
  useAvailableInstancesQuery,
  useIssueItemMutation,
  useItemsQuery,
  useSoldierQuery,
  useSoldiersQuery,
  useUpdateSoldierMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  Panel,
  SearchField,
  Select,
  Serial,
  Spinner,
  Tag,
  TextField,
} from '../../components/ui';
import { AddSoldierDialog } from '../soldiers/AddSoldierDialog';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type Item, type SoldierSummary } from '../../lib/types';

type Step = 'soldier' | 'confirm' | 'item' | 'details';

/**
 * ניפוק is the one flow that gets full attention rather than table chrome:
 * a mistake here means a weapon is recorded against the wrong person. The steps
 * are sequential and the serial field is unmissable, because a serialized item
 * cannot be signed without one — the API refuses it, and so does this form.
 */
export function IssuePage() {
  const [step, setStep] = useState<Step>('soldier');
  const [adding, setAdding] = useState(false);
  const [soldier, setSoldier] = useState<SoldierSummary | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [receiptNo, setReceiptNo] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const soldiers = useSoldiersQuery({ q: query, take: 8 }, { skip: query.length < 2 });
  const items = useItemsQuery();
  const available = useAvailableInstancesQuery(item?.id ?? '', {
    skip: !item?.isSerialized,
  });
  const [issue, { isLoading, error }] = useIssueItemMutation();

  const filteredItems = useMemo(() => {
    const all = (items.data ?? []).filter((i) => i.isActive && i.name !== 'לא מזוהה');
    if (!itemQuery) return all;
    const q = itemQuery.trim();
    return all.filter((i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)));
  }, [items.data, itemQuery]);

  function reset(): void {
    setStep('soldier');
    setAdding(false);
    setSoldier(null);
    setItem(null);
    setSerial('');
    setQuantity('1');
    setReceiptNo('');
    setNotes('');
    setQuery('');
    setItemQuery('');
  }

  async function submit(): Promise<void> {
    if (!soldier || !item) return;
    const result = await issue({
      soldierId: soldier.id,
      itemId: item.id,
      // A serial wins over a quantity: an instance is a single physical unit.
      ...(serial.trim() ? { serial: serial.trim() } : { quantity: Number(quantity) || 1 }),
      ...(receiptNo ? { receiptNo } : {}),
      ...(notes ? { notes } : {}),
    });
    if (result.data) {
      setDone(he.issue.success(`${soldier.firstName} ${soldier.lastName}`, item.name));
      reset();
    }
  }

  const serialMissing = Boolean(item?.isSerialized) && serial.trim().length === 0;
  // Typed a serial the register has not seen: allowed, and worth saying so, so
  // a typo is noticed before it becomes a new instance.
  const isNewSerial =
    serial.trim().length > 0 &&
    available.data !== undefined &&
    !available.data.some((i) => i.serial === serial.trim());
  const apiMessage = apiErrorMessage(error);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-display font-bold">{he.issue.title}</h1>

      {done && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-panel border border-field/30 bg-field-wash px-4 py-3"
        >
          <span className="font-semibold text-field-dark">{done}</span>
          <button
            onClick={() => setDone(null)}
            className="text-meta font-semibold text-field-dark hover:underline"
          >
            {he.common.close}
          </button>
        </div>
      )}

      <Steps step={step} soldier={soldier} item={item} />

      {step === 'soldier' && (
        <Panel title={he.issue.stepSoldier}>
          <div className="px-4 py-4">
            <SearchField
              value={query}
              onSearch={setQuery}
              placeholder={he.issue.searchSoldier}
              autoFocus
            />
            {soldiers.isFetching && <Spinner />}
            {query.length >= 2 && !soldiers.isFetching && (
              <ul className="mt-3 divide-y divide-rule">
                {(soldiers.data?.rows ?? []).length === 0 && (
                  <li className="py-6 text-center text-graphite">{he.issue.noSoldiers}</li>
                )}
                {soldiers.data?.rows.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => {
                        setSoldier(s);
                        setStep('confirm');
                      }}
                      className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-start hover:bg-card"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold">
                          {s.firstName} {s.lastName}
                        </span>
                        {/* Everything needed to tell two soldiers apart before
                            committing to one. A field nobody recorded is named
                            as missing rather than left blank, because a blank
                            reads as "no such thing" instead of "unknown". */}
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-meta text-graphite">
                          <span>{he.companies[s.company]}</span>
                          <span>
                            {he.issue.personalNumber}:{' '}
                            {s.personalNumber ? (
                              <span className="serial text-ink-soft">{s.personalNumber}</span>
                            ) : (
                              <span className="text-oxide">{he.issue.missing}</span>
                            )}
                          </span>
                          <span>
                            {he.issue.phone}:{' '}
                            {s.phone ? (
                              <span className="serial text-ink-soft">{s.phone}</span>
                            ) : (
                              <span className="text-oxide">{he.issue.missing}</span>
                            )}
                          </span>
                          {s.platoon && (
                            <span>
                              {he.issue.platoon}: {s.platoon}
                            </span>
                          )}
                        </span>
                      </span>
                      {s.openSignatureCount > 0 && (
                        <Tag>{he.issue.holdsItems(s.openSignatureCount)}</Tag>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Offered whether or not the search found anyone: a soldier who
                has never signed for anything is not in the system yet, and
                ניפוק is where that is discovered. */}
            <div className="mt-4 border-t border-rule pt-3">
              <Button variant="quiet" size="sm" onClick={() => setAdding(true)}>
                {he.issue.addSoldier}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {step === 'confirm' && soldier && (
        <ConfirmSoldier
          soldierId={soldier.id}
          onBack={() => {
            setSoldier(null);
            setStep('soldier');
          }}
          onContinue={() => setStep('item')}
        />
      )}

      {step === 'item' && (
        <Panel title={he.issue.stepItem}>
          <div className="px-4 py-4">
            <TextField
              value={itemQuery}
              onChange={setItemQuery}
              placeholder={he.issue.chooseItem}
              autoFocus
              required
            />
            <ul className="mt-3 grid max-h-80 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {filteredItems.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => {
                      setItem(i);
                      setSerial('');
                      setStep('details');
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-ctl border border-rule bg-card-raised px-3 py-2 text-start transition-colors hover:border-field hover:bg-field-wash"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <CategoryDot category={i.category} />
                      {i.name}
                    </span>
                    {i.isSerialized && <Tag tone="brass">{he.signatures.serial}</Tag>}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="quiet" size="sm" onClick={() => setStep('confirm')} className="mt-4">
              {he.issue.back}
            </Button>
          </div>
        </Panel>
      )}

      {adding && (
        <AddSoldierDialog
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setAdding(false);
            setSoldier(created);
            setStep('confirm');
          }}
        />
      )}

      {step === 'details' && item && soldier && (
        <Panel title={item.isSerialized ? he.issue.stepSerial : he.issue.stepConfirm}>
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-ctl bg-card px-3 py-2 text-meta">
              <span className="font-semibold">
                {soldier.firstName} {soldier.lastName}
              </span>
              <span className="text-graphite"> · {he.companies[soldier.company]} · </span>
              <span className="font-semibold">{item.name}</span>
            </div>

            {item.isSerialized ? (
              <div>
                {/* The serial is the field that matters, so it is larger than
                    anything else on the page and framed in brass. */}
                <label className="block">
                  <span className="mb-1 block text-meta font-semibold text-ink-soft">
                    {he.issue.serialLabel}
                  </span>
                  <input
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    autoFocus
                    className="serial w-full rounded-ctl border-2 border-brass bg-brass-wash px-3 py-3 text-head"
                  />
                </label>
                <p className="mt-1 text-meta text-graphite">{he.issue.serialHelp}</p>

                {/* The register of serials is still being built from the
                    signatures as they are entered, so this list is a shortcut
                    for what is already known — never a restriction. A serial
                    nobody has recorded yet is typed in and created on issue. */}
                {available.data && available.data.length > 0 && (
                  <div className="mt-3">
                    <span className="text-meta text-graphite">{he.issue.availableSerials}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {available.data.slice(0, 24).map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => setSerial(inst.serial)}
                          className={`rounded-ctl border px-2 py-1 text-meta ${
                            serial === inst.serial
                              ? 'border-brass bg-brass text-white'
                              : 'border-rule-strong hover:border-brass'
                          }`}
                        >
                          <Serial value={inst.serial} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {available.data?.length === 0 && (
                  <p className="mt-2 text-meta text-graphite">{he.issue.noAvailable}</p>
                )}
                {isNewSerial && <p className="mt-2 text-meta text-brass">{he.issue.newSerial}</p>}
              </div>
            ) : (
              <>
                {/* This item does not require a מסד, but one may still be
                    recorded — staff do track serials on items the catalog
                    calls bulk. Entering one signs a single unit. */}
                <TextField
                  label={he.issue.serialOptionalLabel}
                  value={serial}
                  onChange={setSerial}
                  hint={he.issue.serialOptionalHint}
                />
                {!serial.trim() && (
                  <TextField
                    label={he.issue.quantityLabel}
                    value={quantity}
                    onChange={setQuantity}
                    type="number"
                    required
                  />
                )}
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={he.issue.receiptLabel} value={receiptNo} onChange={setReceiptNo} />
              <TextField label={he.issue.notesLabel} value={notes} onChange={setNotes} />
            </div>

            {serialMissing && (
              <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
                {he.issue.serialRequired}
              </p>
            )}
            {apiMessage && (
              <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
                {apiMessage}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void submit()} disabled={isLoading || serialMissing}>
                {isLoading ? he.issue.submitting : he.issue.confirm}
              </Button>
              <Button variant="quiet" onClick={() => setStep('item')}>
                {he.issue.back}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** A progress trail. This is genuinely a sequence, so it is numbered. */
function Steps({
  step,
  soldier,
  item,
}: {
  step: Step;
  soldier: SoldierSummary | null;
  item: Item | null;
}) {
  const steps: { key: Step; label: string; value: string | null }[] = [
    { key: 'soldier', label: he.issue.stepSoldier, value: null },
    {
      key: 'confirm',
      label: he.issue.confirmSoldier,
      value: soldier ? `${soldier.firstName} ${soldier.lastName}` : null,
    },
    { key: 'item', label: he.issue.stepItem, value: item?.name ?? null },
    { key: 'details', label: he.issue.stepConfirm, value: null },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol className="flex gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="min-w-0 flex-1">
          <div
            className={`border-t-2 pt-2 ${
              i <= activeIndex ? 'border-field' : 'border-rule'
            }`}
          >
            <div className={`text-meta ${i <= activeIndex ? 'text-field-dark' : 'text-graphite'}`}>
              {i + 1}. {s.label}
            </div>
            {s.value && <div className="truncate text-meta font-semibold">{s.value}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Step 2 — confirm the soldier before anything is signed to them.
 *
 * A weapon recorded against the wrong person is the expensive mistake this
 * flow exists to prevent, and the four fields that identify someone are not
 * all visible in a search result. Missing details are called out rather than
 * left blank, and can be filled in here instead of in another tab.
 */
function ConfirmSoldier({
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
