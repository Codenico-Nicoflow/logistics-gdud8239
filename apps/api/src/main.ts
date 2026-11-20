import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('bootstrap');

  app.use(helmet());
  app.use(cookieParser());
  // Excludes bare '/' so it stays reachable outside the API prefix — a plain
  // 200 there for anyone (or any infra check) that visits the service root
  // directly, instead of a 404 that reads as the deploy being broken.
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Tokens travel in cookies, so the browser must be allowed to send them and
  // the allowed origin must be explicit — a wildcard origin cannot use credentials.
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
