import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MonitoringClientService } from '../monitoring-client/monitoring-client.service';
import { ReminderActivitiesClientService } from '../sync-client/reminder-activities-client.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';
import { ReminderPlannerService } from './reminder-planner.service';

@Module({
  providers: [
    DatabaseService,
    MonitoringClientService,
    ReminderActivitiesClientService,
    ReminderPlannerService,
    ReminderDispatcherService,
  ],
})
export class ReminderProcessingModule {}
