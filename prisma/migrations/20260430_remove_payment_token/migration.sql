/*
  Warnings:

  - You are about to drop the column `paymentToken` on the `Invoice` table. All the data in that column will be lost.

*/
-- DropIndex
DROP INDEX "Invoice_paymentToken_key";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "paymentToken";
