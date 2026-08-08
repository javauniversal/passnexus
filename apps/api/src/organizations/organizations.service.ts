import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateTeamDto } from './dto/create-team.dto';

const organizationInclude = {
  members: {
    select: {
      role: true,
      joinedAt: true,
      user: { select: { id: true, email: true, displayName: true } },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
  teams: {
    include: {
      members: {
        include: {
          membership: {
            include: {
              user: { select: { id: true, email: true, displayName: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      include: organizationInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateOrganizationDto) {
    const organization = await this.prisma.$transaction(async (transaction) =>
      transaction.organization.create({
        data: {
          name: dto.name.trim(),
          ownerId: userId,
          members: { create: { userId, role: OrganizationRole.OWNER } },
        },
        include: organizationInclude,
      }),
    );
    await this.audit(
      userId,
      'organization.created',
      'Organization',
      organization.id,
    );
    return organization;
  }

  async remove(actorId: string, organizationId: string) {
    await this.requireOwner(actorId, organizationId);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.vaultItemTeamShare.updateMany({
        where: { organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.vaultItemShare.updateMany({
        where: {
          source: 'TEAM',
          teamShare: { organizationId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return transaction.organization.deleteMany({
        where: { id: organizationId, ownerId: actorId },
      });
    });
    if (!result.count)
      throw new NotFoundException('No se encontró la organización solicitada.');
    await this.audit(
      actorId,
      'organization.deleted',
      'Organization',
      organizationId,
    );
  }

  async addMember(
    actorId: string,
    organizationId: string,
    dto: AddOrganizationMemberDto,
  ) {
    await this.requireOwner(actorId, organizationId);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new NotFoundException(
        'No se encontró un usuario activo con ese correo.',
      );
    try {
      const member = await this.prisma.organizationMember.create({
        data: {
          organizationId,
          userId: user.id,
          role: dto.role ?? OrganizationRole.MEMBER,
        },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
      });
      await this.audit(
        actorId,
        'organization-member.added',
        'Organization',
        organizationId,
        { userId: user.id, role: member.role },
      );
      return member;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException(
          'El usuario ya pertenece a esta organización.',
        );
      throw error;
    }
  }

  async createTeam(
    actorId: string,
    organizationId: string,
    dto: CreateTeamDto,
  ) {
    await this.requireOwner(actorId, organizationId);
    try {
      const team = await this.prisma.team.create({
        data: { organizationId, name: dto.name.trim() },
        include: { members: true },
      });
      await this.audit(actorId, 'team.created', 'Team', team.id, {
        organizationId,
      });
      return team;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Ya existe un equipo con ese nombre.');
      throw error;
    }
  }

  async removeMember(actorId: string, organizationId: string, userId: string) {
    await this.requireOwner(actorId, organizationId);
    if (actorId === userId)
      throw new ForbiddenException(
        'No puedes retirarte como propietario de la organización.',
      );
    const result = await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.organizationMember.deleteMany({
        where: {
          organizationId,
          userId,
          role: { not: OrganizationRole.OWNER },
        },
      });
      if (removed.count) {
        await transaction.vaultItemShare.updateMany({
          where: {
            recipientId: userId,
            source: 'TEAM',
            teamShare: { organizationId },
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
      return removed;
    });
    if (!result.count)
      throw new NotFoundException(
        'No se encontró un miembro que pueda retirarse.',
      );
    await this.audit(
      actorId,
      'organization-member.removed',
      'Organization',
      organizationId,
      { userId },
    );
  }

  async removeTeam(actorId: string, organizationId: string, teamId: string) {
    await this.requireOwner(actorId, organizationId);
    const result = await this.prisma.$transaction(async (transaction) => {
      const team = await transaction.team.findFirst({
        where: { id: teamId, organizationId },
        select: { id: true },
      });
      if (!team) return { count: 0 };
      await transaction.vaultItemTeamShare.updateMany({
        where: { teamId, organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.vaultItemShare.updateMany({
        where: {
          source: 'TEAM',
          teamShare: { teamId, organizationId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return transaction.team.deleteMany({
        where: { id: teamId, organizationId },
      });
    });
    if (!result.count)
      throw new NotFoundException('No se encontró el equipo solicitado.');
    await this.audit(actorId, 'team.removed', 'Team', teamId, {
      organizationId,
    });
  }

  async addTeamMember(
    actorId: string,
    organizationId: string,
    teamId: string,
    dto: AddTeamMemberDto,
  ) {
    await this.requireOwner(actorId, organizationId);
    const [team, user] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, organizationId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
        select: { id: true },
      }),
    ]);
    if (!team)
      throw new NotFoundException('No se encontró el equipo solicitado.');
    if (
      !user ||
      !(await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      }))
    )
      throw new NotFoundException(
        'El usuario debe pertenecer a la organización antes de integrarlo al equipo.',
      );
    try {
      const membership = await this.prisma.teamMember.create({
        data: { teamId, organizationId, userId: user.id },
      });
      await this.audit(actorId, 'team-member.added', 'Team', teamId, {
        userId: user.id,
        organizationId,
      });
      return membership;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('El usuario ya pertenece a este equipo.');
      throw error;
    }
  }

  async removeTeamMember(
    actorId: string,
    organizationId: string,
    teamId: string,
    userId: string,
  ) {
    await this.requireOwner(actorId, organizationId);
    const result = await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.teamMember.deleteMany({
        where: { teamId, organizationId, userId },
      });
      if (removed.count) {
        await transaction.vaultItemShare.updateMany({
          where: {
            recipientId: userId,
            source: 'TEAM',
            teamShare: { teamId, organizationId },
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
      return removed;
    });
    if (!result.count)
      throw new NotFoundException(
        'No se encontró un miembro en el equipo solicitado.',
      );
    await this.audit(actorId, 'team-member.removed', 'Team', teamId, {
      userId,
      organizationId,
    });
  }

  private async requireOwner(userId: string, organizationId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    if (!member)
      throw new NotFoundException('No se encontró la organización solicitada.');
    if (member.role !== OrganizationRole.OWNER)
      throw new ForbiddenException(
        'Solo el propietario puede gestionar miembros y equipos.',
      );
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
