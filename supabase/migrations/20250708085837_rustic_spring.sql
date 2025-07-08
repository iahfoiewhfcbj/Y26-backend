/*
  # Separate Workshops from Events

  1. New Tables
    - `workshops`
      - `id` (uuid, primary key)
      - `title` (text)
      - `status` (WorkshopStatus enum)
      - `coordinatorEmail` (text, optional)
      - `description` (text, optional)
      - `venueId` (text, optional)
      - `dateTime` (timestamp, optional)
      - `createdAt` (timestamp)
      - `updatedAt` (timestamp)
      - `creatorId` (text, foreign key to users)
      - `coordinatorId` (text, optional, foreign key to users)

  2. New Enums
    - `WorkshopStatus` (PENDING, APPROVED, REJECTED, COMPLETED)

  3. New Relations
    - Workshop budgets, expenses, and approvals tables
    - Foreign key constraints for workshop relationships

  4. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users based on roles

  5. Changes
    - Remove EVENT/WORKSHOP type from events table
    - Update existing data to separate events and workshops
*/

-- Create WorkshopStatus enum
CREATE TYPE "WorkshopStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- Create workshops table
CREATE TABLE IF NOT EXISTS "workshops" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WorkshopStatus" NOT NULL DEFAULT 'PENDING',
    "coordinatorEmail" TEXT,
    "description" TEXT,
    "venueId" TEXT,
    "dateTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "coordinatorId" TEXT,

    CONSTRAINT "workshops_pkey" PRIMARY KEY ("id")
);

-- Create workshop_budgets table
CREATE TABLE IF NOT EXISTS "workshop_budgets" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sponsorAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedAmount" DOUBLE PRECISION,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workshopId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "workshop_budgets_pkey" PRIMARY KEY ("id")
);

-- Create workshop_expenses table
CREATE TABLE IF NOT EXISTS "workshop_expenses" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workshopId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "productId" TEXT,

    CONSTRAINT "workshop_expenses_pkey" PRIMARY KEY ("id")
);

-- Create workshop_budget_approvals table
CREATE TABLE IF NOT EXISTS "workshop_budget_approvals" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workshopId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,

    CONSTRAINT "workshop_budget_approvals_pkey" PRIMARY KEY ("id")
);

-- Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "workshop_budgets_workshopId_categoryId_key" ON "workshop_budgets"("workshopId", "categoryId");

-- Add foreign key constraints
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workshop_budgets" ADD CONSTRAINT "workshop_budgets_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workshop_budgets" ADD CONSTRAINT "workshop_budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workshop_expenses" ADD CONSTRAINT "workshop_expenses_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workshop_expenses" ADD CONSTRAINT "workshop_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workshop_expenses" ADD CONSTRAINT "workshop_expenses_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workshop_expenses" ADD CONSTRAINT "workshop_expenses_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workshop_budget_approvals" ADD CONSTRAINT "workshop_budget_approvals_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workshop_budget_approvals" ADD CONSTRAINT "workshop_budget_approvals_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS on all workshop tables
ALTER TABLE "workshops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workshop_budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workshop_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workshop_budget_approvals" ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for workshops
CREATE POLICY "Users can read workshops based on role"
  ON "workshops"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Workshop team leads can create workshops"
  ON "workshops"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'role' = 'WORKSHOP_TEAM_LEAD' OR auth.jwt() ->> 'role' = 'ADMIN');

CREATE POLICY "Workshop creators can update their workshops"
  ON "workshops"
  FOR UPDATE
  TO authenticated
  USING ("creatorId" = auth.uid() OR auth.jwt() ->> 'role' = 'ADMIN');

-- Add RLS policies for workshop budgets
CREATE POLICY "Users can read workshop budgets"
  ON "workshop_budgets"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can manage workshop budgets"
  ON "workshop_budgets"
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('WORKSHOP_TEAM_LEAD', 'FINANCE_TEAM', 'ADMIN'));

-- Add RLS policies for workshop expenses
CREATE POLICY "Users can read workshop expenses"
  ON "workshop_expenses"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized users can manage workshop expenses"
  ON "workshop_expenses"
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('FACILITIES_TEAM', 'FINANCE_TEAM', 'ADMIN'));

-- Add RLS policies for workshop budget approvals
CREATE POLICY "Users can read workshop budget approvals"
  ON "workshop_budget_approvals"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finance team can manage workshop budget approvals"
  ON "workshop_budget_approvals"
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('FINANCE_TEAM', 'ADMIN'));

-- Remove EventType enum and type column from events table
ALTER TABLE "events" DROP COLUMN IF EXISTS "type";
DROP TYPE IF EXISTS "EventType";