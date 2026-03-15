-- Add missing description column to SchedulingRule
ALTER TABLE "SchedulingRule" ADD COLUMN "description" TEXT;

-- Create NoCallDayRequest table
CREATE TABLE "NoCallDayRequest" (
    "id" TEXT NOT NULL,
    "physicianId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoCallDayRequest_pkey" PRIMARY KEY ("id")
);

-- Create indexes for NoCallDayRequest
CREATE INDEX "NoCallDayRequest_date_idx" ON "NoCallDayRequest"("date");
CREATE UNIQUE INDEX "NoCallDayRequest_physicianId_date_key" ON "NoCallDayRequest"("physicianId", "date");

-- Add foreign key for NoCallDayRequest
ALTER TABLE "NoCallDayRequest" ADD CONSTRAINT "NoCallDayRequest_physicianId_fkey" FOREIGN KEY ("physicianId") REFERENCES "Physician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fix HolidayAssignment unique index: change from (holidayId, year) to (holidayId, year, roleTypeId)
DROP INDEX "HolidayAssignment_holidayId_year_key";
CREATE UNIQUE INDEX "HolidayAssignment_holidayId_year_roleTypeId_key" ON "HolidayAssignment"("holidayId", "year", "roleTypeId");

-- Add missing foreign keys
ALTER TABLE "HolidayAssignment" ADD CONSTRAINT "HolidayAssignment_roleTypeId_fkey" FOREIGN KEY ("roleTypeId") REFERENCES "RoleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_roleTypeId_fkey" FOREIGN KEY ("roleTypeId") REFERENCES "RoleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
