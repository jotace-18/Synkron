import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AccountsService } from './accounts/accounts.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DatabaseService, AccountsService],
})
export class AppModule {}
