CREATE TYPE "VaultItemShareSource" AS ENUM ('DIRECT', 'TEAM');

ALTER TABLE "VaultItemShare"
  ADD COLUMN "source" "VaultItemShareSource" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN "teamShareId" UUID;

DROP INDEX IF EXISTS "VaultItemShare_vaultItemId_recipientId_key";

CREATE TABLE "VaultItemTeamShare" (
  "id" UUID NOT NULL,
  "vaultItemId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sharedById" UUID NOT NULL,
  "permission" TEXT NOT NULL DEFAULT 'read',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VaultItemTeamShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultItemShare_vaultItemId_recipientId_source_sourceKey_key"
  ON "VaultItemShare"("vaultItemId", "recipientId", "source", "sourceKey");
CREATE INDEX "VaultItemShare_teamShareId_revokedAt_idx"
  ON "VaultItemShare"("teamShareId", "revokedAt");
CREATE UNIQUE INDEX "VaultItemTeamShare_vaultItemId_teamId_key"
  ON "VaultItemTeamShare"("vaultItemId", "teamId");
CREATE INDEX "VaultItemTeamShare_teamId_revokedAt_idx"
  ON "VaultItemTeamShare"("teamId", "revokedAt");
CREATE INDEX "VaultItemTeamShare_organizationId_idx"
  ON "VaultItemTeamShare"("organizationId");

ALTER TABLE "VaultItemShare"
  ADD CONSTRAINT "VaultItemShare_teamShareId_fkey"
  FOREIGN KEY ("teamShareId") REFERENCES "VaultItemTeamShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultItemTeamShare"
  ADD CONSTRAINT "VaultItemTeamShare_vaultItemId_fkey"
  FOREIGN KEY ("vaultItemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultItemTeamShare"
  ADD CONSTRAINT "VaultItemTeamShare_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;