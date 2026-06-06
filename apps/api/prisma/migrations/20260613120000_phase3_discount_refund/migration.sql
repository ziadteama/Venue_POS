-- Cheque-level discount + GM-workflow refunds (US-5.6)
ALTER TABLE "cheques" ADD COLUMN "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "cheque_discount_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cheque_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "initiator_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "percent" DECIMAL(5,2),
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheque_discount_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cheque_id" UUID NOT NULL,
    "payment_id" UUID,
    "cashier_id" UUID NOT NULL,
    "shift_id" UUID,
    "initiator_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_discount_audit_cheque" ON "cheque_discount_audits"("cheque_id");
CREATE INDEX "idx_refunds_cheque" ON "refunds"("cheque_id");
CREATE INDEX "idx_refunds_shift" ON "refunds"("shift_id");

ALTER TABLE "cheque_discount_audits" ADD CONSTRAINT "cheque_discount_audits_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cheque_discount_audits" ADD CONSTRAINT "cheque_discount_audits_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheque_discount_audits" ADD CONSTRAINT "cheque_discount_audits_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheque_discount_audits" ADD CONSTRAINT "cheque_discount_audits_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
