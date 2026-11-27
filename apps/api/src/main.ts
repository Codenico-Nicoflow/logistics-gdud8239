import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { useBodyParsers } from './common/body-parsers';
import { appValidationPipe } from './common/validation-pipe';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { normalizeOrigin, originCheck } from './common/origin-check.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('bootstrap');
  const webOrigin = normalizeOrigin(config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173');

  // Behind Vercel's rewrite and Render's load balancer, `req.ip` is the proxy's address unless
  // Express is told how many proxies to believe. Rate limiting keys on that IP, so without it
  // every visitor shares one budget. The hop count comes from the environment because it
  // depends on the hosting chain and cannot be guessed: too low merges everyone, too high lets
  // a client invent its own address.
  app.set('trust proxy', Number(config.get<string>('TRUST_PROXY_HOPS') ?? 0));

  app.use(
    helmet({
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
      // The API answers JSON. The print pages set their own, stricter nonce-based policy.
      contentSecurityPolicy: { useDefaults: true, directives: { frameAncestors: ["'none'"] } },
    }),
  );
  app.use(cookieParser());
  useBodyParsers(app);
  app.use(originCheck(webOrigin));
  // Printed at boot so a wrong value is visible in the deploy log instead of only as blocked logins.
  logger.log(`Browser origin allowed for writes and CORS: ${webOrigin}`);

  // Excludes bare '/' so it stays reachable outside the API prefix — a plain
  // 200 there for anyone (or any infra check) that visits the service root
  // directly, instead of a 404 that reads as the deploy being broken.
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Tokens travel in cookies, so the browser must be allowed to send them and
  // the allowed origin must be explicit — a wildcard origin cannot use credentials.
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    appValidationPipe(),
  );

  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 3000);
  const server = await app.listen(port);
  // Slow-client defences: a connection that dribbles headers or a body forever holds a socket
  // (and, with enough of them, the server) hostage.
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 65_000;
  logger.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
