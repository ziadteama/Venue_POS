-- AlterTable
ALTER TABLE "cheques" ADD COLUMN "split_label" VARCHAR(50),
ADD COLUMN "parent_cheque_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "billing_cheque_id" UUID,
ADD COLUMN "paid_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_cheques_parent" ON "cheques"("parent_cheque_id");

-- CreateIndex
CREATE INDEX "idx_order_items_billing_cheque" ON "order_items"("billing_cheque_id");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_parent_cheque_id_fkey" FOREIGN KEY ("parent_cheque_id") REFERENCES "cheques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_billing_cheque_id_fkey" FOREIGN KEY ("billing_cheque_id") REFERENCES "cheques"("id") ON DELETE SET NULL ON UPDATE CASCADE;
