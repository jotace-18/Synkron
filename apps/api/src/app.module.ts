import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AccountsService } from './accounts/accounts.service';
import { AccountsController } from './accounts/accounts.controller';
import { CsrfService } from './accounts/csrf.service';
import { AuthService } from './accounts/auth.service';

@Module({
  imports: [],
  controllers: [AppController, AccountsController],
  providers: [
    AppService,
    DatabaseService,
    AccountsService,
    CsrfService,
    AuthService,
  ],
})
export class AppModule {}
