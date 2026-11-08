import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AssignmentsService } from './assignments/assignments.service';
import { AuthService } from './auth/auth.service';
import { BearerGuard } from './auth/bearer.guard';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    AppService,
    DatabaseService,
    AssignmentsService,
    AuthService,
    BearerGuard,
  ],
})
export class AppModule {}
