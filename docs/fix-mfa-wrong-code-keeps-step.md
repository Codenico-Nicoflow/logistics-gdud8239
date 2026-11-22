# fix/mfa-wrong-code-keeps-step

**Bug (found by driving the real login in a browser):** typing a wrong authenticator code on sign-in threw the
person back to the username/password form with no message.

**Cause:** `mfaVerify` had `invalidatesTags: ['Auth']`. RTK Query invalidates tags for a *refused* mutation too, so the
wrong code re-fetched `me`; `me` 401s with no session, the app flips to a spinner, `LoginPage` is rebuilt, and its
`pending` code step is lost. It is the same trap PR #57 fixed for the password step.

**Fix:** invalidate only after a successful verification (`onQueryStarted`), like `login`.

**Test:** `loginSteps.test.tsx` now waits after the error and asserts the code step and its message are still on screen
and that `me` was not re-fetched. It fails without the fix.
