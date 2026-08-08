INSERT INTO "Permission" ("id", "code", "name", "description")
VALUES (
  gen_random_uuid(),
  'roles.create',
  'Crear roles',
  'Permite crear roles con permisos configurables.'
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'ADMINISTRATOR'
  AND permission."code" = 'roles.create'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;