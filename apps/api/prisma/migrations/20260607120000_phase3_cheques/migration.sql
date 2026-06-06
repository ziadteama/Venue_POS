-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('open', 'paid', 'voided');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'voucher');

-- CreateTable
CREATE TABLE "cheques" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "terminal_id" UUID,
    "cashier_id" UUID NOT NULL,
    "cheque_number" INTEGER NOT NULL,
    "table_label" VARCHAR(50) NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheque_orders" (
    "cheque_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheque_orders_pkey" PRIMARY KEY ("cheque_id","order_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cheque_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cheque_orders_order_id_key" ON "cheque_orders"("order_id");

-- CreateIndex
CREATE INDEX "idx_cheque_orders_cheque" ON "cheque_orders"("cheque_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cheques_venue_number" ON "cheques"("venue_id", "cheque_number");

-- CreateIndex
CREATE INDEX "idx_cheques_venue_status" ON "cheques"("venue_id", "status");

-- CreateIndex
CREATE INDEX "idx_cheques_venue_table" ON "cheques"("venue_id", "table_label");

-- CreateIndex
CREATE INDEX "idx_payments_cheque" ON "payments"("cheque_id");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_orders" ADD CONSTRAINT "cheque_orders_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheque_orders" ADD CONSTRAINT "cheque_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
