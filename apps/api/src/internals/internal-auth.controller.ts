import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../accounts/auth.service';
import { SyncServiceGuard } from './sync-service.guard';

@Controller('internal/auth')
@UseGuards(SyncServiceGuard)
export class InternalAuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async getSession(
    @Req() request: Request,
  ): Promise<{ tenant_id: string; expires_at: Date }> {
    const session = await this.auth.getSession(request);

    return {
      tenant_id: session.user.id,
      expires_at: session.expires_at,
    };
  }
}
