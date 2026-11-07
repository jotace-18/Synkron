import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class SyncServiceGuard implements CanActivate {
  private readonly expectedToken: Buffer;

  constructor() {
    const token = process.env.SYNC_AUTH_SERVICE_TOKEN;

    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error(
        'SYNC_AUTH_SERVICE_TOKEN debe contener 64 caracteres hexadecimales',
      );
    }

    this.expectedToken = Buffer.from(token, 'hex');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.get('X-Synkron-Service-Token');

    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ForbiddenException('Servicio no autorizado');
    }

    if (!timingSafeEqual(Buffer.from(token, 'hex'), this.expectedToken)) {
      throw new ForbiddenException('Servicio no autorizado');
    }

    return true;
  }
}
