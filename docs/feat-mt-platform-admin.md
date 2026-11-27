# Multi-tenant step 4: the platform operator

The product owner (`isPlatformAdmin`) can create battalions, work inside any of them, and is the only one
who sees the cross-battalion screens.

## What it does

- **מערכת ← גדודים** (platform admin only): list every battalion, create one, rename one, add an admin to
  one, and open any of them.
- **Creating a battalion** makes the row and its own 1008 counter and nothing else: a ready skeleton with
  no companies, catalog or soldiers. Its first admin is an ordinary admin (never a super-admin: the platform has one, you, who acts inside the battalion as a super-admin stand-in) with no password; the
  response carries a one-time setup link (the same mechanism as every other new user), so nobody else ever
  knows the password. The number is 2 to 6 digits, unique across the platform, and fixed once created.
- **Acting inside a battalion** (`POST /platform/act-as`, the picker on the גדודים screen or the switcher
  above the user card). A banner stays at the top of every screen while you are in a battalion that is not
  your own, with a button back. The app reloads on every switch so nothing of the battalion just left
  survives in memory.
- **Nav gating**: גיבויים and גדודים are only offered to the platform admin (`TabDef.platformOnly`). The API
  already refused everyone else; the screen no longer shows a tab that would 403.

## How acting works, and why it is not a cross-battalion read

Row-level security (step 2) still applies while acting: the connection sees exactly one battalion. The
operator's own account lives in their home battalion, and a lot of rows point at "the user who did it"
(signatures, issue forms, movements, counts...), so reading it from another battalion would break every
join. Instead, the first time you act as a battalion, a **stand-in user** is created inside it:

- an ordinary `users` row of that battalion (`acts_for_id` = the real person), role admin and
  super-admin, no password, MFA-exempt (you passed your own second step to get here);
- everything you do there is recorded under the stand-in, so audit columns and joins resolve inside the
  battalion; its display name is yours;
- it cannot sign in: no password, and its username (`actor:<your id>:<number>`) is not guessable by that
  battalion's own admins, so they cannot squat it;
- it is never listed in the battalion's users, and never counted as one of its admins (a battalion cannot
  lose its last real admin because the operator's stand-in also counts);
- the access token carries `actorId`. Every request re-checks that the real person is still an active
  platform admin (SQL function `platform_actor`), and a refresh does too, so removing your access ends
  the session at once;
- switching to your own battalion gives your real account back.

Each switch is written to that battalion's security events (`ACT_AS`) with you as the actor.

## Needs no manual setup

One migration, `20261130100000_platform_admin`: `users.acts_for_id`, and three SECURITY DEFINER functions
(`platform_actor`, `platform_battalions`, `create_battalion`). The restricted role still cannot insert into
`battalions` directly; creating one goes through `create_battalion`, which the API calls only after the
platform-admin check.

## Not in this step

- Disabling or deleting a battalion.
- Per-battalion module switches (step 5), per-battalion Slack and backups (step 6), the first-run
  checklist (step 7).
