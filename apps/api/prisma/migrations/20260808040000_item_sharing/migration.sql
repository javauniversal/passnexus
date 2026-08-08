CREATE TABLE "UserCryptoKey" (
    "userId" UUID NOT NULL,
    "publicKey" JSONB NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "privateKeyNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserCryptoKey_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "VaultItemShare" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vaultItemId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "encryptedItemKey" TEXT NOT NULL,
    "itemKeyNonce" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultItemShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultItemShare_vaultItemId_recipientId_key" ON "VaultItemShare"("vaultItemId", "recipientId");
CREATE INDEX "VaultItemShare_recipientId_revokedAt_expiresAt_idx" ON "VaultItemShare"("recipientId", "revokedAt", "expiresAt");
ALTER TABLE "UserCryptoKey" ADD CONSTRAINT "UserCryptoKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultItemShare" ADD CONSTRAINT "VaultItemShare_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultItemShare" ADD CONSTRAINT "VaultItemShare_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;