-- CreateEnum
CREATE TYPE "ImagePosition" AS ENUM ('TOP', 'BOTTOM');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "imagePosition" "ImagePosition" NOT NULL DEFAULT 'TOP';

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "imagePosition" "ImagePosition" NOT NULL DEFAULT 'TOP';
