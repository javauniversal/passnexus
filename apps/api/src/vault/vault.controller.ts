import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenPayload } from '../auth/jwt.strategy';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateVaultItemDto } from './dto/create-vault-item.dto';
import { CreateVaultDto } from './dto/create-vault.dto';
import { ListVaultItemsQueryDto } from './dto/list-vault-items-query.dto';
import { UpdateVaultItemDto } from './dto/update-vault-item.dto';
import { UpsertUserCryptoKeyDto } from './dto/upsert-user-crypto-key.dto';
import { CreateVaultItemShareDto } from './dto/create-vault-item-share.dto';
import { CreateVaultItemTeamShareDto } from './dto/create-vault-item-team-share.dto';
import { UpdateVaultKeyEnvelopeDto } from './dto/update-vault-key-envelope.dto';
import { UpdateVaultRecoveryEnvelopeDto } from './dto/update-vault-recovery-envelope.dto';
import { ImportVaultItemsDto } from './dto/import-vault-items.dto';
import { UpdateSharedVaultItemDto } from './dto/update-shared-vault-item.dto';
import { VaultService } from './vault.service';

@ApiTags('vaults')
@ApiBearerAuth()
@Controller('vaults')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Get()
  @RequirePermissions('vault.read')
  @ApiOkResponse({ description: 'Vaults propiedad del usuario autenticado.' })
  listVaults(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.vaultService.listVaults(request.user.sub);
  }

  @Post()
  @RequirePermissions('vault.create')
  @ApiCreatedResponse({
    description:
      'Vault creado con un envelope de clave cifrado por el cliente.',
  })
  createVault(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() createVaultDto: CreateVaultDto,
  ) {
    return this.vaultService.createVault(request.user.sub, createVaultDto);
  }

  @Patch(':vaultId/key-envelope')
  @RequirePermissions('vault.update')
  updateVaultKeyEnvelope(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Body() dto: UpdateVaultKeyEnvelopeDto,
  ) {
    return this.vaultService.updateVaultKeyEnvelope(
      request.user.sub,
      vaultId,
      dto,
    );
  }

  @Patch(':vaultId/recovery-envelope')
  @RequirePermissions('vault.update')
  updateVaultRecoveryEnvelope(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Body() dto: UpdateVaultRecoveryEnvelopeDto,
  ) {
    return this.vaultService.updateVaultRecoveryEnvelope(
      request.user.sub,
      vaultId,
      dto,
    );
  }

  @Get('crypto-key')
  @RequirePermissions('vault.read')
  async getCryptoKey(
    @Req() request: Request & { user: AccessTokenPayload },
    @Res({ passthrough: true }) response: Response,
  ) {
    const cryptoKey = await this.vaultService.getCryptoKey(request.user.sub);
    if (!cryptoKey) response.status(HttpStatus.NO_CONTENT);
    return cryptoKey;
  }

  @Post('crypto-key')
  @RequirePermissions('vault.update')
  upsertCryptoKey(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: UpsertUserCryptoKeyDto,
  ) {
    return this.vaultService.upsertCryptoKey(request.user.sub, dto);
  }

  @Get('crypto-key/:email')
  @RequirePermissions('vault.read')
  getPublicCryptoKey(@Param('email') email: string) {
    return this.vaultService.getPublicCryptoKey(email);
  }

  @Get('shared-items')
  @RequirePermissions('vault.read')
  listSharedItems(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.vaultService.listSharedItems(request.user.sub);
  }

  @Get(':vaultId/items')
  @RequirePermissions('vault.read')
  @ApiOkResponse({ description: 'Elementos cifrados del vault.' })
  listItems(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Query() query: ListVaultItemsQueryDto,
  ) {
    return this.vaultService.listItems(request.user.sub, vaultId, query.status);
  }

  @Post(':vaultId/items')
  @RequirePermissions('vault.create')
  @ApiCreatedResponse({
    description: 'Elemento cifrado persistido sin descifrado del servidor.',
  })
  createItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Body() createVaultItemDto: CreateVaultItemDto,
  ) {
    return this.vaultService.createItem(
      request.user.sub,
      vaultId,
      createVaultItemDto,
    );
  }

  @Post(':vaultId/items/import')
  @RequirePermissions('vault.create')
  importItems(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Body() dto: ImportVaultItemsDto,
  ) {
    return this.vaultService.importItems(request.user.sub, vaultId, dto);
  }

  @Patch(':vaultId/items/:vaultItemId')
  @RequirePermissions('vault.update')
  updateItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Body() updateVaultItemDto: UpdateVaultItemDto,
  ) {
    return this.vaultService.updateItem(
      request.user.sub,
      vaultId,
      vaultItemId,
      updateVaultItemDto,
    );
  }

  @Post(':vaultId/items/:vaultItemId/shares')
  @RequirePermissions('vault.update')
  createItemShare(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Body() dto: CreateVaultItemShareDto,
  ) {
    return this.vaultService.createItemShare(
      request.user.sub,
      vaultId,
      vaultItemId,
      dto,
    );
  }

  @Get(':vaultId/items/:vaultItemId/shares')
  @RequirePermissions('vault.read')
  listItemShares(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
  ) {
    return this.vaultService.listItemShares(
      request.user.sub,
      vaultId,
      vaultItemId,
    );
  }

  @Get(':vaultId/items/:vaultItemId/teams/:teamId/recipients')
  @RequirePermissions('vault.read')
  listTeamShareRecipients(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.vaultService.listTeamShareRecipients(
      request.user.sub,
      vaultId,
      vaultItemId,
      teamId,
    );
  }

  @Post(':vaultId/items/:vaultItemId/team-shares')
  @RequirePermissions('vault.update')
  createTeamItemShare(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Body() dto: CreateVaultItemTeamShareDto,
  ) {
    return this.vaultService.createTeamItemShare(
      request.user.sub,
      vaultId,
      vaultItemId,
      dto,
    );
  }

  @Patch('shared-items/:vaultItemId')
  @RequirePermissions('vault.update')
  updateSharedItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultItemId') vaultItemId: string,
    @Body() dto: UpdateSharedVaultItemDto,
  ) {
    return this.vaultService.updateSharedItem(
      request.user.sub,
      vaultItemId,
      dto,
    );
  }

  @Delete(':vaultId/items/:vaultItemId/shares/:recipientId')
  @RequirePermissions('vault.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeItemShare(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Param('recipientId') recipientId: string,
  ) {
    return this.vaultService.revokeItemShare(
      request.user.sub,
      vaultId,
      vaultItemId,
      recipientId,
    );
  }

  @Delete(':vaultId/items/:vaultItemId/team-shares/:teamId')
  @RequirePermissions('vault.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeTeamItemShare(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.vaultService.revokeTeamItemShare(
      request.user.sub,
      vaultId,
      vaultItemId,
      teamId,
    );
  }

  @Delete(':vaultId/items/:vaultItemId')
  @RequirePermissions('vault.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
  ) {
    return this.vaultService.deleteItem(request.user.sub, vaultId, vaultItemId);
  }

  @Post(':vaultId/items/:vaultItemId/restore')
  @RequirePermissions('vault.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  restoreItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
  ) {
    return this.vaultService.restoreItem(
      request.user.sub,
      vaultId,
      vaultItemId,
    );
  }

  @Delete(':vaultId/items/:vaultItemId/permanent')
  @RequirePermissions('vault.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentlyDeleteItem(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
  ) {
    return this.vaultService.permanentlyDeleteItem(
      request.user.sub,
      vaultId,
      vaultItemId,
    );
  }

  @Get(':vaultId/items/:vaultItemId/history')
  @RequirePermissions('vault.read')
  @ApiOkResponse({ description: 'Versiones anteriores cifradas del elemento.' })
  listItemHistory(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
  ) {
    return this.vaultService.listItemHistory(
      request.user.sub,
      vaultId,
      vaultItemId,
    );
  }

  @Post(':vaultId/items/:vaultItemId/history/:revisionId/restore')
  @RequirePermissions('vault.update')
  restoreItemRevision(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('vaultId') vaultId: string,
    @Param('vaultItemId') vaultItemId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.vaultService.restoreItemRevision(
      request.user.sub,
      vaultId,
      vaultItemId,
      revisionId,
    );
  }
}
