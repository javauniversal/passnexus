import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenPayload } from '../auth/jwt.strategy';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @RequirePermissions('organizations.read')
  @ApiOkResponse({
    description: 'Organizaciones a las que pertenece el usuario.',
  })
  list(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.organizationsService.list(request.user.sub);
  }

  @Post()
  @RequirePermissions('organizations.create')
  @ApiCreatedResponse({
    description:
      'Organización creada; el solicitante se registra como propietario.',
  })
  create(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(request.user.sub, dto);
  }

  @Delete(':organizationId')
  @RequirePermissions('organizations.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizationsService.remove(request.user.sub, organizationId);
  }

  @Post(':organizationId/members')
  @RequirePermissions('organizations.update')
  addMember(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Body() dto: AddOrganizationMemberDto,
  ) {
    return this.organizationsService.addMember(
      request.user.sub,
      organizationId,
      dto,
    );
  }

  @Delete(':organizationId/members/:userId')
  @RequirePermissions('organizations.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeMember(
      request.user.sub,
      organizationId,
      userId,
    );
  }

  @Post(':organizationId/teams')
  @RequirePermissions('organizations.update')
  createTeam(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.organizationsService.createTeam(
      request.user.sub,
      organizationId,
      dto,
    );
  }

  @Delete(':organizationId/teams/:teamId')
  @RequirePermissions('organizations.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeam(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.organizationsService.removeTeam(
      request.user.sub,
      organizationId,
      teamId,
    );
  }

  @Post(':organizationId/teams/:teamId/members')
  @RequirePermissions('organizations.update')
  addTeamMember(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.organizationsService.addTeamMember(
      request.user.sub,
      organizationId,
      teamId,
      dto,
    );
  }

  @Delete(':organizationId/teams/:teamId/members/:userId')
  @RequirePermissions('organizations.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamMember(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeTeamMember(
      request.user.sub,
      organizationId,
      teamId,
      userId,
    );
  }
}
