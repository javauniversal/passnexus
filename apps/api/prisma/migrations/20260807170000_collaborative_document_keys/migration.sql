CREATE TYPE "VaultItemEncryptionScheme" AS ENUM ('VAULT_KEY', 'DOCUMENT_KEY');

ALTER TABLE "VaultItem"
  ADD COLUMN "encryptionScheme" "VaultItemEncryptionScheme" NOT NULL DEFAULT 'VAULT_KEY',
  ADD COLUMN "encryptedDocumentKey" TEXT,
  ADD COLUMN "documentKeyNonce" TEXT;

ALTER TABLE "VaultItemRevision"
  ADD COLUMN "encryptionScheme" "VaultItemEncryptionScheme" NOT NULL DEFAULT 'VAULT_KEY';

ALTER TABLE "VaultItemShare"
  DROP COLUMN "encryptedData",
  DROP COLUMN "nonce";