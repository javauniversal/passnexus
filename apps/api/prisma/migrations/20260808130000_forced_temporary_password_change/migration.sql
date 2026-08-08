ALTER TYPE "AuthTokenPurpose" ADD VALUE 'PASSWORD_CHANGE';

ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "mustChangePassword" = true
WHERE EXISTS (
  SELECT 1
  FROM "AuditEvent"
  WHERE "AuditEvent"."action" = 'user.temporary-password-generated'
    AND "AuditEvent"."entity" = 'User'
    AND "AuditEvent"."entityId" = "User"."id"::text
);

UPDATE "Session"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL
  AND "userId" IN (
    SELECT "id"
    FROM "User"
    WHERE "mustChangePassword" = true
  );