-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "is_comped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "order_item_comp_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "cheque_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_comp_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_item_comp_audits_order_item_id_key" ON "order_item_comp_audits"("order_item_id");

-- CreateIndex
CREATE INDEX "idx_comp_audit_cheque" ON "order_item_comp_audits"("cheque_id");

-- AddForeignKey
ALTER TABLE "order_item_comp_audits" ADD CONSTRAINT "order_item_comp_audits_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_comp_audits" ADD CONSTRAINT "order_item_comp_audits_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_comp_audits" ADD CONSTRAINT "order_item_comp_audits_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_comp_audits" ADD CONSTRAINT "order_item_comp_audits_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
