import { ForbiddenException } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const transaction = {
    vaultItemTeamShare: { updateMany: jest.fn() },
    vaultItemShare: { updateMany: jest.fn() },
    organization: { deleteMany: jest.fn() },
  };
  const prisma = {
    organizationMember: { findUnique: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(
      (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const service = new OrganizationsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.OWNER,
    });
    transaction.vaultItemTeamShare.updateMany.mockResolvedValue({ count: 2 });
    transaction.vaultItemShare.updateMany.mockResolvedValue({ count: 4 });
    transaction.organization.deleteMany.mockResolvedValue({ count: 1 });
    prisma.auditEvent.create.mockResolvedValue({ id: 'audit-id' });
  });

  it('revokes team access before deleting an owned organization', async () => {
    await service.remove('owner-id', 'organization-id');

    expect(transaction.vaultItemTeamShare.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.vaultItemShare.updateMany).toHaveBeenCalledWith({
      where: {
        source: 'TEAM',
        teamShare: { organizationId: 'organization-id' },
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.organization.deleteMany).toHaveBeenCalledWith({
      where: { id: 'organization-id', ownerId: 'owner-id' },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'owner-id',
        action: 'organization.deleted',
        entity: 'Organization',
        entityId: 'organization-id',
        metadata: undefined,
      },
    });
  });

  it('rejects deletion by a non-owner', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      role: OrganizationRole.ADMIN,
    });

    await expect(
      service.remove('admin-id', 'organization-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
