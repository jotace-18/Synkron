import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

export class SyncRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

@Injectable()
export class SyncClientService {
  async assertDefinition(
    tenantId: string,
    definitionId: string,
  ): Promise<void> {
    const baseUrl = process.env.SYNC_INTERNAL_URL;
    const token = process.env.AUTOMATION_SYNC_SERVICE_TOKEN;

    if (!baseUrl || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ServiceUnavailableException(
        'No se pudo comprobar la definición de Sync',
      );
    }

    try {
      const url = new URL(
        `/internal/automation/sync-definitions/${encodeURIComponent(definitionId)}`,
        baseUrl,
      );

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Dirección inválida');
      }

      url.searchParams.set('tenant_id', tenantId);

      const response = await fetch(url, {
        headers: {
          'X-Synkron-Service-Token': token,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 404) {
        throw new NotFoundException('Definición no encontrada');
      }

      if (response.status !== 200) {
        throw new Error('Respuesta inesperada');
      }

      const body: unknown = await response.json();

      if (
        typeof body !== 'object' ||
        body === null ||
        !('id' in body) ||
        typeof body.id !== 'string' ||
        body.id.toLowerCase() !== definitionId.toLowerCase() ||
        !('enabled' in body) ||
        typeof body.enabled !== 'boolean'
      ) {
        throw new Error('Respuesta inválida');
      }

      if (!body.enabled) {
        throw new ConflictException('La definición está deshabilitada');
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'No se pudo comprobar la definición de Sync',
      );
    }
  }

  async requestRun(
    tenantId: string,
    definitionId: string,
    requestId: string,
  ): Promise<string> {
    const baseUrl = process.env.SYNC_INTERNAL_URL;
    const token = process.env.AUTOMATION_SYNC_SERVICE_TOKEN;

    if (!baseUrl || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new SyncRequestError(
        'invalid_configuration',
        true,
        'La comunicación con Sync no está configurada',
      );
    }

    let url: URL;

    try {
      url = new URL(
        `/internal/automation/sync-definitions/${encodeURIComponent(definitionId)}/runs`,
        baseUrl,
      );

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Dirección inválida');
      }
    } catch {
      throw new SyncRequestError(
        'invalid_configuration',
        true,
        'La dirección interna de Sync no es válida',
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
          'Idempotency-Key': `automation:${requestId.toLowerCase()}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      if ([400, 404, 409, 422].includes(response.status)) {
        throw new SyncRequestError(
          'request_rejected',
          false,
          'Sync rechazó la solicitud de sincronización',
        );
      }

      if (response.status !== 202) {
        throw new SyncRequestError(
          'sync_unavailable',
          true,
          'Sync no pudo aceptar la solicitud',
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
        throw new SyncRequestError(
          'invalid_response',
          true,
          'No se pudo confirmar la aceptación de Sync',
        );
      }

      return body.id;
    } catch (error) {
      if (error instanceof SyncRequestError) {
        throw error;
      }

      throw new SyncRequestError(
        'sync_unavailable',
        true,
        'No se pudo confirmar la aceptación de Sync',
      );
    }
  }
}
