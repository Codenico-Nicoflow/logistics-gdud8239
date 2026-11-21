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
import { IfsunModule } from './ifsun/ifsun.module';
import { DbBackupsModule } from './db-backups/db-backups.module';
import { AppController } from './app.controller';
import { ipTracker, onlyForTier, perMinute, trackerOf } from './common/throttle-tiers';
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
      // Per authenticated user, else per IP. This only works because JwtAuthGuard runs
      // BEFORE the throttler (see the guard order below): the throttler used to run first,
      // never saw `req.user`, and silently keyed everything by IP. The team shares one
      // network address, so an IP key would have them sharing a single budget.
      getTracker: trackerOf,
      errorMessage: (_context, detail) =>
        `יותר מדי בקשות. נסו שוב בעוד ${Math.max(1, detail.timeToBlockExpire || Math.ceil(detail.ttl / 1000))} שניות`,
      throttlers: [
        // Sized for the busiest day, not a quiet one: at the start of a תעסוקה the whole
        // battalion signs at once, and adding soldiers, toggling מחויל and searching on every
        // keystroke is a lot of requests from a handful of people. Per user, 1200 a minute is 20
        // a second — a person can never reach it, a runaway script does. `blockDuration: 0`
        // matters as much as the limit: with the default, exceeding it starts a block that each
        // further request extends, so a browser that keeps polling never recovers.
        { name: 'default', ttl: 60_000, limit: perMinute('THROTTLE_DEFAULT_PER_MIN', 1200), blockDuration: 0 },

        // --- Anonymous routes ---
        // The whole unit shares ONE network address, so nothing here may be a tight per-address
        // budget: a morning of logins, or everyone returning from a break and refreshing at
        // once, would lock the base out. What actually stops password guessing is the per-ACCOUNT
        // lockout and the failure counter in AuthService; these limits only keep the server from
        // being flooded (every login costs a bcrypt hash).
        // Login is keyed by the address alone (a cookie must not be able to choose its bucket).
        { name: 'login', ttl: 60_000, limit: perMinute('THROTTLE_LOGIN_PER_MIN', 600), blockDuration: 30_000, getTracker: ipTracker, skipIf: onlyForTier('login') },
        { name: 'loginHour', ttl: 3_600_000, limit: 6_000, blockDuration: 300_000, getTracker: ipTracker, skipIf: onlyForTier('loginHour') },
        // Refresh and logout carry a session cookie, so they count per SESSION (see trackerOf),
        // not per building: nobody shares a budget with anybody else.
        { name: 'authIp', ttl: 60_000, limit: perMinute('THROTTLE_REFRESH_PER_MIN', 60), blockDuration: 60_000, skipIf: onlyForTier('authIp') },

        // --- Per user ---
        // Changing a password is a password-guessing oracle for anyone holding a stolen session.
        { name: 'account', ttl: 900_000, limit: 5, blockDuration: 900_000, skipIf: onlyForTier('account') },
        // Whole-database reads and file downloads: slow to build, and exactly what a stolen
        // session would be used for. A person needs one or two a minute at most.
        { name: 'heavy', ttl: 60_000, limit: perMinute('THROTTLE_HEAVY_PER_MIN', 10), blockDuration: 0, skipIf: onlyForTier('heavy') },
        // One document at a time, but printing a stack of signed forms is normal on a signing day.
        { name: 'print', ttl: 60_000, limit: perMinute('THROTTLE_PRINT_PER_MIN', 180), blockDuration: 0, skipIf: onlyForTier('print') },
        // These spawn pg_dump or build a full workbook: CPU and disk, not just data.
        { name: 'heavyCreate', ttl: 3_600_000, limit: 6, blockDuration: 0, skipIf: onlyForTier('heavyCreate') },
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
    IfsunModule,
    CountsModule,
    MesakemModule,
    AttendanceModule,
    ExcelModule,
    SnapshotsModule,
    DbBackupsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate, then rate limit, then authorise. The limiter has to see
    // `req.user` to key by user, so it runs after JwtAuthGuard; public routes pass through
    // JwtAuthGuard untouched and are limited by IP.
    // Authentication is global and opted out of with @Public(), so a new route
    // is protected by default rather than by remembering to add a guard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
