import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { SourceIdentityService } from './source-identity.service';
export class SourceLoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
export class SourceRegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
export class ConnectionTokenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
@Controller('api/v1/auth')
export class SourceIdentityController {
  constructor(private readonly identity: SourceIdentityService) {}
  @Header('Cache-Control', 'no-store')
  @Get('csrf')
  csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.identity.issueCsrf(request, response);
  }
  @Header('Cache-Control', 'no-store')
  @Post('register')
  async register(@Req() request: Request, @Body() body: SourceRegisterDto) {
    this.identity.checkWrite(request);
    return this.identity.register(body.email, body.password, request);
  }
  @Header('Cache-Control', 'no-store')
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Body() body: SourceLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.identity.checkWrite(request);
    return this.identity.login(body.email, body.password, request, response);
  }
  @Header('Cache-Control', 'no-store')
  @Get('session')
  session(@Req() request: Request) {
    return this.identity.session(request);
  }
  @Header('Cache-Control', 'no-store')
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.identity.checkWrite(request);
    await this.identity.logout(request, response);
  }
  @Header('Cache-Control', 'no-store')
  @Get('tokens')
  async tokens(@Req() request: Request) {
    return this.identity.listTokens((await this.identity.session(request)).id);
  }
  @Header('Cache-Control', 'no-store')
  @Post('tokens')
  async createToken(@Req() request: Request, @Body() body: ConnectionTokenDto) {
    this.identity.checkWrite(request);
    return this.identity.createToken(
      (await this.identity.session(request)).id,
      body.name,
    );
  }
  @Header('Cache-Control', 'no-store')
  @Delete('tokens/:id')
  @HttpCode(204)
  async revoke(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    this.identity.checkWrite(request);
    await this.identity.revokeToken(
      (await this.identity.session(request)).id,
      id,
    );
  }
}
