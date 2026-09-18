-- AlterTable: hidden flag lets admins suppress a built-in holiday globally.
-- IF NOT EXISTS guards against re-running if the column was already added by a prior deploy.
ALTER TABLE "CustomHoliday" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;
