import { configureIngestionHttp } from './ingestions/ingestion-http';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  configureIngestionHttp(app);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
}
