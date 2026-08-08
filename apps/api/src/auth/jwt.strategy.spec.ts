import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, type AccessTokenPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const strategy = new JwtStrategy(prisma as never);
  const payload: AccessTokenPayload = {
    sub: 'user-id',
    email: 'ana@example.com',
    roles: ['VAULT_MEMBER'],
    purpose: 'access',
  };

  beforeEach(() => jest.resetAllMocks());

  it('rejects existing access tokens while a password change is required', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      mustChangePassword: true,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts access tokens for active users without a pending change', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    await expect(strategy.validate(payload)).resolves.toEqual(payload);
  });
});
