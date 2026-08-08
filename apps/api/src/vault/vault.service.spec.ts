import { ForbiddenException } from '@nestjs/common';
import { VaultService } from './vault.service';

describe('VaultService', () => {
  const prisma = {
    vault: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    vaultItemShare: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    vaultItemTeamShare: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    userCryptoKey: {
      findUnique: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new VaultService(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.auditEvent.create.mockResolvedValue({ id: 'audit-id' });
  });

  it('filters shared items using both the member and team expiry', async () => {
    prisma.vaultItemShare.findMany.mockResolvedValue([]);

    await service.listSharedItems('member-id');

    expect(prisma.vaultItemShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientId: 'member-id',
          revokedAt: null,
          AND: [
            expect.objectContaining({
              OR: expect.arrayContaining([
                { teamShareId: null },
                expect.objectContaining({
                  teamShare: expect.objectContaining({
                    is: expect.objectContaining({ revokedAt: null }),
                  }),
                }),
              ]),
            }),
          ],
        }),
      }),
    );
  });

  it('returns null when the user has no sharing key yet', async () => {
    prisma.userCryptoKey.findUnique.mockResolvedValue(null);

    await expect(service.getCryptoKey('user-id')).resolves.toBeNull();
  });

  it('does not let a non-owner configure a recovery envelope', async () => {
    prisma.vault.findUnique.mockResolvedValue({ ownerId: 'owner-id' });

    await expect(
      service.updateVaultRecoveryEnvelope('other-user', 'vault-id', {
        encryptedRecoveryVaultKey: Buffer.alloc(16).toString('base64'),
        recoveryVaultKeyNonce: Buffer.alloc(12).toString('base64'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.vault.update).not.toHaveBeenCalled();
  });

  it('updates only the encrypted recovery envelope for the vault owner', async () => {
    prisma.vault.findUnique.mockResolvedValue({ ownerId: 'owner-id' });
    prisma.vault.update.mockResolvedValue({ id: 'vault-id' });

    await service.updateVaultRecoveryEnvelope('owner-id', 'vault-id', {
      encryptedRecoveryVaultKey: Buffer.alloc(16).toString('base64'),
      recoveryVaultKeyNonce: Buffer.alloc(12).toString('base64'),
    });

    expect(prisma.vault.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vault-id' },
        data: {
          encryptedRecoveryVaultKey: Buffer.alloc(16).toString('base64'),
          recoveryVaultKeyNonce: Buffer.alloc(12).toString('base64'),
        },
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'vault.recovery-key-envelope.created',
        }),
      }),
    );
  });

  it('does not let a non-owner replace the master password envelope', async () => {
    prisma.vault.findUnique.mockResolvedValue({ ownerId: 'owner-id' });

    await expect(
      service.updateVaultKeyEnvelope('other-user', 'vault-id', {
        encryptedVaultKey: Buffer.alloc(32).toString('base64'),
        vaultKeyNonce: Buffer.alloc(12).toString('base64'),
        keyDerivationSalt: Buffer.alloc(16).toString('base64'),
        keyDerivationParams: {
          algorithm: 'Argon2id',
          iterations: 3,
          memorySize: 65536,
          parallelism: 1,
          hashLength: 32,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.vault.update).not.toHaveBeenCalled();
  });

  it('revokes a team share and only its associated member envelopes', async () => {
    prisma.vault.findUnique.mockResolvedValue({ ownerId: 'owner-id' });
    prisma.vaultItemTeamShare.findFirst.mockResolvedValue({
      id: 'team-share-id',
    });
    prisma.vaultItemTeamShare.update.mockResolvedValue({ id: 'team-share-id' });
    prisma.vaultItemShare.updateMany.mockResolvedValue({ count: 2 });

    await service.revokeTeamItemShare(
      'owner-id',
      'vault-id',
      'item-id',
      'team-id',
    );

    expect(prisma.vaultItemShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamShareId: 'team-share-id', revokedAt: null },
      }),
    );
    expect(prisma.vaultItemShare.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'DIRECT' }),
      }),
    );
  });
});
