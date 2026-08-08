import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  ['vault.read', 'Ver vault', 'Permite consultar vaults y secretos.'],
  ['vault.create', 'Crear en vault', 'Permite crear vaults, secretos e importaciones.'],
  ['vault.update', 'Editar en vault', 'Permite editar secretos, claves y comparticiones.'],
  ['vault.delete', 'Eliminar del vault', 'Permite eliminar secretos y comparticiones.'],
  ['organizations.read', 'Ver organizaciones', 'Permite consultar organizaciones, miembros y equipos.'],
  ['organizations.create', 'Crear organizaciones', 'Permite crear organizaciones.'],
  ['organizations.update', 'Editar organizaciones', 'Permite incorporar miembros y gestionar equipos.'],
  ['organizations.delete', 'Eliminar en organizaciones', 'Permite retirar miembros y equipos.'],
  ['users.read', 'Ver usuarios', 'Permite consultar el directorio de usuarios.'],
  ['users.create', 'Crear usuarios', 'Permite crear cuentas internas.'],
  ['users.update', 'Editar usuarios', 'Permite editar accesos y regenerar credenciales.'],
  ['roles.read', 'Ver roles', 'Permite consultar roles y permisos.'],
  ['roles.create', 'Crear roles', 'Permite crear roles con permisos configurables.'],
  ['roles.update', 'Editar roles', 'Permite cambiar los permisos de los roles.'],
  ['navigation.read', 'Ver navegación', 'Permite consultar la configuración del menú.'],
  ['navigation.update', 'Editar navegación', 'Permite editar la configuración del menú.'],
  ['audit.read', 'Ver auditoría', 'Permite consultar eventos de seguridad.'],
];

async function upsertPermission([code, name, description]) {
  return prisma.permission.upsert({
    where: { code },
    update: { name, description },
    create: { code, name, description },
  });
}

async function main() {
  const permissionRecords = await Promise.all(permissions.map(upsertPermission));
  const permissionsByCode = new Map(permissionRecords.map((permission) => [permission.code, permission]));

  const administratorRole = await prisma.role.upsert({
    where: { code: 'ADMINISTRATOR' },
    update: { name: 'Administrador', description: 'Control total de PassNexus.', isSystem: true },
    create: { code: 'ADMINISTRATOR', name: 'Administrador', description: 'Control total de PassNexus.', isSystem: true },
  });
  const vaultMemberRole = await prisma.role.upsert({
    where: { code: 'VAULT_MEMBER' },
    update: { name: 'Miembro de vault', description: 'Gestiona sus propios secretos.', isSystem: true },
    create: { code: 'VAULT_MEMBER', name: 'Miembro de vault', description: 'Gestiona sus propios secretos.', isSystem: true },
  });

  for (const permission of permissionRecords) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: administratorRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: administratorRole.id, permissionId: permission.id },
    });
  }
  for (const permissionCode of [
    'vault.read',
    'vault.create',
    'vault.update',
    'vault.delete',
    'organizations.read',
  ]) {
    const permission = permissionsByCode.get(permissionCode);
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: vaultMemberRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: vaultMemberRole.id, permissionId: permission.id },
    });
  }

  const adminMenu = await prisma.menuItem.upsert({
    where: { key: 'administration' },
    update: { label: 'Administración', icon: 'Settings', type: 'GROUP', sortOrder: 90, isVisible: true },
    create: { key: 'administration', label: 'Administración', icon: 'Settings', type: 'GROUP', sortOrder: 90, isVisible: true },
  });
  const menuItems = [
    { key: 'vault', label: 'Mi vault', path: '/vault', icon: 'KeyRound', type: 'PAGE', sortOrder: 10, permission: 'vault.read' },
    { key: 'organizations', label: 'Organizaciones', path: '/organizations', icon: 'Building2', type: 'PAGE', sortOrder: 20, permission: 'organizations.read' },
    { key: 'audit', label: 'Auditoría', path: '/admin/audit', icon: 'ScrollText', type: 'PAGE', sortOrder: 10, parentId: adminMenu.id, permission: 'audit.read' },
    { key: 'users', label: 'Usuarios', path: '/admin/users', icon: 'Users', type: 'PAGE', sortOrder: 20, parentId: adminMenu.id, permission: 'users.read' },
    { key: 'roles', label: 'Roles y permisos', path: '/admin/roles', icon: 'ShieldCheck', type: 'PAGE', sortOrder: 30, parentId: adminMenu.id, permission: 'roles.read' },
    { key: 'navigation', label: 'Navegación', path: '/admin/navigation', icon: 'PanelLeft', type: 'PAGE', sortOrder: 40, parentId: adminMenu.id, permission: 'navigation.read' },
  ];

  for (const menuItem of menuItems) {
    const { permission: permissionCode, ...menuItemData } = menuItem;
    const permission = permissionsByCode.get(permissionCode);
    await prisma.menuItem.upsert({
      where: { key: menuItemData.key },
      update: { ...menuItemData, permissionId: permission.id },
      create: { ...menuItemData, permissionId: permission.id },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });