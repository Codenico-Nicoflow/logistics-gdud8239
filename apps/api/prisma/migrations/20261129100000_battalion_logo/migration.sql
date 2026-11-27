-- A battalion's own logo, shown in the app and on printed forms. Kept in the row (PNG or JPEG, a few
-- hundred KB at most) so it needs no file storage and is part of every backup.
ALTER TABLE "battalions" ADD COLUMN "logo_data" BYTEA;
ALTER TABLE "battalions" ADD COLUMN "logo_mime" TEXT;
ALTER TABLE "battalions" ADD COLUMN "logo_version" INTEGER NOT NULL DEFAULT 0;
