import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SessionClientService } from './session-client.service';

export type AuthenticatedRequest = Request & {
  tenantId: string;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = await this.sessions.getSession(request.get('Cookie'));

    request.tenantId = session.tenant_id;

    return true;
  }
}
