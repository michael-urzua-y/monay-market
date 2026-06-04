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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN;
  if (isProduction && process.env.JWT_SECRET === 'change-this-secret-in-production') {
    throw new Error('JWT_SECRET debe configurarse con un valor seguro en producción');
  }
  if (isProduction && (!corsOrigin || corsOrigin === '*')) {
    throw new Error('CORS_ORIGIN debe configurarse explícitamente en producción');
  }

  app.enableCors({
    origin: parseAllowedOrigins(corsOrigin),
  });

  // Serve PWA static files. Docker sets PWA_PATH; local dev keeps ../pwa.
  const pwaPath = process.env.PWA_PATH || join(__dirname, '..', '..', 'pwa');
  app.useStaticAssets(pwaPath, { prefix: '/' });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}
bootstrap();
