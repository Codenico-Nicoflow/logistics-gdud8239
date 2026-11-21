import { plainToInstance } from 'class-transformer';
import { IsBooleanString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Validated at boot so the process refuses to start with a missing or weak
 * secret rather than failing later, in production, with tokens anyone can forge.
 */
export class EnvVars {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_TTL?: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  WEB_ORIGIN?: string;

  @IsOptional()
  @IsBooleanString()
  COOKIE_SECURE?: string;

  /**
   * How many reverse proxies sit in front of the API (Vercel's rewrite, then Render's load
   * balancer). Express uses it to find the real client IP in X-Forwarded-For; rate limiting
   * is only as good as that IP. Too low and everyone shares the proxy's address; too high and a
   * client can invent its own. Read it off `GET /api/auth/debug-ip` on production.
   */
  @IsOptional()
  @IsNumberString()
  TRUST_PROXY_HOPS?: string;

  /** Test-only escape hatch for rate limits; never set this in production. */
  @IsOptional()
  @IsBooleanString()
  DISABLE_RATE_LIMIT?: string;
}

const WEAK_SECRETS = ['change-me-in-production', 'change-me-too-in-production', 'secret', 'changeme'];

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const config = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const detail = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${detail}`);
  }

  // Render sets RENDER=true on every service, so a deploy that forgot NODE_ENV is still
  // treated as production rather than quietly skipping the checks below.
  const isProduction = config.NODE_ENV === 'production' || raw.RENDER === 'true';
  if (isProduction && raw.DISABLE_RATE_LIMIT === 'true') {
    throw new Error('DISABLE_RATE_LIMIT must not be enabled in production');
  }
  if (isProduction) {
    if (!config.WEB_ORIGIN) throw new Error('WEB_ORIGIN must be set in production (CORS and the Origin check use it)');
    try {
      new URL(config.WEB_ORIGIN);
    } catch {
      throw new Error('WEB_ORIGIN must be a full address such as https://app.example');
    }
    if (config.COOKIE_SECURE !== 'true') {
      throw new Error('COOKIE_SECURE must be "true" in production, or login cookies travel without the Secure flag');
    }
    if (config.TRUST_PROXY_HOPS === undefined) {
      console.warn(
        '[config] TRUST_PROXY_HOPS is not set: behind Vercel and Render every visitor shares one IP, so ' +
          'per-IP rate limiting cannot tell them apart. Read the hop count from GET /api/auth/debug-ip.',
      );
    }
  }
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (WEAK_SECRETS.includes(config[key])) {
      const message = `${key} is still set to a placeholder value.`;
      if (isProduction) throw new Error(message);
      console.warn(`[config] ${message} Acceptable in development only.`);
    }
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  return config;
}
