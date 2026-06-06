-- Venue manager requests from POS; hub manager approves from dashboard
CREATE TYPE "ApprovalRequestType" AS ENUM ('discount', 'refund');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "manager_approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "cheque_id" UUID NOT NULL,
    "type" "ApprovalRequestType" NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "cashier_id" UUID NOT NULL,
    "initiator_id" UUID NOT NULL,
    "approver_id" UUID,
    "terminal_id" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "manager_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_approval_requests_venue_status" ON "manager_approval_requests"("venue_id", "status");
CREATE INDEX "idx_approval_requests_cheque" ON "manager_approval_requests"("cheque_id");

ALTER TABLE "manager_approval_requests" ADD CONSTRAINT "manager_approval_requests_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_approval_requests" ADD CONSTRAINT "manager_approval_requests_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_approval_requests" ADD CONSTRAINT "manager_approval_requests_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_approval_requests" ADD CONSTRAINT "manager_approval_requests_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_approval_requests" ADD CONSTRAINT "manager_approval_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
