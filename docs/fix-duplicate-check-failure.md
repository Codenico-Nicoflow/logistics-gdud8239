# fix/duplicate-check-failure

Adding a soldier first asks the server whether someone similar already exists. When that request **failed** (offline,
server error) the dialog treated it as "no matches" and went straight on to create, so the same-name warning was skipped
without anyone knowing. (The server still refuses a duplicate מ.א. itself.)

Now a failed check stops the add, shows "לא ניתן היה לבדוק אם החייל כבר קיים. נסו שוב.", and the next press runs the
check again. Tests: `AddSoldierDialog.test.tsx` (the failure case fails without the fix). Includes the request-recording
`test/mockApi.tsx`, identical to the one in the test-coverage PR.
