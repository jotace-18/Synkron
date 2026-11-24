import { SourceIdentityController } from './auth/source-identity.controller';
import { SourceIdentityService } from './auth/source-identity.service';
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
  controllers: [
    SourceIdentityController,
    AppController,
    AssignmentsController,
    ExamsController,
  ],
  providers: [
    SourceIdentityService,
    AppService,
    DatabaseService,
    AssignmentsService,
    ExamsService,
    AuthService,
    BearerGuard,
  ],
})
export class AppModule {}
