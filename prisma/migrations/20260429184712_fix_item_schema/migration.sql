/*
  Warnings:

  - You are about to alter the column `price` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);
