import {
  Injectable,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SourceIdentityService } from './source-identity.service';

export type AuthenticatedRequest = Request & {
  accountId: string;
};

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Optional() private readonly identity?: SourceIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer +([^\s]+)$/i.exec(authorization)
        : null;

    const write = !['GET', 'HEAD'].includes(request.method ?? 'GET');
    if (match) {
      request.accountId = await this.auth.authenticate(match[1], write);
    } else if (
      authorization === undefined &&
      this.identity &&
      !/\/export\/?$/i.test(request.path ?? '')
    ) {
      let account;
      try {
        account = await this.identity.session(request);
      } catch (error: unknown) {
        if (error instanceof UnauthorizedException) {
          throw new UnauthorizedException('Credencial académica no válida');
        }
        throw error;
      }
      if (write) this.identity.checkWrite(request);
      request.accountId = account.id;
    } else {
      throw new UnauthorizedException('Credencial académica no válida');
    }

    return true;
  }
}
