INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'ADMINISTRATOR'
  AND permission."code" IN (
    'organizations.create',
    'organizations.update',
    'organizations.delete'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;