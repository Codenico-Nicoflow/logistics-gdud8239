-- Removes everything the browser e2e run created (all tagged "E2E…"). LOCAL dev database only.
-- movements and issue_forms are append-only by trigger, so the triggers are lifted for this transaction.
BEGIN;
ALTER TABLE movements DISABLE TRIGGER USER;
ALTER TABLE issue_forms DISABLE TRIGGER USER;
CREATE TEMP TABLE s AS SELECT id FROM soldiers WHERE last_name LIKE 'E2E%' OR first_name LIKE 'E2E%';
CREATE TEMP TABLE i AS SELECT id FROM items WHERE name LIKE 'E2E%';
DELETE FROM ifsun_records WHERE signature_id IN (SELECT id FROM signatures WHERE soldier_id IN (SELECT id FROM s) OR item_id IN (SELECT id FROM i));
DELETE FROM movements WHERE soldier_id IN (SELECT id FROM s) OR item_id IN (SELECT id FROM i);
DELETE FROM signatures WHERE soldier_id IN (SELECT id FROM s) OR item_id IN (SELECT id FROM i);
DELETE FROM issue_form_lines WHERE item_id IN (SELECT id FROM i);
DELETE FROM issue_forms WHERE soldier_id IN (SELECT id FROM s);
DELETE FROM count_lines WHERE item_id IN (SELECT id FROM i);
DELETE FROM count_session_figures WHERE item_id IN (SELECT id FROM i);
DELETE FROM daily_summary_lines WHERE item_id IN (SELECT id FROM i);
DELETE FROM soldiers WHERE id IN (SELECT id FROM s);
DELETE FROM items WHERE id IN (SELECT id FROM i);
DELETE FROM team_members WHERE nickname LIKE 'E2E%';
DELETE FROM service_periods WHERE name LIKE 'E2E%';
DELETE FROM users WHERE username LIKE 'tmp\_e2e%' ESCAPE '\' AND username NOT IN ('tmp_e2e_admin','tmp_e2e_logistics','tmp_e2e_viewer','tmp_e2e_shlishut','tmp_e2e_samgad','tmp_e2e_cmdr');
ALTER TABLE movements ENABLE TRIGGER USER;
ALTER TABLE issue_forms ENABLE TRIGGER USER;
COMMIT;
