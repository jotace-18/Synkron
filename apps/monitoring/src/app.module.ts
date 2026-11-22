import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [DashboardModule, NotificationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
