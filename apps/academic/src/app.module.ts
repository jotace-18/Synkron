import { ExamsService } from './exams/exams.service';
import { ExamsController } from './exams/exams.controller';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AssignmentsService } from './assignments/assignments.service';
import { AuthService } from './auth/auth.service';
import { BearerGuard } from './auth/bearer.guard';
import { AssignmentsController } from './assignments/assignments.controller';

@Module({
  imports: [],
  controllers: [AppController, AssignmentsController, ExamsController],
  providers: [
    AppService,
    DatabaseService,
    AssignmentsService,
    ExamsService,
    AuthService,
    BearerGuard,
  ],
})
export class AppModule {}
