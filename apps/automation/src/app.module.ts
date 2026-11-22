import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchedulesModule } from './schedules/schedules.module';
import { RulesModule } from './rules/rules.module';
import { RemindersModule } from './reminders/reminders.module';
import { HistoryModule } from './history/history.module';

@Module({
  imports: [SchedulesModule, RulesModule, RemindersModule, HistoryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
