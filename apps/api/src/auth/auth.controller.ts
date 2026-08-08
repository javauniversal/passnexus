import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import { ChangeTemporaryPasswordDto } from './dto/change-temporary-password.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyMfaLoginDto } from './dto/verify-mfa-login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { AccessTokenPayload } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerification(resendVerificationDto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }

  @Post('change-temporary-password')
  @HttpCode(HttpStatus.OK)
  changeTemporaryPassword(
    @Body() changeTemporaryPasswordDto: ChangeTemporaryPasswordDto,
  ) {
    return this.authService.changeTemporaryPassword(
      changeTemporaryPasswordDto.changeToken,
      changeTemporaryPasswordDto.password,
    );
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Sesión autenticada.' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const loginResult = await this.authService.login(loginDto);
    if (
      'requiresMfa' in loginResult ||
      'requiresPasswordChange' in loginResult
    ) {
      return loginResult;
    }
    const { refreshToken, ...result } = loginResult;
    this.setRefreshCookie(response, refreshToken);
    return result;
  }

  @Post('mfa/login/verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyMfaLogin(
    @Body() verifyMfaLoginDto: VerifyMfaLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const verificationResult = await this.authService.verifyMfaLogin(
      verifyMfaLoginDto.challengeToken,
      verifyMfaLoginDto.code,
    );
    if ('requiresPasswordChange' in verificationResult) {
      return verificationResult;
    }
    const { refreshToken, ...result } = verificationResult;
    this.setRefreshCookie(response, refreshToken);
    return result;
  }

  @Get('mfa/status')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  mfaStatus(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.getMfaStatus(request.user.sub);
  }

  @Post('mfa/setup')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  setupMfa(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.setupMfa(request.user.sub, request.user.email);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  verifyMfaSetup(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() verifyTotpDto: VerifyTotpDto,
  ) {
    return this.authService.verifyMfaSetup(
      request.user.sub,
      verifyTotpDto.code,
    );
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  disableMfa(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() verifyTotpDto: VerifyTotpDto,
  ) {
    return this.authService.disableMfa(request.user.sub, verifyTotpDto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const currentRefreshToken = this.getRefreshToken(request);
    if (!currentRefreshToken) {
      throw new UnauthorizedException(
        'No se encontró una sesión de actualización.',
      );
    }
    const { refreshToken, ...result } =
      await this.authService.refresh(currentRefreshToken);
    this.setRefreshCookie(response, refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(this.getRefreshToken(request));
    response.clearCookie('passnexus_refresh', { path: '/api/auth' });
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Identidad resuelta desde el access token.' })
  me(@Req() request: Request & { user: AccessTokenPayload }) {
    return request.user;
  }

  private getRefreshToken(request: Request) {
    return request.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('passnexus_refresh='))
      ?.slice('passnexus_refresh='.length);
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie('passnexus_refresh', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
  }
}
