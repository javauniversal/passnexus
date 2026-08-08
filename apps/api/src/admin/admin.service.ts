import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
  }

  listUserRoleOptions() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { code: true, name: true, description: true },
    });
  }

  async createUser(actorId: string, createUserDto: CreateUserDto) {
    const email = createUserDto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta para este correo electrónico.',
      );
    }
    const roles = await this.prisma.role.findMany({
      where: { code: { in: createUserDto.roleCodes } },
    });
    if (roles.length !== new Set(createUserDto.roleCodes).size) {
      throw new BadRequestException('Uno o más roles no existen.');
    }
    const passwordHash = await argon2.hash(randomBytes(32).toString('base64'), {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: createUserDto.displayName.trim(),
        passwordHash,
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
    const setupUrl = await this.authService.createPasswordSetupLink(user.id);
    await this.audit(actorId, 'user.created', 'User', user.id, {
      roleCodes: createUserDto.roleCodes,
    });
    return { ...user, setupUrl };
  }

  async generateUserSetupLink(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException(
        'Sólo se puede generar un enlace para usuarios pendientes.',
      );
    }
    const setupUrl = await this.authService.createPasswordSetupLink(user.id);
    await this.audit(
      actorId,
      'user.setup-link-regenerated',
      'User',
      user.id,
      {},
    );
    return { setupUrl };
  }

  async generateTemporaryPassword(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status === 'SUSPENDED') {
      throw new BadRequestException(
        'Reactiva la cuenta antes de generar una contraseña temporal.',
      );
    }
    const temporaryPassword = randomBytes(18).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          status: 'ACTIVE',
          mustChangePassword: true,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.authToken.deleteMany({
        where: {
          userId,
          purpose: { in: ['PASSWORD_RESET', 'PASSWORD_CHANGE'] },
          consumedAt: null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId: actorId,
          action: 'user.temporary-password-generated',
          entity: 'User',
          entityId: userId,
          metadata: {},
        },
      });
    });
    return { temporaryPassword };
  }

  async updateUser(
    actorId: string,
    userId: string,
    updateUserDto: UpdateUserDto,
  ) {
    if (actorId === userId && updateUserDto.status === 'SUSPENDED') {
      throw new BadRequestException('No puedes suspender tu propia cuenta.');
    }
    const roles = updateUserDto.roleCodes
      ? await this.prisma.role.findMany({
          where: { code: { in: updateUserDto.roleCodes } },
        })
      : undefined;
    if (
      updateUserDto.roleCodes &&
      roles?.length !== new Set(updateUserDto.roleCodes).size
    ) {
      throw new BadRequestException('Uno o más roles no existen.');
    }
    const user = await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          status: updateUserDto.status,
          ...(roles
            ? {
                roles: {
                  deleteMany: {},
                  create: roles.map((role) => ({ roleId: role.id })),
                },
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          roles: { select: { role: { select: { code: true, name: true } } } },
        },
      })
      .catch(() => {
        throw new NotFoundException('Usuario no encontrado.');
      });
    await this.audit(actorId, 'USER_UPDATED', 'User', userId, {
      status: updateUserDto.status,
      roleCodes: updateUserDto.roleCodes,
    });
    return user;
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }

  async createRole(actorId: string, createRoleDto: CreateRoleDto) {
    const code = createRoleDto.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const name = createRoleDto.name.trim();
    const permissionCodes = [...new Set(createRoleDto.permissionCodes)];
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      throw new BadRequestException(
        'El código del rol debe comenzar con una letra.',
      );
    }
    if (!name)
      throw new BadRequestException('El nombre del rol es obligatorio.');
    if (await this.prisma.role.findUnique({ where: { code } })) {
      throw new ConflictException('Ya existe un rol con ese código.');
    }
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    if (permissions.length !== permissionCodes.length) {
      throw new BadRequestException('Uno o más permisos no existen.');
    }
    const role = await this.prisma.role.create({
      data: {
        code,
        name,
        description: createRoleDto.description?.trim() || null,
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    await this.audit(actorId, 'role.created', 'Role', role.id, {
      code,
      permissionCodes,
    });
    return role;
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      where: {
        code: {
          notIn: ['vault.write', 'users.manage', 'roles.manage', 'menu.manage'],
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async updateRolePermissions(
    actorId: string,
    roleId: string,
    updateRolePermissionsDto: UpdateRolePermissionsDto,
  ) {
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: updateRolePermissionsDto.permissionCodes } },
    });
    if (
      permissions.length !==
      new Set(updateRolePermissionsDto.permissionCodes).size
    ) {
      throw new BadRequestException('Uno o más permisos no existen.');
    }
    const role = await this.prisma.role
      .update({
        where: { id: roleId },
        data: {
          permissions: {
            deleteMany: {},
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      })
      .catch(() => {
        throw new NotFoundException('Rol no encontrado.');
      });
    await this.audit(actorId, 'ROLE_PERMISSIONS_UPDATED', 'Role', roleId, {
      permissionCodes: updateRolePermissionsDto.permissionCodes,
    });
    return role;
  }

  listMenuItems() {
    return this.prisma.menuItem.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      include: { permission: { select: { code: true, name: true } } },
    });
  }

  async createMenuItem(
    actorId: string,
    createMenuItemDto: CreateMenuItemDto,
  ) {
    const { permissionCode, ...menuItemData } = createMenuItemDto;
    const [permission, parent] = await Promise.all([
      permissionCode
        ? this.prisma.permission.findUnique({ where: { code: permissionCode } })
        : Promise.resolve(null),
      menuItemData.parentId
        ? this.prisma.menuItem.findUnique({ where: { id: menuItemData.parentId } })
        : Promise.resolve(null),
    ]);
    if (permissionCode && !permission)
      throw new BadRequestException('El permiso indicado no existe.');
    if (menuItemData.parentId && !parent)
      throw new BadRequestException('El elemento superior no existe.');

    const menuItem = await this.prisma.menuItem
      .create({
        data: {
          ...menuItemData,
          permissionId: permission?.id ?? null,
        },
        include: { permission: { select: { code: true, name: true } } },
      })
      .catch(() => {
        throw new BadRequestException('La clave de navegación ya existe.');
      });
    await this.audit(actorId, 'MENU_ITEM_CREATED', 'MenuItem', menuItem.id, {
      key: menuItem.key,
    });
    return menuItem;
  }

  async updateMenuItem(
    actorId: string,
    menuItemId: string,
    updateMenuItemDto: UpdateMenuItemDto,
  ) {
    const permission =
      updateMenuItemDto.permissionCode === undefined
        ? undefined
        : updateMenuItemDto.permissionCode
          ? await this.prisma.permission.findUnique({
              where: { code: updateMenuItemDto.permissionCode },
            })
          : null;
    if (updateMenuItemDto.permissionCode && !permission) {
      throw new BadRequestException('El permiso indicado no existe.');
    }
    const { permissionCode, ...menuItemData } = updateMenuItemDto;
    const menuItem = await this.prisma.menuItem
      .update({
        where: { id: menuItemId },
        data: {
          ...menuItemData,
          ...(permissionCode === undefined
            ? {}
            : { permissionId: permission?.id ?? null }),
        },
        include: { permission: { select: { code: true, name: true } } },
      })
      .catch(() => {
        throw new NotFoundException('Elemento de navegación no encontrado.');
      });
    await this.audit(
      actorId,
      'MENU_ITEM_UPDATED',
      'MenuItem',
      menuItemId,
      updateMenuItemDto,
    );
    return menuItem;
  }

  async deleteMenuItem(actorId: string, menuItemId: string) {
    const menuItem = await this.prisma.menuItem
      .delete({ where: { id: menuItemId } })
      .catch(() => {
        throw new NotFoundException('Elemento de navegación no encontrado.');
      });
    await this.audit(actorId, 'MENU_ITEM_DELETED', 'MenuItem', menuItemId, {
      key: menuItem.key,
    });
    return { id: menuItemId };
  }

  listAuditEvents() {
    return this.prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true, displayName: true } } },
    });
  }

  private audit(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata: object,
  ) {
    return this.prisma.auditEvent.create({
      data: { userId, action, entity, entityId, metadata },
    });
  }
}
