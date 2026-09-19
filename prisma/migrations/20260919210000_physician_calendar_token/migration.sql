-- AlterTable: secret for the physician's calendar-subscription URL (null = no feed).
-- IF NOT EXISTS guards against re-running if a prior deploy already added it.
ALTER TABLE "Physician" ADD COLUMN IF NOT EXISTS "calendarToken" TEXT;

-- CreateIndex: tokens are looked up directly and must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS "Physician_calendarToken_key" ON "Physician"("calendarToken");
