-- CreateTable
CREATE TABLE "order_void_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_void_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_void_audits_order_id_key" ON "order_void_audits"("order_id");
CREATE INDEX "idx_void_audit_cashier" ON "order_void_audits"("cashier_id");
CREATE INDEX "idx_void_audit_approver" ON "order_void_audits"("approver_id");

-- AddForeignKey
ALTER TABLE "order_void_audits" ADD CONSTRAINT "order_void_audits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_void_audits" ADD CONSTRAINT "order_void_audits_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_void_audits" ADD CONSTRAINT "order_void_audits_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
