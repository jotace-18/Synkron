import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SyncClientService } from '../sync-client/sync-client.service';
import { SyncRequestDispatcherService } from '../sync-requests/sync-request-dispatcher.service';
import { SchedulerService } from './scheduler.service';
import { RuleSyncDispatcherService } from '../rules/rule-sync-dispatcher.service';

@Module({
  providers: [
    DatabaseService,
    SyncClientService,
    SyncRequestDispatcherService,
    SchedulerService,
    RuleSyncDispatcherService,
  ],
  exports: [SchedulerService, SyncRequestDispatcherService],
})
export class SchedulingModule {}
