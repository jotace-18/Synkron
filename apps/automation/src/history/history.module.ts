import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  controllers: [HistoryController],
  providers: [
    DatabaseService,
    SessionClientService,
    SessionGuard,
    HistoryService,
  ],
})
export class HistoryModule {}
