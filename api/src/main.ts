import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

function parseAllowedOrigins(value?: string): string[] | boolean {
  if (!value) return true;
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

function isStrictEnvValidationEnabled(): boolean {
  return process.env.STRICT_ENV_VALIDATION === 'true';
}

function assertSecureEnv(): void {
  if (!isStrictEnvValidationEnabled()) return;

  const jwtSecret = process.env.JWT_SECRET || '';
  const blockedFragments = ['change-this', 'replace-with', 'secret-in-production'];
  if (jwtSecret.length < 32 || blockedFragments.some((fragment) => jwtSecret.includes(fragment))) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres y no puede ser un placeholder');
  }

  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN debe configurarse explícitamente en producción');
  }

  const dataEncryptionKey = process.env.APP_DATA_ENCRYPTION_KEY || '';
  if (
    !dataEncryptionKey ||
    dataEncryptionKey.length < 32 ||
    blockedFragments.some((fragment) => dataEncryptionKey.includes(fragment))
  ) {
    throw new Error(
      'APP_DATA_ENCRYPTION_KEY debe tener al menos 32 caracteres y no puede ser un placeholder',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN;
  assertSecureEnv();
  if (isProduction && (!corsOrigin || corsOrigin === '*')) {
    throw new Error('CORS_ORIGIN debe configurarse explícitamente en producción');
  }

  app.enableCors({
    origin: parseAllowedOrigins(corsOrigin),
  });

  // Serve the POS PWA only under /pos/. The unified Flask login owns /login and /.
  const pwaPath = process.env.PWA_PATH || join(__dirname, '..', '..', 'pwa');
  app.useStaticAssets(pwaPath, { prefix: '/pos/' });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}
bootstrap();
