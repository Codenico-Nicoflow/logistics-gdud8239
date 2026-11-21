# Passkeys: the second sign-in step (feat/passkey-second-factor)

PR 5 of the security plan. A password alone is no longer enough once a person has a device enrolled — and, once switched on, for anyone.

## What a person experiences
1. Types username and password as before.
2. Their phone or laptop asks for a **fingerprint, face or PIN**, and they are in.

**First time / new device:** a person with no device yet is walked through adding one right after the password (a new account does this straight after choosing its password). They can add a second one later under **"המכשירים שלי"** (everyone has it in the side menu), which is also where a device is removed. Add two: a lost phone is then an inconvenience, not a call to an admin.

**A different device on the same account:** passkeys that sync (iPhone/Mac through iCloud Keychain, Android/Chrome through Google Password Manager) simply appear on the new device. Otherwise the browser offers "use a phone or tablet": a QR code is shown, the phone (which holds the passkey) approves with its fingerprint, and the new device is signed in.

**A shared computer, without putting a personal Google/Apple account on it:** choose the same "use a phone or tablet" option. The phone approves over Bluetooth proximity and **nothing is stored on the computer**.

**Several accounts on one computer:** each account has its own passkey. The browser is offered only the passkeys of the username that was just typed, so two people can use one laptop without clashing.

## Why it is safe
- The server stores only the **public** key. A stolen database, or a backup, cannot be used to log in.
- Each sign-in is a signature over a fresh random challenge, **bound to this site's address**: a fake login page cannot relay it, and a recorded response cannot be replayed (a challenge is single use, even after a failed attempt, and lives five minutes).
- The device must have checked the person (fingerprint/face/PIN); a bare "touch" is refused.
- The counter on each device is stored; the step between password and device is a five-minute token that is **not** a session, cannot be used as an access token, and dies if the account is reset in between.

## Switching it on safely (`MFA_ENFORCED`)
It is **off** by default: people with a device must use it; people without one sign in as before. Order:
1. Merge and deploy. Nothing changes for anyone yet.
2. Each admin signs in and adds a device under "המכשירים שלי" (at least two admins, ideally two devices each). The Users page shows who has one ("ללא מכשיר") and a count.
3. Check a real sign-in end to end on a phone and a laptop.
4. In Render → Environment set **`MFA_ENFORCED=true`**. From then on nobody gets a session without a device: a person with none is taken through enrolling one at their next sign-in, and a session opened before cannot be renewed without one.
To switch it back off, set it to anything else; no redeploy of code is needed beyond Render restarting the service.

## Lost phone, or nobody can sign in
- A lost device: an admin presses **"קישור הגדרה חדש"** (PR 4). Using that link wipes the person's passkeys, so a thief holding the phone cannot use it, and they enrol a new device.
- **No admin can sign in at all** (all devices lost, or passkeys switched on too early): the operator with database access runs, from the repository,
  `DATABASE_URL=<production URL> WEB_ORIGIN=https://logistics-gdud8239.vercel.app npm run user:invite -- <admin username>`
  and sends the printed link to that admin. It ends their sessions and is logged as an operator-issued link. Anyone who can run it already holds the database credentials.

## The address is part of every passkey
Passkeys are bound to the site address (`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`, defaulting to `WEB_ORIGIN`, here `logistics-gdud8239.vercel.app`). **If the app ever moves to another address, every passkey stops working** and each person needs a fresh setup link. Decide the final address before enrolling everyone.

## Also
- `.env`/Render: `MFA_ENFORCED` (dashboard-owned, `sync: false`), optional `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`.
- New tables `webauthn_credentials`, `webauthn_challenges`; the account log records devices added/removed and passkey sign-ins and refusals.
- A passkey sign-in needs HTTPS (or `localhost`); the Vercel address qualifies.

## Tests
`passkey.e2e` runs the server's real verification against a **software authenticator** (a real P-256 key, real signatures, the real byte formats): optional vs required, enrolling mid-sign-in, the step token's limits, and refusals — wrong key, wrong site, wrong relying-party id, no user verification, replay, no challenge, a challenge reused after a failure, oversized input — plus several accounts on one computer, a device enrolled twice, removing devices (never someone else's, never the last one while required), resets wiping passkeys, the operator command, and the account log. Web: login/setup step screens and the unsupported-browser fallback (`jsdom`). API 245, web 12. **Not exercised on a real phone** — the first real sign-in is part of switching it on.
