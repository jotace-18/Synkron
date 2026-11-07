import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountsService, type Account } from './accounts.service';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';
import { RegisterAccountDto } from './dto/register-account.dto';
import { OriginGuard } from './origin.guard';

@Controller('api/v1/auth')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  getCsrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { csrf_token: string } {
    return { csrf_token: this.csrf.issueToken(request, response) };
  }

  @Post('register')
  @UseGuards(OriginGuard, CsrfGuard)
  register(@Body() body: RegisterAccountDto): Promise<Account> {
    return this.accounts.register(body.email, body.password);
  }
}
