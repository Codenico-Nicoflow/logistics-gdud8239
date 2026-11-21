# Login: the code step no longer disappears

Symptom: after the password, the login page stayed on the password form and the code step never showed (network tab: `login` 200 with `step: "totp"`, then `me` 401 and `refresh` 401).

Cause: `login` (and the setup-link sign-in) always told the app to re-check who is signed in. When the answer was "now enter your code" there is no session yet, so that check 401s, the app shows its spinner while it retries, and the login page is rebuilt, discarding the second-step state.

Fix: only a login that actually created a session re-checks the session. A regression test counts the `/api/auth/me` calls and fails if the first step triggers another.
