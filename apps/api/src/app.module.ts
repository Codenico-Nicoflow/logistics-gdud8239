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
import { IssueFormsModule } from './issue-forms/issue-forms.module';
import { AllocationsModule } from './allocations/allocations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { IntakeModule } from './intake/intake.module';
import { MovementsModule } from './movements/movements.module';
import { CountsModule } from './counts/counts.module';
import { MesakemModule } from './mesakem/mesakem.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ExcelModule } from './excel/excel.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { DbBackupsModule } from './db-backups/db-backups.module';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      // `skipIf` is evaluated per request, so the flag is read at call time
      // rather than at module load. A dedicated flag is used rather than
      // NODE_ENV, which .env files routinely overwrite, and env validation
      // rejects it in production.
      skipIf: () => process.env.DISABLE_RATE_LIMIT === 'true',
      // Tracked per authenticated user rather than per IP: the whole team works
      // from one network address, so an IP-based limit would have them sharing
      // a single budget and locking each other out.
      getTracker: (req: Record<string, unknown>) => {
        const user = req.user as { id?: string } | undefined;
        return user?.id ?? (req.ip as string) ?? 'anonymous';
      },
      throttlers: [
        // Generous: this exists to stop abuse, not to ration normal use. A
        // single screen can issue half a dozen requests, and a shift moves
        // through screens quickly.
        //
        // `blockDuration: 0` matters as much as the limit: with the default,
        // exceeding the limit starts a block that each further request extends,
        // so a browser that keeps polling never recovers and the data appears
        // to vanish at random. At 0 a full window simply rejects, and the
        // oldest hits age out normally.
        { name: 'default', ttl: 60_000, limit: 1000, blockDuration: 0 },
        // Tight, because guessing a password is the attack this prevents. Here
        // the extending block is the point.
        //
        // Every named throttler applies to every route unless skipped, so this
        // one is opted out of globally and re-enabled only on the login route
        // itself (see AuthController). Without that, a 5/min budget meant for
        // password guessing was being spent by ordinary page loads.
        {
          name: 'login',
          ttl: 60_000,
          limit: 5,
          // A named throttler otherwise applies to every route, so an ordinary
          // page load would spend a budget meant for password guessing. This
          // keeps it on the login route alone.
          skipIf: (context) => {
            if (process.env.DISABLE_RATE_LIMIT === 'true') return true;
            const request = context.switchToHttp().getRequest<{ url?: string }>();
            return !request.url?.includes('/auth/login');
          },
        },
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
    IssueFormsModule,
    AllocationsModule,
    PermissionsModule,
    IntakeModule,
    MovementsModule,
    CountsModule,
    MesakemModule,
    AttendanceModule,
    ExcelModule,
    SnapshotsModule,
    DbBackupsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: rate limit, then authenticate, then authorise.
    // Authentication is global and opted out of with @Public(), so a new route
    // is protected by default rather than by remembering to add a guard.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
