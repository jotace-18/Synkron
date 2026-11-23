import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { BearerGuard } from './auth/bearer.guard';
import { DatabaseService } from './database/database.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { CanonicalActivitiesController } from './events/canonical-activities.controller';
@Module({
  controllers: [AppController, EventsController, CanonicalActivitiesController],
  providers: [
    AppService,
    DatabaseService,
    AuthService,
    BearerGuard,
    EventsService,
  ],
})
export class AppModule {}
