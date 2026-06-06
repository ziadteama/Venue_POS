-- CreateEnum
CREATE TYPE "OrderItemKitchenStatus" AS ENUM ('pending', 'in_progress', 'ready', 'served');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "kitchen_status" "OrderItemKitchenStatus" NOT NULL DEFAULT 'pending';
