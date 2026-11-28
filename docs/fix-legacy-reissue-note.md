# The "replaces form N" sentence on older forms

#102 stopped a reissue from typing "מחליף טופס 1008 מספר N (date)" into the form's notes, but forms signed before it keep
that text in the database, and it still showed under "הערות לטופס" on screen and on the printout (and as
"עריכת טופס — מחליף טופס 1008 מספר N" on the movements report).

`issue_forms` and `movements` are append-only (database triggers), so the stored text cannot be rewritten. It is taken
out when read instead: `withoutSystemNote` (`common/system-notes.ts`) is applied in `IssueFormsService#findOne` (the
screen and the print both use it) and in `MovementsService#toRow` (the report, the daily list and the Excel export).
Anything the operator wrote next to it is kept; a movement note reads just "עריכת טופס".

Nothing is deleted: the stored text, and for new reissues the `supersedes_form_id` column, still say which form
replaced which.
