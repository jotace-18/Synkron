import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedOrigin = process.env.APP_ORIGIN;

    if (!expectedOrigin || request.get('origin') !== expectedOrigin) {
      throw new ForbiddenException('Origen no permitido');
    }

    return true;
  }
}
