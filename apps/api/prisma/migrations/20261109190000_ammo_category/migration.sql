-- Reconstructed from the live database: this value was already applied to
-- the dev DB's ItemCategory enum, but the migration file that should have
-- recorded it was never committed. Written to match actual DB state exactly
-- so migration history and the real schema agree, not to apply anything new.
ALTER TYPE "ItemCategory" ADD VALUE 'תחמושת';
