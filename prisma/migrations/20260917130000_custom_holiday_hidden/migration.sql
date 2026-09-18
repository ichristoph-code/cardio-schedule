-- AlterTable: hidden flag lets admins suppress a built-in holiday globally.
ALTER TABLE "CustomHoliday" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
