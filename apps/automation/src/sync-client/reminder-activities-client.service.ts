import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  ReminderActivitiesQuery,
  ReminderActivity,
} from './reminder-activity.types';
import { isReminderActivity } from './reminder-activity.validation';

export const REMINDER_ACTIVITIES_PAGE_SIZE = 50;

@Injectable()
export class ReminderActivitiesClientService {
  async list(
    tenantId: string,
    query: ReminderActivitiesQuery,
  ): Promise<ReminderActivity[]> {
    const body = await this.request('/internal/automation/activities', {
      tenant_id: tenantId,
      timezone: 'Europe/Madrid',
      from: query.from,
      to: query.to,
      limit: String(REMINDER_ACTIVITIES_PAGE_SIZE),
      offset: String(query.offset),
    });

    if (
      !Array.isArray(body) ||
      body.length > REMINDER_ACTIVITIES_PAGE_SIZE ||
      !body.every(isReminderActivity)
    ) {
      throw new ServiceUnavailableException(
        'Sync devolvió actividades no válidas',
      );
    }

    return body;
  }

  async get(
    tenantId: string,
    activityId: string,
  ): Promise<ReminderActivity | null> {
    const body = await this.request(
      `/internal/automation/activities/${encodeURIComponent(activityId)}`,
      { tenant_id: tenantId },
      true,
    );

    if (body === null) {
      return null;
    }

    if (
      !isReminderActivity(body) ||
      body.id.toLowerCase() !== activityId.toLowerCase()
    ) {
      throw new ServiceUnavailableException(
        'Sync devolvió una actividad no válida',
      );
    }

    return body;
  }

  private async request(
    path: string,
    parameters: Record<string, string>,
    allowMissing = false,
  ): Promise<unknown> {
    const baseUrl = process.env.SYNC_INTERNAL_URL;
    const token = process.env.AUTOMATION_SYNC_SERVICE_TOKEN;

    if (!baseUrl || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ServiceUnavailableException(
        'La comunicación con Sync no está configurada',
      );
    }

    try {
      const url = new URL(path, baseUrl);

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Dirección inválida');
      }

      url.search = new URLSearchParams(parameters).toString();

      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
        headers: {
          'X-Synkron-Service-Token': token,
        },
      });

      if (allowMissing && response.status === 404) {
        return null;
      }

      if (response.status !== 200) {
        throw new Error('Respuesta inesperada');
      }

      const body: unknown = await response.json();

      if (body === null) {
        throw new Error('Respuesta vacía');
      }

      return body;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudieron consultar las actividades de Sync',
      );
    }
  }
}
