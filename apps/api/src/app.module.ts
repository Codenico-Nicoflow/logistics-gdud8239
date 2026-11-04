import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { SoldiersModule } from './soldiers/soldiers.module';
import { ItemsModule } from './items/items.module';
import { SignaturesModule } from './signatures/signatures.module';
import { MovementsModule } from './movements/movements.module';
import { ExcelModule } from './excel/excel.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      // `skipIf` is evaluated per request, so the flag is read at call time
      // rather than at module load. The login limit below is deliberately tight
      // (5/min) and would otherwise throttle the test suite's own repeated
      // logins; it is verified on its own in `throttling.e2e.spec.ts`.
      // A dedicated flag is used rather than NODE_ENV, which .env files
      // routinely overwrite, and env validation rejects it in production.
      skipIf: () => process.env.DISABLE_RATE_LIMIT === 'true',
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 120 },
        { name: 'login', ttl: 60_000, limit: 5 },
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    SoldiersModule,
    ItemsModule,
    SignaturesModule,
    MovementsModule,
    ExcelModule,
    SnapshotsModule,
  ],
  providers: [
    // Order matters: rate limit, then authenticate, then authorise.
    // Authentication is global and opted out of with @Public(), so a new route
    // is protected by default rather than by remembering to add a guard.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
