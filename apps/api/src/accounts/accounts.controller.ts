import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccountsService, type Account } from './accounts.service';
import { RegisterAccountDto } from './dto/register-account.dto';
import { OriginGuard } from './origin.guard';

@Controller('api/v1/auth')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('register')
  @UseGuards(OriginGuard)
  register(@Body() body: RegisterAccountDto): Promise<Account> {
    return this.accounts.register(body.email, body.password);
  }
}
