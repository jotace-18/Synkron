import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AssignmentsService } from './assignments/assignments.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DatabaseService, AssignmentsService],
})
export class AppModule {}
