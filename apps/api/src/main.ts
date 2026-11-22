import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { InternalAuthModule } from './internals/internal-auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const internalApp = await NestFactory.create(InternalAuthModule);
  configureApp(internalApp);
  internalApp.enableShutdownHooks();

  await internalApp.listen(3003, '0.0.0.0');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error: unknown) => {
  console.error('No se pudo iniciar la API:', error);
  process.exit(1);
});
