import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenPayload } from '../auth/jwt.strategy';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AdminService } from './admin.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('administration')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @RequirePermissions('users.read')
  @ApiOkResponse({ description: 'Usuarios sin hashes de contraseña.' })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('users/role-options')
  @RequirePermissions('users.read')
  listUserRoleOptions() {
    return this.adminService.listUserRoleOptions();
  }

  @Post('users')
  @RequirePermissions('users.create')
  createUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.adminService.createUser(request.user.sub, createUserDto);
  }

  @Post('users/:userId/setup-link')
  @RequirePermissions('users.update')
  generateUserSetupLink(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId') userId: string,
  ) {
    return this.adminService.generateUserSetupLink(request.user.sub, userId);
  }

  @Post('users/:userId/temporary-password')
  @RequirePermissions('users.update')
  generateTemporaryPassword(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId') userId: string,
  ) {
    return this.adminService.generateTemporaryPassword(
      request.user.sub,
      userId,
    );
  }

  @Patch('users/:userId')
  @RequirePermissions('users.update')
  updateUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(
      request.user.sub,
      userId,
      updateUserDto,
    );
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  listRoles() {
    return this.adminService.listRoles();
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  createRole(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.adminService.createRole(request.user.sub, createRoleDto);
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  listPermissions() {
    return this.adminService.listPermissions();
  }

  @Patch('roles/:roleId/permissions')
  @RequirePermissions('roles.update')
  updateRolePermissions(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('roleId') roleId: string,
    @Body() updateRolePermissionsDto: UpdateRolePermissionsDto,
  ) {
    return this.adminService.updateRolePermissions(
      request.user.sub,
      roleId,
      updateRolePermissionsDto,
    );
  }

  @Get('navigation')
  @RequirePermissions('navigation.read')
  listMenuItems() {
    return this.adminService.listMenuItems();
  }

  @Post('navigation')
  @RequirePermissions('navigation.update')
  createMenuItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() createMenuItemDto: CreateMenuItemDto,
  ) {
    return this.adminService.createMenuItem(
      request.user.sub,
      createMenuItemDto,
    );
  }

  @Get('navigation/permissions')
  @RequirePermissions('navigation.read')
  listNavigationPermissions() {
    return this.adminService.listPermissions();
  }

  @Patch('navigation/:menuItemId')
  @RequirePermissions('navigation.update')
  updateMenuItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('menuItemId') menuItemId: string,
    @Body() updateMenuItemDto: UpdateMenuItemDto,
  ) {
    return this.adminService.updateMenuItem(
      request.user.sub,
      menuItemId,
      updateMenuItemDto,
    );
  }

  @Delete('navigation/:menuItemId')
  @RequirePermissions('navigation.update')
  deleteMenuItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('menuItemId') menuItemId: string,
  ) {
    return this.adminService.deleteMenuItem(request.user.sub, menuItemId);
  }

  @Get('audit')
  @RequirePermissions('audit.read')
  listAuditEvents() {
    return this.adminService.listAuditEvents();
  }
}
