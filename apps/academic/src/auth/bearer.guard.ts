import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

export type AuthenticatedRequest = Request & {
  accountId: string;
};

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer +([^\s]+)$/i.exec(authorization)
        : null;

    if (!match) {
      throw new UnauthorizedException('Credencial académica no válida');
    }

    request.accountId = await this.auth.authenticate(match[1]);

    return true;
  }
}
