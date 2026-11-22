import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DatabaseService,
    SessionClientService,
    SessionGuard,
    DashboardService,
  ],
})
export class DashboardModule {}
