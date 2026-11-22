import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class AutomationServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.AUTOMATION_MONITORING_SERVICE_TOKEN;

    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new ServiceUnavailableException(
        'La comunicación con Automation no está configurada',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.get('X-Synkron-Service-Token');

    if (!received || !/^[a-f0-9]{64}$/.test(received)) {
      throw new ForbiddenException('Servicio no autorizado');
    }

    if (
      !timingSafeEqual(
        Buffer.from(received, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    ) {
      throw new ForbiddenException('Servicio no autorizado');
    }

    return true;
  }
}
