import { Module } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { AuthService } from '../accounts/auth.service';
import { DatabaseService } from '../database/database.service';
import { InternalAuthController } from './internal-auth.controller';
import { SyncServiceGuard } from './sync-service.guard';

@Module({
  controllers: [InternalAuthController],
  providers: [DatabaseService, AccountsService, AuthService, SyncServiceGuard],
})
export class InternalAuthModule {}
