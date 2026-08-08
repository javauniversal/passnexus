import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  purpose: 'access';
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_ACCESS_SECRET ??
        'passnexus-local-development-access-secret',
    });
  }

  async validate(payload: AccessTokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, mustChangePassword: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.mustChangePassword) {
      throw new UnauthorizedException('La sesión ya no es válida.');
    }
    return payload;
  }
}
