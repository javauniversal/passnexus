-- AlterTable
ALTER TABLE "VaultItem" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VaultItemRevision" (
    "id" UUID NOT NULL,
    "vaultItemId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultItemRevision_vaultItemId_createdAt_idx" ON "VaultItemRevision"("vaultItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VaultItemRevision_vaultItemId_version_key" ON "VaultItemRevision"("vaultItemId", "version");

-- AddForeignKey
ALTER TABLE "VaultItemRevision" ADD CONSTRAINT "VaultItemRevision_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
