import { NestFactory } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';
import { ReminderPlannerService } from './reminder-planner.service';
import { ReminderProcessingModule } from './reminder-processing.module';

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
    ReminderProcessingModule,
    {
      logger: false,
      abortOnError: false,
    },
  );

  process.once('SIGTERM', requestStop);
  process.once('SIGINT', requestStop);

  try {
    await app.get(DatabaseService).checkConnection();

    const planner = app.get(ReminderPlannerService);
    const dispatcher = app.get(ReminderDispatcherService);

    let nextReviewAt = 0;

    console.log('Recordatorios de Automation activos');

    while (!stopping) {
      if (Date.now() >= nextReviewAt) {
        const created = await planner.prepareDue();

        if (created > 0) {
          console.log(`Recordatorios generados: ${created}`);
        }

        nextReviewAt = Date.now() + 60_000;
      }

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
      'El proceso de recordatorios de Automation se detuvo por un error',
    );
    process.exitCode = 1;
  });
}
