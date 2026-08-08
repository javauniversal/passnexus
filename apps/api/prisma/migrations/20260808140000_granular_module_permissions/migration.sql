INSERT INTO "Permission" ("id", "code", "name", "description") VALUES
  (gen_random_uuid(), 'vault.read', 'Ver vault', 'Permite consultar vaults y secretos.'),
  (gen_random_uuid(), 'vault.create', 'Crear en vault', 'Permite crear vaults, secretos e importaciones.'),
  (gen_random_uuid(), 'vault.update', 'Editar en vault', 'Permite editar secretos, claves y comparticiones.'),
  (gen_random_uuid(), 'vault.delete', 'Eliminar del vault', 'Permite eliminar secretos y comparticiones.'),
  (gen_random_uuid(), 'organizations.read', 'Ver organizaciones', 'Permite consultar organizaciones, miembros y equipos.'),
  (gen_random_uuid(), 'organizations.create', 'Crear organizaciones', 'Permite crear organizaciones.'),
  (gen_random_uuid(), 'organizations.update', 'Editar organizaciones', 'Permite incorporar miembros y gestionar equipos.'),
  (gen_random_uuid(), 'organizations.delete', 'Eliminar en organizaciones', 'Permite retirar miembros y equipos.'),
  (gen_random_uuid(), 'users.read', 'Ver usuarios', 'Permite consultar el directorio de usuarios.'),
  (gen_random_uuid(), 'users.create', 'Crear usuarios', 'Permite crear cuentas internas.'),
  (gen_random_uuid(), 'users.update', 'Editar usuarios', 'Permite editar accesos y regenerar credenciales.'),
  (gen_random_uuid(), 'roles.read', 'Ver roles', 'Permite consultar roles y permisos.'),
  (gen_random_uuid(), 'roles.update', 'Editar roles', 'Permite cambiar los permisos de los roles.'),
  (gen_random_uuid(), 'navigation.read', 'Ver navegación', 'Permite consultar la configuración del menú.'),
  (gen_random_uuid(), 'navigation.update', 'Editar navegación', 'Permite editar la configuración del menú.'),
  (gen_random_uuid(), 'audit.read', 'Ver auditoría', 'Permite consultar eventos de seguridad.')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";

-- Preserve every role's current capabilities while splitting broad permissions.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT existing."roleId", target."id"
FROM "RolePermission" existing
JOIN "Permission" legacy ON legacy."id" = existing."permissionId"
JOIN "Permission" target ON target."code" = ANY (
  CASE legacy."code"
    WHEN 'vault.read' THEN ARRAY['vault.read', 'organizations.read']
    WHEN 'vault.write' THEN ARRAY['vault.create', 'vault.update', 'vault.delete']
    WHEN 'users.manage' THEN ARRAY['users.read', 'users.create', 'users.update']
    WHEN 'roles.manage' THEN ARRAY['roles.read', 'roles.update']
    WHEN 'menu.manage' THEN ARRAY['navigation.read', 'navigation.update']
    WHEN 'audit.read' THEN ARRAY['audit.read']
    ELSE ARRAY[]::text[]
  END
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- VAULT_MEMBER can discover and inspect organizations, but cannot mutate them.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'VAULT_MEMBER'
  AND permission."code" = 'organizations.read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "RolePermission"
USING "Permission"
WHERE "RolePermission"."permissionId" = "Permission"."id"
  AND "Permission"."code" IN ('vault.write', 'users.manage', 'roles.manage', 'menu.manage');

UPDATE "MenuItem"
SET "permissionId" = (SELECT "id" FROM "Permission" WHERE "code" = 'organizations.read')
WHERE "key" = 'organizations';

UPDATE "MenuItem"
SET "permissionId" = (SELECT "id" FROM "Permission" WHERE "code" = 'users.read')
WHERE "key" = 'users';

UPDATE "MenuItem"
SET "permissionId" = (SELECT "id" FROM "Permission" WHERE "code" = 'roles.read')
WHERE "key" = 'roles';

UPDATE "MenuItem"
SET "permissionId" = (SELECT "id" FROM "Permission" WHERE "code" = 'navigation.read')
WHERE "key" = 'navigation';