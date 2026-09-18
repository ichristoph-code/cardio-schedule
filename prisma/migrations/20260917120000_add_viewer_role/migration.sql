-- AlterEnum: add VIEWER as a non-clinical read-only role
ALTER TYPE "UserRole" ADD VALUE 'VIEWER';
