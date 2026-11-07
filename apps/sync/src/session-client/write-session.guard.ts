import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionClientService } from './session-client.service';
import type { AuthenticatedRequest } from './session.guard';

@Injectable()
export class WriteSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = await this.sessions.authorizeWrite(
      request.get('Cookie'),
      request.get('Origin'),
      request.get('X-CSRF-Token'),
    );

    request.tenantId = session.tenant_id;

    return true;
  }
}
