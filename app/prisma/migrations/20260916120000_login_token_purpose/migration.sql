-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('LOGIN', 'BIND_TELEGRAM');

-- AlterTable
ALTER TABLE "LoginToken" ADD COLUMN     "purpose" "TokenPurpose" NOT NULL DEFAULT 'LOGIN';
