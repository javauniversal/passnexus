import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createCipheriv, createHash } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    totpFactor: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    mfaLoginChallenge: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    authToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn() };
  const authMailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };
  const authService = new AuthService(
    jwtService as never,
    prisma as never,
    authMailService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    authMailService.sendVerificationEmail.mockResolvedValue(undefined);
    authMailService.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it('creates a one-time password setup link without sending email', async () => {
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.authToken.create.mockResolvedValue({ id: 'token-id' });

    const setupUrl = await authService.createPasswordSetupLink('user-id');
    const token = decodeURIComponent(setupUrl.split('token=')[1]);

    expect(setupUrl).toContain('/#reset?token=');
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          purpose: 'PASSWORD_RESET',
          tokenHash: createHash('sha256').update(token).digest('hex'),
        }),
      }),
    );
    expect(authMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('keeps password reset responses generic when email delivery fails', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ana@example.com',
      status: 'ACTIVE',
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.authToken.create.mockResolvedValue({ id: 'token-id' });
    authMailService.sendPasswordResetEmail.mockRejectedValue(
      new Error('Resend unavailable'),
    );

    await expect(
      authService.requestPasswordReset('ana@example.com'),
    ).resolves.toEqual({
      message:
        'Si existe una cuenta activa, se enviaron instrucciones para restablecer la contraseña.',
    });
  });

  it('issues access and persists a hashed refresh session for an active user', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ana@example.com',
      displayName: 'Ana Garcia',
      passwordHash,
      status: 'ACTIVE',
      roles: [
        {
          role: {
            code: 'VAULT_MEMBER',
            permissions: [
              { permission: { code: 'vault.read' } },
              { permission: { code: 'organizations.read' } },
            ],
          },
        },
      ],
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      authService.login({
        email: 'ana@example.com',
        password: 'correct-horse-battery-staple',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.objectContaining({
          permissions: ['vault.read', 'organizations.read'],
        }),
      }),
    );
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-id' }),
      }),
    );
    const sessionData = (
      prisma.session.create.mock.calls[0][0] as {
        data: { refreshTokenHash: string };
      }
    ).data;
    await expect(
      argon2.verify(sessionData.refreshTokenHash, 'refresh-token'),
    ).resolves.toBe(true);
  });

  it('returns a restricted challenge instead of a session for a temporary password', async () => {
    const passwordHash = await argon2.hash('temporary-password', {
      type: argon2.argon2id,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ana@example.com',
      displayName: 'Ana Garcia',
      passwordHash,
      status: 'ACTIVE',
      mustChangePassword: true,
      roles: [{ role: { code: 'VAULT_MEMBER' } }],
      totpFactor: null,
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.authToken.create.mockResolvedValue({ id: 'change-token-id' });

    await expect(
      authService.login({
        email: 'ana@example.com',
        password: 'temporary-password',
      }),
    ).resolves.toEqual({
      requiresPasswordChange: true,
      changeToken: expect.any(String),
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          purpose: 'PASSWORD_CHANGE',
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('consumes a password-change challenge and clears the forced-change flag', async () => {
    const temporaryHash = await argon2.hash('temporary-password', {
      type: argon2.argon2id,
    });
    prisma.authToken.findUnique.mockResolvedValue({
      id: 'change-token-id',
      userId: 'user-id',
      purpose: 'PASSWORD_CHANGE',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: temporaryHash,
      mustChangePassword: true,
    });
    prisma.user.update.mockResolvedValue({ id: 'user-id' });
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      authService.changeTemporaryPassword(
        'a-valid-password-change-token-with-enough-length',
        'a-new-secure-password',
      ),
    ).resolves.toEqual({
      message: 'Contraseña actualizada. Inicia sesión con la nueva contraseña.',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
        data: expect.objectContaining({ mustChangePassword: false }),
      }),
    );
    const updatedHash = (
      prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string };
      }
    ).data.passwordHash;
    await expect(
      argon2.verify(updatedHash, 'a-new-secure-password'),
    ).resolves.toBe(true);
  });

  it('rejects invalid credentials and unverified users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      authService.login({
        email: 'ana@example.com',
        password: 'incorrect-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ana@example.com',
      passwordHash,
      status: 'PENDING_VERIFICATION',
      roles: [],
    });
    await expect(
      authService.login({
        email: 'ana@example.com',
        password: 'correct-horse-battery-staple',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a one-time MFA challenge instead of creating a session for an MFA user', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ana@example.com',
      displayName: 'Ana Garcia',
      passwordHash,
      status: 'ACTIVE',
      roles: [],
      totpFactor: { enabledAt: new Date() },
    });
    prisma.mfaLoginChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prisma.mfaLoginChallenge.create.mockResolvedValue({ id: 'challenge-id' });

    await expect(
      authService.login({
        email: 'ana@example.com',
        password: 'correct-horse-battery-staple',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        requiresMfa: true,
        challengeToken: expect.any(String),
      }),
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(prisma.mfaLoginChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('requires MFA before returning the restricted password-change challenge', async () => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'PassNexus',
      label: 'ana@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const previousKey = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const nonce = Buffer.alloc(12, 3);
    const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), nonce);
    const secretCiphertext = Buffer.concat([
      cipher.update(secret.base32, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
    prisma.mfaLoginChallenge.findUnique.mockResolvedValue({
      id: 'challenge-id',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-id',
        email: 'ana@example.com',
        displayName: 'Ana Garcia',
        mustChangePassword: true,
        roles: [{ role: { code: 'VAULT_MEMBER' } }],
        totpFactor: {
          enabledAt: new Date(),
          secretCiphertext,
          secretNonce: nonce.toString('base64url'),
        },
      },
    });
    prisma.mfaLoginChallenge.updateMany.mockResolvedValue({ count: 1 });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.authToken.create.mockResolvedValue({ id: 'change-token-id' });

    await expect(
      authService.verifyMfaLogin('valid-mfa-challenge', totp.generate()),
    ).resolves.toEqual({
      requiresPasswordChange: true,
      changeToken: expect.any(String),
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purpose: 'PASSWORD_CHANGE' }),
      }),
    );
    process.env.TOTP_ENCRYPTION_KEY = previousKey;
  });

  it('enables a pending TOTP factor only after validating an RFC 6238 code', async () => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'PassNexus',
      label: 'ana@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const key = Buffer.alloc(32, 7).toString('base64');
    const previousKey = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = key;
    const nonce = Buffer.alloc(12, 3).toString('base64url');
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.alloc(32, 7),
      Buffer.alloc(12, 3),
    );
    const ciphertext = Buffer.concat([
      cipher.update(secret.base32, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
    prisma.totpFactor.findUnique.mockResolvedValue({
      userId: 'user-id',
      secretCiphertext: ciphertext,
      secretNonce: nonce,
      enabledAt: null,
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'ana@example.com' });
    prisma.totpFactor.update.mockResolvedValue({ userId: 'user-id' });

    await expect(
      authService.verifyMfaSetup('user-id', totp.generate()),
    ).resolves.toEqual({ enabled: true });
    expect(prisma.totpFactor.update).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      data: { enabledAt: expect.any(Date) },
    });
    process.env.TOTP_ENCRYPTION_KEY = previousKey;
  });

  it('activates the user only after consuming a valid verification token', async () => {
    prisma.authToken.findUnique.mockResolvedValue({
      id: 'verification-token-id',
      userId: 'user-id',
      purpose: 'EMAIL_VERIFICATION',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({ id: 'user-id' });

    await expect(
      authService.verifyEmail('a-valid-verification-token-with-enough-length'),
    ).resolves.toEqual({ message: 'Correo electrónico verificado.' });
    expect(prisma.authToken.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('a-valid-verification-token-with-enough-length')
          .digest('hex'),
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          emailVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('changes the password and revokes every active session after a valid reset token', async () => {
    prisma.authToken.findUnique.mockResolvedValue({
      id: 'reset-token-id',
      userId: 'user-id',
      purpose: 'PASSWORD_RESET',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({ id: 'user-id' });
    prisma.session.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      authService.resetPassword(
        'a-valid-password-reset-token-with-enough-length',
        'new-correct-horse-battery-staple',
      ),
    ).resolves.toEqual({
      message: 'Contraseña restablecida. Inicia sesión de nuevo.',
    });
    const passwordHash = (
      prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }
    ).data.passwordHash;
    await expect(
      argon2.verify(passwordHash, 'new-correct-horse-battery-staple'),
    ).resolves.toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
