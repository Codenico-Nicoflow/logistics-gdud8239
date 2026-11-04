import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * Global because the app-wide `JwtAuthGuard` is registered in `AppModule` and
 * needs `JwtService`; exporting it here keeps that guard resolvable without each
 * feature module re-importing JwtModule.
 */
@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
