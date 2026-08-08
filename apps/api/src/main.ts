import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const canonicalWebOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const allowedWebOrigins = [
    canonicalWebOrigin,
    ...(process.env.WEB_ORIGINS?.split(',') ?? []),
  ]
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(
      (origin, index, origins) => origin && origins.indexOf(origin) === index,
    );
  app.use(helmet());
  app.enableCors({
    origin: allowedWebOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('PassNexus API')
      .setDescription('API del gestor centralizado de secretos.')
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? process.env.API_PORT ?? '3000';
  await app.listen(port, '0.0.0.0');
}
bootstrap();
