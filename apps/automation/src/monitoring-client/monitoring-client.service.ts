import { Injectable } from '@nestjs/common';
import type { NotificationRequest } from './notification-request.types';

export class NotificationRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationRequestError';
  }
}

@Injectable()
export class MonitoringClientService {
  async createNotification(input: NotificationRequest): Promise<string> {
    const baseUrl = process.env.MONITORING_INTERNAL_URL;
    const token = process.env.AUTOMATION_MONITORING_SERVICE_TOKEN;

    if (!baseUrl || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new NotificationRequestError(
        'invalid_configuration',
        true,
        'La comunicación con Monitoring no está configurada',
      );
    }

    let url: URL;

    try {
      url = new URL('/internal/automation/notifications', baseUrl);

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Dirección inválida');
      }
    } catch {
      throw new NotificationRequestError(
        'invalid_configuration',
        true,
        'La dirección interna de Monitoring no es válida',
      );
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
        headers: {
          'Content-Type': 'application/json',
          'X-Synkron-Service-Token': token,
        },
        body: JSON.stringify(input),
      });

      if ([400, 404, 409, 422].includes(response.status)) {
        throw new NotificationRequestError(
          'notification_rejected',
          false,
          'Monitoring rechazó el aviso',
        );
      }

      if (![200, 201].includes(response.status)) {
        throw new NotificationRequestError(
          'monitoring_unavailable',
          true,
          'Monitoring no pudo aceptar el aviso',
        );
      }

      const body: unknown = await response.json();

      if (
        typeof body !== 'object' ||
        body === null ||
        !('id' in body) ||
        typeof body.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.id,
        )
      ) {
        throw new NotificationRequestError(
          'invalid_response',
          true,
          'No se pudo confirmar la recepción del aviso',
        );
      }

      return body.id;
    } catch (error) {
      if (error instanceof NotificationRequestError) {
        throw error;
      }

      throw new NotificationRequestError(
        'monitoring_unavailable',
        true,
        'No se pudo confirmar la recepción del aviso',
      );
    }
  }
}
