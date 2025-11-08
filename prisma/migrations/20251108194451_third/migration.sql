/*
  Warnings:

  - The values [RESERVATION,RESERVATION_RELEASE] on the enum `InventoryMovementType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InventoryMovementType_new" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT');
ALTER TABLE "InventoryMovement" ALTER COLUMN "type" TYPE "InventoryMovementType_new" USING ("type"::text::"InventoryMovementType_new");
ALTER TYPE "InventoryMovementType" RENAME TO "InventoryMovementType_old";
ALTER TYPE "InventoryMovementType_new" RENAME TO "InventoryMovementType";
DROP TYPE "InventoryMovementType_old";
COMMIT;
