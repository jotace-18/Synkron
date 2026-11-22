import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AutomationNotificationsController } from '../internals/automation-notifications.controller';
import { AutomationServiceGuard } from '../internals/automation-service.guard';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [AutomationNotificationsController, NotificationsController],
  providers: [
    DatabaseService,
    AutomationServiceGuard,
    SessionClientService,
    SessionGuard,
    WriteSessionGuard,
    NotificationsService,
  ],
})
export class NotificationsModule {}
