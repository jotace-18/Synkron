import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { configureApiDocs } from './ingestions/configure-api-docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  configureApiDocs(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error: unknown) => {
  console.error('No se pudo iniciar Sync:', error);
  process.exit(1);
});
