import { NestFactory } from '@nestjs/core';
import { VersioningType, ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { CentralizedExceptionFilter } from './common/filters/centralized-exception.filter';

const INSECURE_DEFAULTS = ['super-secret-jwt-key-2026', 'changeme', 'secret'];

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('FATAL: JWT_SECRET is missing or set to an insecure default. Refusing to start in production.');
      process.exit(1);
    }
    logger.warn('WARNING: JWT_SECRET is using an insecure default value. Set a strong secret before deploying to production.');
  }

  const app = await NestFactory.create(AppModule);

  // Enable CORS - allow any localhost origin in development
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow any localhost or 127.0.0.1 origin regardless of port
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      // Allow explicitly listed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global path prefix for API standard endpoints
  app.setGlobalPrefix('api');

  // Enable API Versioning (e.g. /api/v1/...)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Centralized Error Filter
  app.useGlobalFilters(new CentralizedExceptionFilter());

  // Global Request DTO Validation Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that do not have decorators in the DTO
      transform: true, // auto transform payloads to match DTO type signatures
      forbidNonWhitelisted: true, // throw exception if unmapped properties are sent
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Gympify Mobile BFF is running on port: ${port}`);
}
bootstrap();
