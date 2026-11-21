# fix: a סגן מפקד פלוגה sees only his own company's soldiers

`/soldiers` returned the whole battalion to every role that could open the screen, so a user with `companyScope` (the סגן מפקד פלוגה, role `COMPANY_CMDR`) saw all companies.

## Server (the real gate)
`SoldiersService` now takes the actor's `companyScope` on every route:
- list: the scope overrides any `company` the client asks for
- `GET /soldiers/:id`, edit, enlistment, delete on another company's soldier: `404` (it reads as "does not exist", so the roster cannot be probed by id)
- create / move to another company: `403`
- duplicate check: restricted to his company, so it cannot reveal names from other companies

Users without a `companyScope` (admin, logistics, שלישות…) are unchanged.

## Screen
For a scoped user the company filter is replaced by a banner with the company letter, "פלוגה ב", the note that only his company is shown, and the soldier count; the company field in add/edit is locked to his company.

## Tests
`test/soldiers-scope.e2e.spec.ts`: list ignores a requested company, other company's soldier is 404 on read/edit/enlist/delete, create and move to another company are 403. API 112/112.

Not browser-checked.

## Follow-up: no adding or deleting (fix/scoped-no-add-delete)
A company-scoped user maintains his own soldiers' details (edit, within his company) but can neither add nor delete soldiers: `POST /soldiers` and `DELETE /soldiers/:id` answer `403` for any user with a `companyScope`, and the screen hides "הוסף חייל" and the delete action for him. Users without a scope (admin, logistics, שלישות) are unchanged; logistics sees every soldier.
