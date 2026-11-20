# fix/counts-required-signers-and-test-cleanup

Two unrelated small fixes bundled since both surfaced in the same session.

## ספירה signer fields are required at close, not at every save

Previously every signer field (name, מ.א., דרגה, signature image) was optional on
`SaveCountDto`, so `close()` could lock in a session missing a real signer — the
client only checked for the two signature images before calling close, nothing
server-side enforced it.

- `CountsService#close` now throws `BadRequestException` if either signer is
  missing name/מ.א./דרגה/signature, so the check can't be bypassed by calling the
  API directly.
- Fields stay optional on `save()` itself — the all-day fill-in-the-count flow
  has to work before either signer is present, which is exactly why they were
  optional in the first place.
- `CountsPage`'s `signAndClose` now checks all four fields per signer client-side
  too (previously only the signature images), and the two `TextField`s show the
  required asterisk while the session is still open.

## E2E tests were disabling their own test users instead of deleting them

`allocations.e2e.spec.ts` and `intake.e2e.spec.ts`'s `afterAll` did
`user.updateMany({ data: { isActive: false } })` instead of `deleteMany` — every
run left a disabled `מנהל הבדיקה` / `סמג"ד הבדיקה` / `מנפק הבדיקה` row behind
instead of removing it, cluttering the users table over time.

Checked why: the pattern `issue-forms.e2e.spec.ts` and `signatures.e2e.spec.ts`
already use correctly (delete movements/signatures/issue-forms first, since
`User` is `onDelete: Restrict` from those tables, then delete the user) only
matters when the suite actually creates rows referencing that user. Neither
`allocations` nor `intake` e2e specs ever create a `Movement` or `Signature` —
confirmed by grep — so there's no FK to work around. Switched both to a plain
`user.deleteMany`, matching what the suites that need the fuller cleanup already
do.
