-- Which signed form a reissue replaced. It used to be a sentence typed into the form's notes (and so printed);
-- it is now a field of its own. A nullable column on the append-only table is fine: nothing is updated.
ALTER TABLE "issue_forms" ADD COLUMN "supersedes_form_id" TEXT;
ALTER TABLE "issue_forms"
  ADD CONSTRAINT "issue_forms_supersedes_form_id_fkey"
  FOREIGN KEY ("supersedes_form_id") REFERENCES "issue_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "issue_forms_supersedes_form_id_idx" ON "issue_forms"("supersedes_form_id");
