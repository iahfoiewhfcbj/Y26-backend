-- CreateTable
CREATE TABLE "notification_history" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetRole" TEXT,
    "targetUserId" TEXT,
    "sentToCount" INTEGER NOT NULL,
    "sentBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_sentBy_fkey" FOREIGN KEY ("sentBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
