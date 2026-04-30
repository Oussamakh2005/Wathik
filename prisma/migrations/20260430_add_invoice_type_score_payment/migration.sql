/*
  Warnings:

  - Added the required column `type` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SELL', 'BUY');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "type" "InvoiceType" NOT NULL DEFAULT 'SELL',
ADD COLUMN "score" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paymentToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentToken_key" ON "Invoice"("paymentToken");
