import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountsService, type Account } from './accounts.service';
import {
  AuthService,
  LoginRateLimitException,
  type SessionView,
} from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginAccountDto } from './dto/login-account.dto';
import { OriginGuard } from './origin.guard';

@Controller('api/v1/auth')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly csrf: CsrfService,
    private readonly auth: AuthService,
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

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, CsrfGuard)
  async login(
    @Body() body: LoginAccountDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionView> {
    try {
      const session = await this.auth.login(
        body.email,
        body.password,
        request,
        response,
      );
      this.csrf.issueToken(request, response);
      return session;
    } catch (error) {
      if (error instanceof LoginRateLimitException) {
        response.setHeader('Retry-After', String(error.retryAfter));
      }
      throw error;
    }
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  getSession(@Req() request: Request): Promise<SessionView> {
    return this.auth.getSession(request);
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, CsrfGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request, response);
    this.csrf.issueToken(request, response);
  }
}
