import { CanonicalActivitiesController } from './gym/canonical-activities.controller';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { BearerGuard } from './auth/bearer.guard';
import { DatabaseService } from './database/database.service';
import { GymController } from './gym/gym.controller';
import { GymService } from './gym/gym.service';

@Module({
  controllers: [AppController, GymController, CanonicalActivitiesController],
  providers: [
    AppService,
    DatabaseService,
    AuthService,
    BearerGuard,
    GymService,
  ],
})
export class AppModule {}
