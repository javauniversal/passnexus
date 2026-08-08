import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationRole,
  Prisma,
  VaultItemEncryptionScheme,
  VaultItemShareSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVaultItemDto } from './dto/create-vault-item.dto';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultItemDto } from './dto/update-vault-item.dto';
import { UpsertUserCryptoKeyDto } from './dto/upsert-user-crypto-key.dto';
import { CreateVaultItemShareDto } from './dto/create-vault-item-share.dto';
import { CreateVaultItemTeamShareDto } from './dto/create-vault-item-team-share.dto';
import { ImportVaultItemsDto } from './dto/import-vault-items.dto';
import { UpdateSharedVaultItemDto } from './dto/update-shared-vault-item.dto';
import { UpdateVaultKeyEnvelopeDto } from './dto/update-vault-key-envelope.dto';
import { UpdateVaultRecoveryEnvelopeDto } from './dto/update-vault-recovery-envelope.dto';

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async listVaults(userId: string) {
    return this.prisma.vault.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        keyDerivationSalt: true,
        keyDerivationParams: true,
        encryptedVaultKey: true,
        vaultKeyNonce: true,
        encryptedRecoveryVaultKey: true,
        recoveryVaultKeyNonce: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCryptoKey(userId: string) {
    const cryptoKey = await this.prisma.userCryptoKey.findUnique({
      where: { userId },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        privateKeyNonce: true,
      },
    });
    return cryptoKey;
  }

  async upsertCryptoKey(userId: string, dto: UpsertUserCryptoKeyDto) {
    const cryptoKey = await this.prisma.userCryptoKey.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
        publicKey: dto.publicKey as Prisma.InputJsonValue,
      },
      update: { ...dto, publicKey: dto.publicKey as Prisma.InputJsonValue },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        privateKeyNonce: true,
      },
    });
    await this.audit(
      userId,
      'user-crypto-key.updated',
      'UserCryptoKey',
      userId,
    );
    return cryptoKey;
  }

  async getPublicCryptoKey(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        displayName: true,
        cryptoKey: { select: { publicKey: true } },
      },
    });
    if (!user?.cryptoKey)
      throw new NotFoundException(
        'El destinatario no tiene configurada una clave de compartición.',
      );
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      publicKey: user.cryptoKey.publicKey,
    };
  }

  async listSharedItems(userId: string) {
    const now = new Date();
    return this.prisma.vaultItemShare.findMany({
      where: {
        recipientId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { teamShareId: null },
              {
                teamShare: {
                  is: {
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        vaultItemId: true,
        encryptedItemKey: true,
        itemKeyNonce: true,
        senderPublicKey: true,
        permission: true,
        expiresAt: true,
        createdAt: true,
        vaultItem: {
          select: {
            type: true,
            encryptedData: true,
            nonce: true,
            version: true,
            encryptionScheme: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVault(userId: string, createVaultDto: CreateVaultDto) {
    const vault = await this.prisma.vault.create({
      data: {
        ownerId: userId,
        ...createVaultDto,
        name: createVaultDto.name.trim(),
        keyDerivationParams:
          createVaultDto.keyDerivationParams as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        keyDerivationSalt: true,
        keyDerivationParams: true,
        encryptedVaultKey: true,
        vaultKeyNonce: true,
        encryptedRecoveryVaultKey: true,
        recoveryVaultKeyNonce: true,
      },
    });
    await this.audit(userId, 'vault.created', 'Vault', vault.id);
    return vault;
  }

  async updateVaultKeyEnvelope(
    userId: string,
    vaultId: string,
    dto: UpdateVaultKeyEnvelopeDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const vault = await this.prisma.vault.update({
      where: { id: vaultId },
      data: {
        encryptedVaultKey: dto.encryptedVaultKey,
        vaultKeyNonce: dto.vaultKeyNonce,
        keyDerivationSalt: dto.keyDerivationSalt,
        keyDerivationParams: dto.keyDerivationParams as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        keyDerivationSalt: true,
        keyDerivationParams: true,
        encryptedVaultKey: true,
        vaultKeyNonce: true,
        encryptedRecoveryVaultKey: true,
        recoveryVaultKeyNonce: true,
      },
    });
    await this.audit(
      userId,
      'vault.master-key-envelope.updated',
      'Vault',
      vaultId,
    );
    return vault;
  }

  async updateVaultRecoveryEnvelope(
    userId: string,
    vaultId: string,
    dto: UpdateVaultRecoveryEnvelopeDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const vault = await this.prisma.vault.update({
      where: { id: vaultId },
      data: dto,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        keyDerivationSalt: true,
        keyDerivationParams: true,
        encryptedVaultKey: true,
        vaultKeyNonce: true,
        encryptedRecoveryVaultKey: true,
        recoveryVaultKeyNonce: true,
      },
    });
    await this.audit(
      userId,
      'vault.recovery-key-envelope.created',
      'Vault',
      vaultId,
    );
    return vault;
  }

  async listItems(
    userId: string,
    vaultId: string,
    status: 'active' | 'deleted' = 'active',
  ) {
    await this.requireOwnership(userId, vaultId);
    return this.prisma.vaultItem.findMany({
      where: {
        vaultId,
        deletedAt: status === 'deleted' ? { not: null } : null,
      },
      select: {
        id: true,
        type: true,
        encryptedData: true,
        nonce: true,
        version: true,
        encryptionScheme: true,
        encryptedDocumentKey: true,
        documentKeyNonce: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createItem(
    userId: string,
    vaultId: string,
    createVaultItemDto: CreateVaultItemDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const vaultItem = await this.prisma.vaultItem.create({
      data: { vaultId, ...createVaultItemDto },
      select: {
        id: true,
        type: true,
        encryptedData: true,
        nonce: true,
        version: true,
        encryptionScheme: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await this.audit(userId, 'vault-item.created', 'VaultItem', vaultItem.id);
    return vaultItem;
  }

  async importItems(userId: string, vaultId: string, dto: ImportVaultItemsDto) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.vaultItem.createMany({
      data: dto.items.map((item) => ({ vaultId, ...item })),
    });
    await this.audit(userId, 'vault-item.imported', 'Vault', vaultId, {
      count: String(result.count),
    });
    return { count: result.count };
  }

  async updateItem(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    updateVaultItemDto: UpdateVaultItemDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const existingItem = await this.prisma.vaultItem.findFirst({
      where: { id: vaultItemId, vaultId, deletedAt: null },
    });
    if (!existingItem) {
      throw new NotFoundException('No se encontró el elemento del vault.');
    }
    const vaultItem = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.vaultItem.updateMany({
        where: { id: vaultItemId, version: updateVaultItemDto.expectedVersion },
        data: {
          type: updateVaultItemDto.type,
          encryptedData: updateVaultItemDto.encryptedData,
          nonce: updateVaultItemDto.nonce,
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new ConflictException(
          'El elemento cambió mientras lo editabas. Recarga e inténtalo de nuevo.',
        );
      await transaction.vaultItemRevision.create({
        data: {
          vaultItemId,
          version: existingItem.version,
          encryptedData: existingItem.encryptedData,
          nonce: existingItem.nonce,
          encryptionScheme: existingItem.encryptionScheme,
        },
      });
      return transaction.vaultItem.findUniqueOrThrow({
        where: { id: vaultItemId },
        select: {
          id: true,
          type: true,
          encryptedData: true,
          nonce: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    await this.audit(userId, 'vault-item.updated', 'VaultItem', vaultItem.id);
    return vaultItem;
  }

  async createItemShare(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    dto: CreateVaultItemShareDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const item = await this.prisma.vaultItem.findFirst({
      where: { id: vaultItemId, vaultId, deletedAt: null },
    });
    if (!item)
      throw new NotFoundException('No se encontró el elemento del vault.');
    const recipient = await this.prisma.user.findFirst({
      where: {
        email: dto.recipientEmail.toLowerCase(),
        status: 'ACTIVE',
        cryptoKey: { isNot: null },
      },
      select: { id: true },
    });
    if (!recipient)
      throw new NotFoundException(
        'El destinatario no existe, está inactivo o no configuró su clave de compartición.',
      );
    if (recipient.id === userId)
      throw new ForbiddenException(
        'No puedes compartir un elemento contigo mismo.',
      );
    const share = await this.prisma.$transaction(async (transaction) => {
      if (item.encryptionScheme === VaultItemEncryptionScheme.VAULT_KEY) {
        if (
          !dto.encryptedData ||
          !dto.nonce ||
          !dto.encryptedDocumentKey ||
          !dto.documentKeyNonce ||
          !dto.expectedVersion
        ) {
          throw new ForbiddenException(
            'La primera compartición debe promover el elemento a una clave de documento.',
          );
        }
        const promoted = await transaction.vaultItem.updateMany({
          where: {
            id: item.id,
            version: dto.expectedVersion,
            encryptionScheme: VaultItemEncryptionScheme.VAULT_KEY,
          },
          data: {
            encryptedData: dto.encryptedData,
            nonce: dto.nonce,
            encryptedDocumentKey: dto.encryptedDocumentKey,
            documentKeyNonce: dto.documentKeyNonce,
            encryptionScheme: VaultItemEncryptionScheme.DOCUMENT_KEY,
            version: { increment: 1 },
          },
        });
        if (!promoted.count)
          throw new ConflictException(
            'El elemento cambió mientras se compartía. Recarga e inténtalo de nuevo.',
          );
        await transaction.vaultItemRevision.create({
          data: {
            vaultItemId,
            version: item.version,
            encryptedData: item.encryptedData,
            nonce: item.nonce,
            encryptionScheme: VaultItemEncryptionScheme.VAULT_KEY,
          },
        });
      }
      return transaction.vaultItemShare.upsert({
        where: {
          vaultItemId_recipientId_source_sourceKey: {
            vaultItemId,
            recipientId: recipient.id,
            source: VaultItemShareSource.DIRECT,
            sourceKey: 'direct',
          },
        },
        create: {
          vaultItemId,
          recipientId: recipient.id,
          source: VaultItemShareSource.DIRECT,
          sourceKey: 'direct',
          encryptedItemKey: dto.encryptedItemKey,
          itemKeyNonce: dto.itemKeyNonce,
          senderPublicKey: dto.senderPublicKey as Prisma.InputJsonValue,
          permission: dto.permission ?? 'read',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        update: {
          encryptedItemKey: dto.encryptedItemKey,
          itemKeyNonce: dto.itemKeyNonce,
          senderPublicKey: dto.senderPublicKey as Prisma.InputJsonValue,
          permission: dto.permission ?? 'read',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          revokedAt: null,
        },
      });
    });
    await this.audit(userId, 'vault-item.shared', 'VaultItem', item.id);
    return {
      id: share.id,
      recipientId: share.recipientId,
      permission: share.permission,
      expiresAt: share.expiresAt,
    };
  }

  async listTeamShareRecipients(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    teamId: string,
  ) {
    await this.requireOwnership(userId, vaultId);
    const [item, team] = await Promise.all([
      this.prisma.vaultItem.findFirst({
        where: { id: vaultItemId, vaultId, deletedAt: null },
        select: { id: true },
      }),
      this.findOwnedTeam(userId, teamId),
    ]);
    if (!item)
      throw new NotFoundException('No se encontró el elemento del vault.');
    if (!team)
      throw new NotFoundException(
        'No se encontró un equipo que puedas compartir.',
      );
    return this.prisma.teamMember
      .findMany({
        where: {
          teamId,
          userId: { not: userId },
          user: { status: 'ACTIVE', cryptoKey: { isNot: null } },
        },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              cryptoKey: { select: { publicKey: true } },
            },
          },
        },
        orderBy: { user: { email: 'asc' } },
      })
      .then((members) =>
        members.map(({ user }) => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          publicKey: user.cryptoKey!.publicKey,
        })),
      );
  }

  async createTeamItemShare(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    dto: CreateVaultItemTeamShareDto,
  ) {
    await this.requireOwnership(userId, vaultId);
    const team = await this.findOwnedTeam(userId, dto.teamId);
    if (!team)
      throw new NotFoundException(
        'No se encontró un equipo que puedas compartir.',
      );
    const uniqueRecipientIds = new Set(
      dto.recipients.map(({ recipientId }) => recipientId),
    );
    if (uniqueRecipientIds.size !== dto.recipients.length)
      throw new ConflictException(
        'Cada destinatario solo puede tener un envelope por equipo.',
      );

    const result = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.vaultItem.findFirst({
        where: { id: vaultItemId, vaultId, deletedAt: null },
      });
      if (!item)
        throw new NotFoundException('No se encontró el elemento del vault.');
      const eligibleMembers = await transaction.teamMember.findMany({
        where: {
          teamId: dto.teamId,
          userId: { not: userId },
          user: { status: 'ACTIVE', cryptoKey: { isNot: null } },
        },
        select: { userId: true },
      });
      const eligibleRecipientIds = new Set(
        eligibleMembers.map(({ userId: id }) => id),
      );
      if (
        eligibleRecipientIds.size !== uniqueRecipientIds.size ||
        [...uniqueRecipientIds].some(
          (recipientId) => !eligibleRecipientIds.has(recipientId),
        )
      ) {
        throw new ConflictException(
          'Los destinatarios ya no coinciden con los miembros activos del equipo con clave de compartición.',
        );
      }
      if (item.encryptionScheme === VaultItemEncryptionScheme.VAULT_KEY) {
        if (
          !dto.encryptedData ||
          !dto.nonce ||
          !dto.encryptedDocumentKey ||
          !dto.documentKeyNonce ||
          !dto.expectedVersion
        ) {
          throw new ForbiddenException(
            'La primera compartición debe promover el elemento a una clave de documento.',
          );
        }
        const promoted = await transaction.vaultItem.updateMany({
          where: {
            id: item.id,
            version: dto.expectedVersion,
            encryptionScheme: VaultItemEncryptionScheme.VAULT_KEY,
          },
          data: {
            encryptedData: dto.encryptedData,
            nonce: dto.nonce,
            encryptedDocumentKey: dto.encryptedDocumentKey,
            documentKeyNonce: dto.documentKeyNonce,
            encryptionScheme: VaultItemEncryptionScheme.DOCUMENT_KEY,
            version: { increment: 1 },
          },
        });
        if (!promoted.count)
          throw new ConflictException(
            'El elemento cambió mientras se compartía. Recarga e inténtalo de nuevo.',
          );
        await transaction.vaultItemRevision.create({
          data: {
            vaultItemId,
            version: item.version,
            encryptedData: item.encryptedData,
            nonce: item.nonce,
            encryptionScheme: VaultItemEncryptionScheme.VAULT_KEY,
          },
        });
      }
      const teamShare = await transaction.vaultItemTeamShare.upsert({
        where: { vaultItemId_teamId: { vaultItemId, teamId: dto.teamId } },
        create: {
          vaultItemId,
          teamId: dto.teamId,
          organizationId: team.organizationId,
          sharedById: userId,
          permission: dto.permission ?? 'read',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        update: {
          permission: dto.permission ?? 'read',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          revokedAt: null,
        },
      });
      await transaction.vaultItemShare.updateMany({
        where: {
          teamShareId: teamShare.id,
          recipientId: { notIn: [...uniqueRecipientIds] },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await Promise.all(
        dto.recipients.map((recipient) =>
          transaction.vaultItemShare.upsert({
            where: {
              vaultItemId_recipientId_source_sourceKey: {
                vaultItemId,
                recipientId: recipient.recipientId,
                source: VaultItemShareSource.TEAM,
                sourceKey: teamShare.id,
              },
            },
            create: {
              vaultItemId,
              recipientId: recipient.recipientId,
              source: VaultItemShareSource.TEAM,
              sourceKey: teamShare.id,
              teamShareId: teamShare.id,
              encryptedItemKey: recipient.encryptedItemKey,
              itemKeyNonce: recipient.itemKeyNonce,
              senderPublicKey:
                recipient.senderPublicKey as Prisma.InputJsonValue,
              permission: dto.permission ?? 'read',
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            },
            update: {
              encryptedItemKey: recipient.encryptedItemKey,
              itemKeyNonce: recipient.itemKeyNonce,
              senderPublicKey:
                recipient.senderPublicKey as Prisma.InputJsonValue,
              permission: dto.permission ?? 'read',
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
              revokedAt: null,
            },
          }),
        ),
      );
      return teamShare;
    });
    await this.audit(
      userId,
      'vault-item.team-shared',
      'VaultItem',
      vaultItemId,
      {
        teamId: dto.teamId,
        recipients: String(dto.recipients.length),
      },
    );
    return {
      id: result.id,
      teamId: result.teamId,
      permission: result.permission,
    };
  }

  async updateSharedItem(
    userId: string,
    vaultItemId: string,
    dto: UpdateSharedVaultItemDto,
  ) {
    const now = new Date();
    const share = await this.prisma.vaultItemShare.findFirst({
      where: {
        vaultItemId,
        recipientId: userId,
        permission: 'write',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { teamShareId: null },
              {
                teamShare: {
                  is: {
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            ],
          },
        ],
      },
      include: { vaultItem: true },
    });
    if (
      !share ||
      share.vaultItem.deletedAt ||
      share.vaultItem.encryptionScheme !==
        VaultItemEncryptionScheme.DOCUMENT_KEY
    ) {
      throw new ForbiddenException(
        'No tienes permiso de escritura para este elemento compartido.',
      );
    }
    const item = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.vaultItem.updateMany({
        where: {
          id: vaultItemId,
          version: dto.expectedVersion,
          encryptionScheme: VaultItemEncryptionScheme.DOCUMENT_KEY,
        },
        data: {
          type: dto.type,
          encryptedData: dto.encryptedData,
          nonce: dto.nonce,
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new ConflictException(
          'El elemento cambió mientras lo editabas. Recarga e inténtalo de nuevo.',
        );
      await transaction.vaultItemRevision.create({
        data: {
          vaultItemId,
          version: share.vaultItem.version,
          encryptedData: share.vaultItem.encryptedData,
          nonce: share.vaultItem.nonce,
          encryptionScheme: VaultItemEncryptionScheme.DOCUMENT_KEY,
        },
      });
      return transaction.vaultItem.findUniqueOrThrow({
        where: { id: vaultItemId },
        select: {
          id: true,
          type: true,
          encryptedData: true,
          nonce: true,
          version: true,
          updatedAt: true,
        },
      });
    });
    await this.audit(
      userId,
      'vault-item.shared-updated',
      'VaultItem',
      vaultItemId,
      { shareId: share.id },
    );
    return item;
  }

  async revokeItemShare(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    recipientId: string,
  ) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.vaultItemShare.updateMany({
      where: {
        vaultItemId,
        recipientId,
        source: VaultItemShareSource.DIRECT,
        vaultItem: { vaultId },
      },
      data: { revokedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException(
        'No se encontró una compartición activa para este destinatario.',
      );
    await this.audit(
      userId,
      'vault-item.share-revoked',
      'VaultItem',
      vaultItemId,
    );
  }

  async listItemShares(userId: string, vaultId: string, vaultItemId: string) {
    await this.requireOwnership(userId, vaultId);
    const item = await this.prisma.vaultItem.findFirst({
      where: { id: vaultItemId, vaultId, deletedAt: null },
      select: { id: true },
    });
    if (!item)
      throw new NotFoundException('No se encontró el elemento del vault.');

    const [directShares, teamShares] = await Promise.all([
      this.prisma.vaultItemShare.findMany({
        where: { vaultItemId, source: VaultItemShareSource.DIRECT },
        select: {
          id: true,
          permission: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          recipient: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vaultItemTeamShare.findMany({
        where: { vaultItemId },
        select: {
          id: true,
          permission: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          team: { select: { id: true, name: true } },
          _count: { select: { shares: { where: { revokedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { directShares, teamShares };
  }

  async revokeTeamItemShare(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    teamId: string,
  ) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.$transaction(async (transaction) => {
      const teamShare = await transaction.vaultItemTeamShare.findFirst({
        where: { vaultItemId, teamId, vaultItem: { vaultId }, revokedAt: null },
        select: { id: true },
      });
      if (!teamShare) return null;
      await transaction.vaultItemTeamShare.update({
        where: { id: teamShare.id },
        data: { revokedAt: new Date() },
      });
      await transaction.vaultItemShare.updateMany({
        where: { teamShareId: teamShare.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return teamShare;
    });
    if (!result)
      throw new NotFoundException(
        'No se encontró una compartición activa para este equipo.',
      );
    await this.audit(
      userId,
      'vault-item.team-share-revoked',
      'VaultItem',
      vaultItemId,
      { teamId },
    );
  }

  async deleteItem(userId: string, vaultId: string, vaultItemId: string) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.vaultItem.updateMany({
      where: { id: vaultItemId, vaultId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) {
      throw new NotFoundException('No se encontró el elemento del vault.');
    }
    await this.audit(userId, 'vault-item.deleted', 'VaultItem', vaultItemId);
  }

  async restoreItem(userId: string, vaultId: string, vaultItemId: string) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.vaultItem.updateMany({
      where: { id: vaultItemId, vaultId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (!result.count) {
      throw new NotFoundException('No se encontró el elemento eliminado.');
    }
    await this.audit(userId, 'vault-item.restored', 'VaultItem', vaultItemId);
  }

  async permanentlyDeleteItem(
    userId: string,
    vaultId: string,
    vaultItemId: string,
  ) {
    await this.requireOwnership(userId, vaultId);
    const result = await this.prisma.vaultItem.deleteMany({
      where: { id: vaultItemId, vaultId, deletedAt: { not: null } },
    });
    if (!result.count) {
      throw new NotFoundException('No se encontró el elemento eliminado.');
    }
    await this.audit(
      userId,
      'vault-item.permanently-deleted',
      'VaultItem',
      vaultItemId,
    );
  }

  async listItemHistory(userId: string, vaultId: string, vaultItemId: string) {
    await this.requireOwnership(userId, vaultId);
    const item = await this.prisma.vaultItem.findFirst({
      where: { id: vaultItemId, vaultId },
    });
    if (!item) {
      throw new NotFoundException('No se encontró el elemento del vault.');
    }
    return this.prisma.vaultItemRevision.findMany({
      where: { vaultItemId },
      select: {
        id: true,
        version: true,
        encryptedData: true,
        nonce: true,
        encryptionScheme: true,
        createdAt: true,
      },
      orderBy: { version: 'desc' },
    });
  }

  async restoreItemRevision(
    userId: string,
    vaultId: string,
    vaultItemId: string,
    revisionId: string,
  ) {
    await this.requireOwnership(userId, vaultId);
    const item = await this.prisma.vaultItem.findFirst({
      where: { id: vaultItemId, vaultId, deletedAt: null },
    });
    const revision = await this.prisma.vaultItemRevision.findFirst({
      where: { id: revisionId, vaultItemId },
    });
    if (!item || !revision)
      throw new NotFoundException('No se encontró la revisión solicitada.');
    if (item.encryptionScheme !== revision.encryptionScheme)
      throw new ForbiddenException(
        'No se puede restaurar una revisión cifrada con un esquema de clave distinto.',
      );
    const restored = await this.prisma.$transaction(async (transaction) => {
      await transaction.vaultItemRevision.create({
        data: {
          vaultItemId,
          version: item.version,
          encryptedData: item.encryptedData,
          nonce: item.nonce,
          encryptionScheme: item.encryptionScheme,
        },
      });
      return transaction.vaultItem.update({
        where: { id: vaultItemId },
        data: {
          encryptedData: revision.encryptedData,
          nonce: revision.nonce,
          version: { increment: 1 },
        },
        select: {
          id: true,
          type: true,
          encryptedData: true,
          nonce: true,
          version: true,
        },
      });
    });
    await this.audit(
      userId,
      'vault-item.revision-restored',
      'VaultItem',
      vaultItemId,
      { revisionId },
    );
    return restored;
  }

  private async requireOwnership(userId: string, vaultId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { id: vaultId },
      select: { ownerId: true },
    });
    if (!vault) {
      throw new NotFoundException('No se encontró el vault solicitado.');
    }
    if (vault.ownerId !== userId) {
      throw new ForbiddenException('No tienes acceso a este vault.');
    }
  }

  private findOwnedTeam(userId: string, teamId: string) {
    return this.prisma.team.findFirst({
      where: {
        id: teamId,
        organization: {
          members: {
            some: { userId, role: OrganizationRole.OWNER },
          },
        },
      },
      select: { id: true, organizationId: true },
    });
  }

  private audit(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, string>,
  ) {
    return this.prisma.auditEvent.create({
      data: { userId, action, entity, entityId, metadata },
    });
  }
}
