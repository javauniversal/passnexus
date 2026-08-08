import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { AuthMailService } from './auth-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authMailService: AuthMailService,
  ) {}

  async verifyEmail(token: string) {
    return this.consumeToken(
      token,
      'EMAIL_VERIFICATION',
      async (transaction, userId) => {
        await transaction.user.update({
          where: { id: userId },
          data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
        });
        return { message: 'Correo electrónico verificado.' };
      },
    );
  }

  async resendVerification(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });
    if (user?.status === 'PENDING_VERIFICATION') {
      await this.issueToken(user.id, user.email, 'EMAIL_VERIFICATION');
    }
    return {
      message:
        'Si existe una cuenta pendiente, se enviaron instrucciones de verificación.',
    };
  }

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });
    if (user?.status === 'ACTIVE') {
      await this.issueToken(user.id, user.email, 'PASSWORD_RESET');
    }
    return {
      message:
        'Si existe una cuenta activa, se enviaron instrucciones para restablecer la contraseña.',
    };
  }

  async createPasswordSetupLink(userId: string) {
    const token = await this.createToken(userId, 'PASSWORD_RESET');
    const webOrigin = (
      process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173'
    ).replace(/\/$/, '');
    return `${webOrigin}/#reset?token=${encodeURIComponent(token)}`;
  }

  async resetPassword(token: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return this.consumeToken(
      token,
      'PASSWORD_RESET',
      async (transaction, userId) => {
        await transaction.user.update({
          where: { id: userId },
          data: {
            passwordHash,
            status: 'ACTIVE',
            mustChangePassword: false,
            emailVerifiedAt: new Date(),
          },
        });
        await transaction.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { message: 'Contraseña restablecida. Inicia sesión de nuevo.' };
      },
    );
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
        totpFactor: true,
      },
    });

    if (!user || !(await argon2.verify(user.passwordHash, loginDto.password))) {
      throw new UnauthorizedException(
        'Correo electrónico o contraseña incorrectos.',
      );
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Debes verificar tu correo electrónico antes de iniciar sesión.',
      );
    }

    if (user.totpFactor?.enabledAt) {
      return this.createMfaLoginChallenge(user.id);
    }

    if (user.mustChangePassword) {
      return this.createPasswordChangeChallenge(user.id);
    }

    return this.createSession(user);
  }

  async changeTemporaryPassword(changeToken: string, password: string) {
    return this.consumeToken(
      changeToken,
      'PASSWORD_CHANGE',
      async (transaction, userId) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true, mustChangePassword: true },
        });
        if (!user?.mustChangePassword) {
          throw new BadRequestException(
            'La contraseña temporal ya fue reemplazada.',
          );
        }
        if (await argon2.verify(user.passwordHash, password)) {
          throw new BadRequestException(
            'La nueva contraseña debe ser diferente de la temporal.',
          );
        }
        await transaction.user.update({
          where: { id: userId },
          data: {
            passwordHash: await argon2.hash(password, {
              type: argon2.argon2id,
            }),
            mustChangePassword: false,
          },
        });
        await transaction.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return {
          message:
            'Contraseña actualizada. Inicia sesión con la nueva contraseña.',
        };
      },
    );
  }

  async getMfaStatus(userId: string) {
    const factor = await this.prisma.totpFactor.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return { enabled: Boolean(factor?.enabledAt) };
  }

  async setupMfa(userId: string, email: string) {
    const existingFactor = await this.prisma.totpFactor.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    if (existingFactor?.enabledAt) {
      throw new ConflictException(
        'Desactiva MFA antes de configurar un nuevo autenticador.',
      );
    }

    const secret = new Secret({ size: 20 }).base32;
    const encryptedSecret = this.encryptTotpSecret(secret);
    await this.prisma.totpFactor.upsert({
      where: { userId },
      create: { userId, ...encryptedSecret },
      update: { ...encryptedSecret, enabledAt: null },
    });

    const totp = this.createTotp(secret, email);
    return {
      manualEntryKey: secret,
      otpauthUri: totp.toString(),
    };
  }

  async verifyMfaSetup(userId: string, code: string) {
    const factor = await this.prisma.totpFactor.findUnique({
      where: { userId },
    });
    if (!factor || factor.enabledAt) {
      throw new BadRequestException(
        'No hay una configuración MFA pendiente de verificación.',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (
      !user ||
      !this.isValidTotp(code, this.decryptTotpSecret(factor), user.email)
    ) {
      throw new UnauthorizedException(
        'El código de autenticación no es válido.',
      );
    }

    await this.prisma.totpFactor.update({
      where: { userId },
      data: { enabledAt: new Date() },
    });
    return { enabled: true };
  }

  async disableMfa(userId: string, code: string) {
    const factor = await this.prisma.totpFactor.findUnique({
      where: { userId },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (
      !factor?.enabledAt ||
      !user ||
      !this.isValidTotp(code, this.decryptTotpSecret(factor), user.email)
    ) {
      throw new UnauthorizedException(
        'El código de autenticación no es válido.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.totpFactor.delete({ where: { userId } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { enabled: false };
  }

  async verifyMfaLogin(challengeToken: string, code: string) {
    const tokenHash = this.hashToken(challengeToken);
    return this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.mfaLoginChallenge.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
              totpFactor: true,
            },
          },
        },
      });
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        !challenge.user.totpFactor?.enabledAt ||
        !this.isValidTotp(
          code,
          this.decryptTotpSecret(challenge.user.totpFactor),
          challenge.user.email,
        )
      ) {
        throw new UnauthorizedException(
          'El desafío MFA expiró o el código no es válido.',
        );
      }

      const consumption = await transaction.mfaLoginChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumption.count !== 1) {
        throw new UnauthorizedException(
          'El desafío MFA ya se utilizó o expiró.',
        );
      }
      if (challenge.user.mustChangePassword) {
        return this.createPasswordChangeChallenge(
          challenge.user.id,
          transaction,
        );
      }
      return this.createSession(challenge.user, transaction);
    });
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        sessionId: string;
        purpose: string;
      }>(refreshToken, { secret: this.getRefreshSecret() });
      if (payload.purpose !== 'refresh') {
        throw new UnauthorizedException(
          'La sesión de actualización no es válida.',
        );
      }

      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !(await argon2.verify(session.refreshTokenHash, refreshToken))
      ) {
        throw new UnauthorizedException(
          'La sesión ha expirado o fue revocada.',
        );
      }

      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return this.createSession(session.user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        'La sesión de actualización no es válida.',
      );
    }
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{
        sessionId: string;
        purpose: string;
      }>(refreshToken, { secret: this.getRefreshSecret() });
      if (payload.purpose === 'refresh') {
        await this.prisma.session.updateMany({
          where: { id: payload.sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      return;
    }
  }

  private async issueToken(
    userId: string,
    email: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ) {
    const token = await this.createToken(userId, purpose);
    if (purpose === 'EMAIL_VERIFICATION') {
      await this.authMailService.sendVerificationEmail(email, token);
    } else {
      await this.authMailService.sendPasswordResetEmail(email, token);
    }
  }

  private async createToken(
    userId: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE',
    prisma: Pick<Prisma.TransactionClient, 'authToken'> | PrismaService = this
      .prisma,
  ) {
    const token = randomBytes(32).toString('base64url');
    await prisma.authToken.deleteMany({
      where: { userId, purpose, consumedAt: null },
    });
    await prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + this.tokenLifetime(purpose)),
      },
    });
    return token;
  }

  private async createPasswordChangeChallenge(
    userId: string,
    prisma: Pick<Prisma.TransactionClient, 'authToken'> | PrismaService = this
      .prisma,
  ) {
    const changeToken = await this.createToken(
      userId,
      'PASSWORD_CHANGE',
      prisma,
    );
    return { requiresPasswordChange: true as const, changeToken };
  }

  private async consumeToken<T>(
    rawToken: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE',
    operation: (
      transaction: Prisma.TransactionClient,
      userId: string,
    ) => Promise<T>,
  ) {
    const tokenHash = this.hashToken(rawToken);
    return this.prisma.$transaction(async (transaction) => {
      const authToken = await transaction.authToken.findUnique({
        where: { tokenHash },
      });
      if (
        !authToken ||
        authToken.purpose !== purpose ||
        authToken.consumedAt ||
        authToken.expiresAt <= new Date()
      ) {
        throw new BadRequestException(
          'El enlace es inválido, ya se utilizó o expiró.',
        );
      }
      const consumption = await transaction.authToken.updateMany({
        where: {
          id: authToken.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumption.count !== 1) {
        throw new BadRequestException(
          'El enlace es inválido, ya se utilizó o expiró.',
        );
      }
      return operation(transaction, authToken.userId);
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenLifetime(
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE',
  ) {
    if (purpose === 'EMAIL_VERIFICATION') return 24 * 60 * 60 * 1000;
    if (purpose === 'PASSWORD_CHANGE') return 10 * 60 * 1000;
    return 60 * 60 * 1000;
  }

  private async createMfaLoginChallenge(userId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.mfaLoginChallenge.deleteMany({
      where: { userId, consumedAt: null },
    });
    await this.prisma.mfaLoginChallenge.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return { requiresMfa: true as const, challengeToken: token };
  }

  private createTotp(secret: string, email: string) {
    return new TOTP({
      issuer: 'PassNexus',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
  }

  private isValidTotp(code: string, secret: string, email: string) {
    return (
      this.createTotp(secret, email).validate({ token: code, window: 1 }) !==
      null
    );
  }

  private encryptTotpSecret(secret: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.getTotpEncryptionKey(),
      nonce,
    );
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return {
      secretCiphertext: Buffer.concat([
        ciphertext,
        cipher.getAuthTag(),
      ]).toString('base64url'),
      secretNonce: nonce.toString('base64url'),
    };
  }

  private decryptTotpSecret(factor: {
    secretCiphertext: string;
    secretNonce: string;
  }) {
    const encrypted = Buffer.from(factor.secretCiphertext, 'base64url');
    const authTag = encrypted.subarray(-16);
    const ciphertext = encrypted.subarray(0, -16);
    if (ciphertext.length === 0 || authTag.length !== 16) {
      throw new InternalServerErrorException(
        'La configuración MFA almacenada no es válida.',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getTotpEncryptionKey(),
        Buffer.from(factor.secretNonce, 'base64url'),
      );
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'No fue posible descifrar la configuración MFA.',
      );
    }
  }

  private getTotpEncryptionKey() {
    const value = process.env.TOTP_ENCRYPTION_KEY;
    const key = value ? Buffer.from(value, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'TOTP_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes.',
      );
    }
    return key;
  }

  private async createSession(
    user: {
      id: string;
      email: string;
      displayName: string;
      roles: {
        role: {
          code: string;
          permissions?: { permission: { code: string } }[];
        };
      }[];
    },
    prisma: Pick<Prisma.TransactionClient, 'session'> | PrismaService = this
      .prisma,
  ) {
    const roles = user.roles.map((userRole) => userRole.role.code);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          (userRole.role.permissions ?? []).map(
            (rolePermission) => rolePermission.permission.code,
          ),
        ),
      ),
    );
    const sessionId = randomUUID();
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles,
      purpose: 'access',
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, sessionId, purpose: 'refresh' },
      { secret: this.getRefreshSecret(), expiresIn: '30d' },
    );
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: await argon2.hash(refreshToken, {
          type: argon2.argon2id,
        }),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles,
        permissions,
      },
    };
  }

  private getRefreshSecret() {
    return (
      process.env.JWT_REFRESH_SECRET ??
      'passnexus-local-development-refresh-secret'
    );
  }
}
