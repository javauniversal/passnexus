import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './jwt.strategy';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AccessTokenPayload }>();
    const permissionCount = await this.prisma.permission.count({
      where: {
        code: { in: permissions },
        roles: {
          some: { role: { users: { some: { userId: request.user.sub } } } },
        },
      },
    });
    if (permissionCount !== permissions.length) {
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
    }
    return true;
  }
}
