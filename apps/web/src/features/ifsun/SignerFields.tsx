import { useState } from 'react';
import { SignaturePad } from '../../components/SignaturePad';
import { Checkbox, TextField } from '../../components/ui';
import { he } from '../../i18n/he';

export type SignerValue = {
  signatureImage: string | null;
  signerName: string | undefined;
  valid: boolean;
};

/**
 * The signing block shared by deposit and collection: a pad, plus an optional
 * name when it is not the soldier himself who signs (someone collecting for
 * him) — the document must say who actually put their hand to it.
 */
export function SignerFields({
  hint,
  disabled,
  onChange,
}: {
  hint: string;
  disabled: boolean;
  onChange: (v: SignerValue) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const [name, setName] = useState('');

  function emit(nextImage: string | null, nextOther: boolean, nextName: string): void {
    const signerName = nextOther ? nextName.trim() : undefined;
    onChange({
      signatureImage: nextImage,
      signerName: signerName || undefined,
      valid: nextImage !== null && (!nextOther || nextName.trim().length >= 2),
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-meta font-semibold">
        {he.ifsun.signHere} <span className="font-normal text-graphite">— {hint}</span>
      </p>
      <SignaturePad
        disabled={disabled}
        onChange={(v) => {
          setImage(v);
          emit(v, other, name);
        }}
      />
      <Checkbox
        checked={other}
        disabled={disabled}
        onChange={(next) => {
          setOther(next);
          emit(image, next, name);
        }}
        label={he.ifsun.otherPerson}
      />
      {other && (
        <TextField
          label={he.ifsun.otherName}
          value={name}
          onChange={(v) => {
            setName(v);
            emit(image, other, v);
          }}
          required
        />
      )}
    </div>
  );
}
