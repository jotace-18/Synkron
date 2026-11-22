import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchedulesModule } from './schedules/schedules.module';
import { RulesModule } from './rules/rules.module';

@Module({
  imports: [SchedulesModule, RulesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
