/*
  Warnings:

  - You are about to drop the column `dateTime` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `dateTime` on the `workshops` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "events" DROP COLUMN "dateTime",
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "workshops" DROP COLUMN "dateTime",
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "startTime" TEXT;
