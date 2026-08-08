import { BadRequestException, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminService } from './admin.service';

describe('AdminService user invitations', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    menuItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    session: {
      updateMany: jest.fn(),
    },
    authToken: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const authService = {
    createPasswordSetupLink: jest.fn(),
  };
  const service = new AdminService(prisma as never, authService as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.auditEvent.create.mockResolvedValue({ id: 'audit-id' });
    prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    authService.createPasswordSetupLink.mockResolvedValue(
      'http://127.0.0.1:5173/#reset?token=setup-token',
    );
  });

  it('creates a pending account with a generated hash and returns a setup link', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-id', code: 'VAULT_MEMBER', name: 'Miembro del vault' },
    ]);
    prisma.user.create.mockImplementation(
      async ({ data }: { data: { email: string; displayName: string } }) => ({
        id: 'user-id',
        email: data.email,
        displayName: data.displayName,
        status: 'PENDING_VERIFICATION',
        emailVerifiedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        roles: [{ role: { code: 'VAULT_MEMBER', name: 'Miembro del vault' } }],
      }),
    );

    const user = await service.createUser('admin-id', {
      email: ' ANA@EXAMPLE.COM ',
      displayName: ' Ana García ',
      roleCodes: ['VAULT_MEMBER'],
    });

    expect(user).toEqual(
      expect.objectContaining({
        email: 'ana@example.com',
        status: 'PENDING_VERIFICATION',
        setupUrl: 'http://127.0.0.1:5173/#reset?token=setup-token',
      }),
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'ana@example.com',
          displayName: 'Ana García',
          passwordHash: expect.stringMatching(/^\$argon2id\$/),
          roles: { create: [{ roleId: 'role-id' }] },
        }),
      }),
    );
    expect(authService.createPasswordSetupLink).toHaveBeenCalledWith('user-id');
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-id',
        action: 'user.created',
        entity: 'User',
        entityId: 'user-id',
        metadata: { roleCodes: ['VAULT_MEMBER'] },
      },
    });
  });

  it('rejects an invitation when the email already belongs to an account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.createUser('admin-id', {
        email: 'ana@example.com',
        displayName: 'Ana García',
        roleCodes: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(authService.createPasswordSetupLink).not.toHaveBeenCalled();
  });

  it('regenerates setup links only while the account is pending', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'pending-user',
      email: 'pending@example.com',
      status: 'PENDING_VERIFICATION',
    });

    await expect(
      service.generateUserSetupLink('admin-id', 'pending-user'),
    ).resolves.toEqual({
      setupUrl: 'http://127.0.0.1:5173/#reset?token=setup-token',
    });
    expect(authService.createPasswordSetupLink).toHaveBeenCalledWith(
      'pending-user',
    );

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'active-user',
      email: 'active@example.com',
      status: 'ACTIVE',
    });
    await expect(
      service.generateUserSetupLink('admin-id', 'active-user'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates a temporary password, activates the account and revokes prior access', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'pending-user',
      status: 'PENDING_VERIFICATION',
      emailVerifiedAt: null,
    });
    prisma.user.update.mockResolvedValue({ id: 'pending-user' });
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.generateTemporaryPassword(
      'admin-id',
      'pending-user',
    );

    expect(result.temporaryPassword).toHaveLength(24);
    const passwordHash = (
      prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }
    ).data.passwordHash;
    await expect(
      argon2.verify(passwordHash, result.temporaryPassword),
    ).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pending-user' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          mustChangePassword: true,
        }),
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'pending-user', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'pending-user',
        purpose: { in: ['PASSWORD_RESET', 'PASSWORD_CHANGE'] },
        consumedAt: null,
      },
    });
  });

  it('keeps the role user count when permissions are replaced', async () => {
    prisma.permission.findMany.mockResolvedValue([
      { id: 'permission-id', code: 'organizations.read' },
    ]);
    prisma.role.update.mockResolvedValue({
      id: 'role-id',
      permissions: [],
      _count: { users: 4 },
    });

    await service.updateRolePermissions('admin-id', 'role-id', {
      permissionCodes: ['organizations.read'],
    });

    expect(prisma.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      }),
    );
  });

  it('creates a normalized role with its initial permissions and user count', async () => {
    prisma.role.findUnique.mockResolvedValue(null);
    prisma.permission.findMany.mockResolvedValue([
      { id: 'read-permission', code: 'organizations.read' },
    ]);
    prisma.role.create.mockResolvedValue({
      id: 'role-id',
      code: 'ORG_AUDITOR',
      name: 'Auditor de organizaciones',
      permissions: [],
      _count: { users: 0 },
    });

    await service.createRole('admin-id', {
      code: ' org auditor ',
      name: ' Auditor de organizaciones ',
      description: ' Sólo consulta ',
      permissionCodes: ['organizations.read', 'organizations.read'],
    });

    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        code: 'ORG_AUDITOR',
        name: 'Auditor de organizaciones',
        description: 'Sólo consulta',
        permissions: { create: [{ permissionId: 'read-permission' }] },
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-id',
        action: 'role.created',
        entity: 'Role',
        entityId: 'role-id',
        metadata: {
          code: 'ORG_AUDITOR',
          permissionCodes: ['organizations.read'],
        },
      },
    });
  });

  it('creates a navigation item with its permission and parent', async () => {
    prisma.permission.findUnique.mockResolvedValue({
      id: 'permission-id',
      code: 'users.read',
    });
    prisma.menuItem.findUnique.mockResolvedValue({ id: 'parent-id' });
    prisma.menuItem.create.mockResolvedValue({
      id: 'menu-item-id',
      key: 'reports',
      label: 'Reportes',
      permission: { code: 'users.read', name: 'Ver usuarios' },
    });

    const result = await service.createMenuItem('admin-id', {
      key: 'reports',
      label: 'Reportes',
      path: '/admin/reports',
      type: 'PAGE',
      sortOrder: 50,
      isVisible: true,
      parentId: 'parent-id',
      permissionCode: 'users.read',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'menu-item-id' }));
    expect(prisma.menuItem.create).toHaveBeenCalledWith({
      data: {
        key: 'reports',
        label: 'Reportes',
        path: '/admin/reports',
        type: 'PAGE',
        sortOrder: 50,
        isVisible: true,
        parentId: 'parent-id',
        permissionId: 'permission-id',
      },
      include: { permission: { select: { code: true, name: true } } },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-id',
        action: 'MENU_ITEM_CREATED',
        entity: 'MenuItem',
        entityId: 'menu-item-id',
        metadata: { key: 'reports' },
      },
    });
  });

  it('deletes a navigation item and records the operation', async () => {
    prisma.menuItem.delete.mockResolvedValue({
      id: 'menu-item-id',
      key: 'reports',
    });

    await expect(
      service.deleteMenuItem('admin-id', 'menu-item-id'),
    ).resolves.toEqual({ id: 'menu-item-id' });
    expect(prisma.menuItem.delete).toHaveBeenCalledWith({
      where: { id: 'menu-item-id' },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-id',
        action: 'MENU_ITEM_DELETED',
        entity: 'MenuItem',
        entityId: 'menu-item-id',
        metadata: { key: 'reports' },
      },
    });
  });

  it('rejects duplicate role codes', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'existing-role' });

    await expect(
      service.createRole('admin-id', {
        code: 'VAULT_MEMBER',
        name: 'Duplicado',
        permissionCodes: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.role.create).not.toHaveBeenCalled();
  });
});
