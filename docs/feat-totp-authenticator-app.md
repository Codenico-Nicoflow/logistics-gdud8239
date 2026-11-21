# Authenticator-app second step (replaces passkeys)

After the password, a person types the 6-digit code from an authenticator app (Google/Microsoft Authenticator, Authy, 1Password, iOS Passwords). Passkeys are removed: their code, tables, dependencies and the `MFA_ENFORCED` env switch are gone.

## Who owes the step (super-admin controls, in the UI, no redeploy)
- **Optional (default):** a person who has set the app up must use it; a person who hasn't signs in with the password alone.
- **Required for everyone:** Users page → "דרוש מכולם". People without the app set it up at their next sign-in. A session opened before is not renewed without it.
- **Exempt a person:** Users page → row action "פטור מאימות דו-שלבי". Exempt people never see the step, even if enrolled.
- Only a super-admin can flip either switch (the server checks, not just the UI). Requiring it of everyone is refused unless the super-admin has the app themselves, so the switch cannot lock out the one person who can turn it back off.

## What a person sees
1. Password, then the code. Lost phone: a backup code instead (8 per person, single use, shown once).
2. First time (when required): password, QR code to scan (drawn in the browser, so the secret never goes to a third party), type the first code, save the backup codes, in.
3. "אבטחה" in the side menu (everyone): set up, new backup codes, switch off. Both of the latter re-ask for the password. Switching off is not offered while it is required of that person.

## Lost phone, no backup codes
Admin: Users → "אפס אימות דו-שלבי" (wipes the app, ends sessions, person sets it up again), or "קישור הגדרה חדש" (also wipes it). No admin can sign in at all: `DATABASE_URL='…' WEB_ORIGIN='…' npm run user:invite -- <admin>` (see the operator runbook).

## Safety properties
- A code works **once** (the 30 s step is stored); ±1 step of clock drift accepted.
- Wrong codes feed the same per-account lockout as wrong passwords, and the password step no longer resets that counter while a second step is owed, so knowing the password does not buy unlimited code guesses.
- The secret is stored AES-256-GCM encrypted under a key derived from `JWT_REFRESH_SECRET` (not in the database), so a stolen database or backup cannot generate codes. Rotating that secret invalidates enrolled apps; people set them up again.
- Backup codes are stored hashed. The step between password and session is a 5-minute token that is not a session and dies if the account is reset.
- Algorithm checked against the RFC 6238 test vectors (`src/auth/totp.spec.ts`); flows covered end to end in `test/mfa.e2e.spec.ts`.

## Deploy notes
- Migration `20261122200000_totp_authenticator_app` drops the passkey tables (anyone's enrolled passkeys disappear; they never worked in production), adds `user_totp`, `totp_backup_codes`, `app_settings`, `users.mfa_exempt`.
- Remove `MFA_ENFORCED`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID` from Render if set; they are ignored now.
- New throttle tier `mfa` (40 per 15 min per user, 1 min block; `THROTTLE_MFA_PER_15MIN`). Setting up the app no longer shares the strict 5-per-15-min password-change limit.
