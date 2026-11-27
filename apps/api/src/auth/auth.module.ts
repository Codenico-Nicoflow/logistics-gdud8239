import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { InvitesService } from './invites.service';
import { SessionCookies } from './session-cookies';
import { MfaController } from './mfa.controller';
import { MfaPolicy } from './mfa-policy.service';
import { MfaService } from './mfa.service';

/**
 * Global because the app-wide `JwtAuthGuard` is registered in `AppModule` and
 * needs `JwtService`; exporting it here keeps that guard resolvable without each
 * feature module re-importing JwtModule.
 */
@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [AuthService, InvitesService, SessionCookies, MfaPolicy, MfaService],
  controllers: [AuthController, MfaController],
  exports: [AuthService, InvitesService, SessionCookies, MfaService, MfaPolicy, JwtModule],
})
export class AuthModule {}
