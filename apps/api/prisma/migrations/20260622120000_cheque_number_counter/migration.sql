-- Hub-wide cheque number counter (one sequence per business date across all venues)
CREATE TABLE "cheque_number_counters" (
    "business_date" DATE NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "cheque_number_counters_pkey" PRIMARY KEY ("business_date")
);

-- Seed counters from existing max cheque numbers per business date
INSERT INTO "cheque_number_counters" ("business_date", "last_number")
SELECT "business_date", COALESCE(MAX("cheque_number"), 0)
FROM "cheques"
GROUP BY "business_date"
ON CONFLICT ("business_date") DO NOTHING;
