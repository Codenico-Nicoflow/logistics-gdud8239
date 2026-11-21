# Invite links, password rules and the account log (feat/invite-onboarding)

PR 4 of the security plan. Nobody but the person themselves ever knows or chooses their password.

## How a person gets an account
1. An admin creates the account (name, username, role, company). **No password is set** — the form no longer has a password field, and the API refuses one.
2. The admin gets a **one-time setup link** (`…/setup/<token>`), shown once with a copy button, valid **24 hours**. He sends it to the person (WhatsApp etc.).
3. The person opens it, chooses a password (twice), and is signed in.

The link carries 256 random bits and only its SHA-256 is stored, so a database copy or a backup holds nothing that can be opened. A link works once; a newer link cancels the older one; an unknown, used or expired link all answer the same neutral "not valid" (the endpoint can't be used to learn which links ever existed); a rejected password does not spend the link; two simultaneous submissions cannot both succeed.

Until the link is used the account **cannot log in** with any password (`passwordHash` is null and `mustSetup` is true).

## Forgotten password or lost device
"איפוס סיסמה" is replaced by **"קישור הגדרה חדש"**: it issues a fresh link, **ends the person's sessions immediately** (refresh tokens revoked, `passwordChangedAt` set) and stops the old password working until the link is used. If the reason is a stolen phone, the thief is out at once. It can't be sent to yourself or to a deactivated account, and only a super-admin can issue one for a super-admin. Users awaiting setup show a "ממתין להגדרת סיסמה" tag.

## Password rules (one rule everywhere a password is chosen)
At least 12 characters; at most 72 bytes (bcrypt silently ignores the rest); must not contain the username; must not contain the person's own name; and a strength estimate (`zxcvbn`: dictionary words, names, dates, repeats, keyboard walks) must score at least 3 of 4 — so `passwordpassword` and `123456789012` are refused despite being long enough. The change-your-own-password API uses the same rule.

## Account log
New `security_events` table: logins, failed logins (only for usernames that exist, so it can't be filled by guessing), locks and unlocks, account created, link issued, link used, password changed. It never holds a password, token or signature. Admins read it per user from the Users page ("יומן אבטחה"). Events are kept 400 days; used or long-expired links are pruned nightly.

## Fixed along the way
A token issued in the same second as a password change was treated as older than it, which would have signed a person out the moment they finished setup. Access tokens now carry a millisecond issue time and are compared exactly.

## Not in this PR
The second sign-in step (passkeys) is PR 5. There is still no screen for changing your own password (an admin sends a link instead); the API supports it.

## Tests
`invite-onboarding.e2e` (the whole journey and its edge cases), `password-policy` unit tests, a web routing test (`routing.test.tsx`, new `jsdom` + Testing Library dev dependencies) proving the setup page renders without a login while every other address stays behind it. API 216 + web 7.
