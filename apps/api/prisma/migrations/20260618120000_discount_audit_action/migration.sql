-- Track discount apply, change, and remove in audit trail
CREATE TYPE "ChequeDiscountAction" AS ENUM ('apply', 'change', 'remove');

ALTER TABLE "cheque_discount_audits"
  ADD COLUMN "action" "ChequeDiscountAction" NOT NULL DEFAULT 'apply',
  ADD COLUMN "previous_amount" DECIMAL(10, 2);
