-- AlterTable: a hidden override suppresses a built-in holiday on that date.
ALTER TABLE "CustomHoliday" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
