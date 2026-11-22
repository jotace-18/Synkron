import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { SyncClientService } from '../sync-client/sync-client.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  controllers: [SchedulesController],
  providers: [
    DatabaseService,
    SessionClientService,
    SessionGuard,
    WriteSessionGuard,
    SyncClientService,
    SchedulesService,
  ],
})
export class SchedulesModule {}
