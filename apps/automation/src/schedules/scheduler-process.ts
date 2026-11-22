import { NestFactory } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { SyncRequestDispatcherService } from '../sync-requests/sync-request-dispatcher.service';
import { SchedulerService } from './scheduler.service';
import { SchedulingModule } from './scheduling.module';
import { RuleSyncDispatcherService } from '../rules/rule-sync-dispatcher.service';

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
  const app = await NestFactory.createApplicationContext(SchedulingModule, {
    logger: false,
    abortOnError: false,
  });

  process.once('SIGTERM', requestStop);
  process.once('SIGINT', requestStop);

  try {
    await app.get(DatabaseService).checkConnection();

    const scheduler = app.get(SchedulerService);
    const dispatcher = app.get(SyncRequestDispatcherService);
    const ruleDispatcher = app.get(RuleSyncDispatcherService);

    console.log('Planificador de Automation activo');

    while (!stopping) {
      await scheduler.prepareDue();

      for (let index = 0; index < 20 && !stopping; index += 1) {
        const result = await dispatcher.dispatchOne();

        if (result.status === 'idle') {
          break;
        }

        console.log(`Solicitud ${result.request_id}: ${result.status}`);
      }

      for (let index = 0; index < 20 && !stopping; index += 1) {
        if (!(await ruleDispatcher.dispatchOne())) break;
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
    console.error('El planificador de Automation se detuvo por un error');
    process.exitCode = 1;
  });
}
