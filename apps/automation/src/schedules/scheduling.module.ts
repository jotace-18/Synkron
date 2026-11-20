import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SyncClientService } from '../sync-client/sync-client.service';
import { SyncRequestDispatcherService } from '../sync-requests/sync-request-dispatcher.service';
import { SchedulerService } from './scheduler.service';

@Module({
  providers: [
    DatabaseService,
    SyncClientService,
    SyncRequestDispatcherService,
    SchedulerService,
  ],
  exports: [SchedulerService, SyncRequestDispatcherService],
})
export class SchedulingModule {}
