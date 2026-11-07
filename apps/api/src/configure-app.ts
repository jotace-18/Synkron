import {
  HttpStatus,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';

export function configureApp(app: INestApplication): void {
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
