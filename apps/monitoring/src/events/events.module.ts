import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EventsService } from './events.service';

@Module({
  providers: [DatabaseService, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
