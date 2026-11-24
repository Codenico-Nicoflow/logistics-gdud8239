-- Which items may be stored (אפסון) becomes a per-item setting instead of a fixed list of categories.
ALTER TABLE "items" ADD COLUMN "ifsun_allowed" BOOLEAN NOT NULL DEFAULT false;
-- Keep today's behaviour: weapons, optics and drones.
UPDATE "items" SET "ifsun_allowed" = true WHERE "category" IN ('נשק', 'אופטיקה', 'רחפן');
