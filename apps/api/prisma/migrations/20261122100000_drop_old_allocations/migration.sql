-- The pre-תקופת-שרות target table: replaced by company_allocations / soldier_allocations_v2.
-- Nothing reads or writes it any more (seed and item delete were the last users).
DROP TABLE "allocations";
