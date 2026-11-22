import { NestFactory } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { NotificationDeliveryModule } from './notification-delivery.module';
import { NotificationDispatcherService } from './notification-dispatcher.service';

let stopping = false;
let wakeUp: (() => void) | undefined;

function requestStop(): void {
  stopping = true;
  wakeUp?.();
}

async function pause(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);

    wakeUp = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  wakeUp = undefined;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    NotificationDeliveryModule,
    {
      logger: false,
      abortOnError: false,
    },
  );

  process.once('SIGTERM', requestStop);
  process.once('SIGINT', requestStop);

  try {
    await app.get(DatabaseService).checkConnection();

    const dispatcher = app.get(NotificationDispatcherService);

    console.log('Envío de notificaciones de Automation activo');

    while (!stopping) {
      for (let index = 0; index < 20 && !stopping; index += 1) {
        const processed = await dispatcher.dispatchOne();

        if (!processed) {
          break;
        }
      }

      if (!stopping) {
        await pause();
      }
    }
  } finally {
    process.removeListener('SIGTERM', requestStop);
    process.removeListener('SIGINT', requestStop);

    await app.close();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error(
      'El envío de notificaciones de Automation se detuvo por un error',
    );
    process.exitCode = 1;
  });
}
