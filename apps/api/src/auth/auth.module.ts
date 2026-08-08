import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthMailService } from './auth-mail.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret:
        process.env.JWT_ACCESS_SECRET ??
        'passnexus-local-development-access-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenGuard,
    AuthMailService,
    AuthService,
    JwtStrategy,
    PermissionGuard,
  ],
  exports: [AccessTokenGuard, AuthService, PermissionGuard],
})
export class AuthModule {}
