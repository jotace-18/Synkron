import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { ReminderSettingsController } from './reminder-settings.controller';
import { ReminderSettingsService } from './reminder-settings.service';

@Module({
  controllers: [ReminderSettingsController],
  providers: [
    DatabaseService,
    SessionClientService,
    SessionGuard,
    WriteSessionGuard,
    ReminderSettingsService,
  ],
})
export class RemindersModule {}
