-- AlterTable
ALTER TABLE "cheques" ADD COLUMN "split_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "cheque_item_transfer_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_cheque_id" UUID NOT NULL,
    "target_cheque_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheque_item_transfer_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transfer_audit_source" ON "cheque_item_transfer_audits"("source_cheque_id");

-- CreateIndex
CREATE INDEX "idx_transfer_audit_target" ON "cheque_item_transfer_audits"("target_cheque_id");

-- AddForeignKey
ALTER TABLE "cheque_item_transfer_audits" ADD CONSTRAINT "cheque_item_transfer_audits_source_cheque_id_fkey" FOREIGN KEY ("source_cheque_id") REFERENCES "cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_item_transfer_audits" ADD CONSTRAINT "cheque_item_transfer_audits_target_cheque_id_fkey" FOREIGN KEY ("target_cheque_id") REFERENCES "cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_item_transfer_audits" ADD CONSTRAINT "cheque_item_transfer_audits_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_item_transfer_audits" ADD CONSTRAINT "cheque_item_transfer_audits_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_item_transfer_audits" ADD CONSTRAINT "cheque_item_transfer_audits_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
