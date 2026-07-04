/*
  Warnings:

  - You are about to drop the column `totalSpent` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "totalSpent";

-- AlterTable
ALTER TABLE "UserCustomer" ADD COLUMN     "totalSpendLive" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "totalSpendTest" DECIMAL(20,8) NOT NULL DEFAULT 0;
