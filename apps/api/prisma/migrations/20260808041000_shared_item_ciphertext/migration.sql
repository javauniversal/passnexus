ALTER TABLE "VaultItemShare" ADD COLUMN "senderPublicKey" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "VaultItemShare" ADD COLUMN "encryptedData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VaultItemShare" ADD COLUMN "nonce" TEXT NOT NULL DEFAULT '';