import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MonitoringClientService } from './monitoring-client.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  providers: [
    DatabaseService,
    MonitoringClientService,
    NotificationDispatcherService,
  ],
})
export class NotificationDeliveryModule {}
