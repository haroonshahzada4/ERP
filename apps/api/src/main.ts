import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // Allow small logo data-URLs in branding payloads.
  app.useBodyParser('json', { limit: '512kb' });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix') ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  app.enableCors({
    origin: config.get<string>('corsOrigin') ?? 'http://localhost:8001',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('ERP SaaS API')
    .setDescription('Multi-tenant SaaS ERP — Local-First Phase 0 Secure Boundaries')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('port') ?? 8000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`API listening on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
