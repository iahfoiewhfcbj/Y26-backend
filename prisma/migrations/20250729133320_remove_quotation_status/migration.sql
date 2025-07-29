/*
  Warnings:

  - You are about to drop the column `status` on the `quotations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "quotations" DROP COLUMN "status";

-- DropEnum
DROP TYPE "QuotationStatus";
