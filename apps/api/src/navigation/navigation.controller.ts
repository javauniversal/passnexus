import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenPayload } from '../auth/jwt.strategy';
import { NavigationService } from './navigation.service';

@ApiTags('navigation')
@ApiBearerAuth()
@Controller('navigation')
@UseGuards(AccessTokenGuard)
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  @Get('menu')
  @ApiOkResponse({
    description: 'Menú configurable autorizado para el usuario actual.',
  })
  getMenu(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.navigationService.getMenuForUser(request.user.sub);
  }
}
