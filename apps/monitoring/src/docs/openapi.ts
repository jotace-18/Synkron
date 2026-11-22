import type { OpenAPIObject } from '@nestjs/swagger';
import {
  array,
  errorSchema,
  id,
  instant,
  integer,
  nullable,
  object,
  operation,
  pagination,
  query,
  ref,
  securitySchemes,
  session,
  text,
  uuid,
  values,
  write,
} from './openapi-support';

export function buildMonitoringOpenApi(): OpenAPIObject {
  const counts = object(
    Object.fromEntries(
      ['read', 'created', 'updated', 'unchanged', 'retired', 'ignored'].map(
        (key) => [key, integer],
      ),
    ),
  );
  const run = object({
    id: uuid,
    definition_id: uuid,
    status: values(['completed', 'failed']),
    occurred_at: instant,
    received_at: instant,
    counts,
    error: nullable(object({ code: text(), message: text() })),
  });
  const source = {
    oneOf: [
      object(
        {
          kind: values(['rule']),
          rule_id: uuid,
          event_id: uuid,
          sync_run_id: uuid,
          activity_id: uuid,
        },
        ['kind', 'rule_id', 'event_id', 'sync_run_id'],
      ),
      object({
        kind: values(['reminder']),
        reminder_id: uuid,
        activity_id: uuid,
        deadline_key: text(80),
      }),
    ],
  };
  const notification = object({
    id: uuid,
    message: text(500),
    source,
    created_at: instant,
    read_at: nullable(instant),
  });
  const schemas = {
    Error: errorSchema,
    Run: run,
    Summary: object({
      from: instant,
      to: instant,
      completed_runs: integer,
      failed_runs: integer,
      changes: object({ created: integer, updated: integer, retired: integer }),
      last_run: nullable(run),
    }),
    Change: object({
      sync_run_id: uuid,
      activity_id: uuid,
      source_connection_id: uuid,
      source_collection: text(),
      activity_type: text(),
      external_id: text(),
      change_type: values(['created', 'updated', 'retired']),
      changed_fields: array(text()),
      event_id: uuid,
      occurred_at: instant,
      received_at: instant,
    }),
    RunDetail: object({
      run: ref('Run'),
      changes: array(ref('Change')),
      next_changes_offset: nullable(integer),
    }),
    Notification: notification,
  };
  return {
    openapi: '3.0.4',
    info: {
      title: 'Synkron · Monitoring',
      version: '1.0.0',
      description:
        'Resultados de sincronizaciones, cambios y bandeja de avisos de la cuenta. Usa la sesión del navegador. Los eventos se procesan de forma asíncrona: una ejecución reciente puede tardar unos segundos en aparecer. El resumen cubre las últimas 24 horas.',
    },
    servers: [{ url: '/' }],
    security: session,
    components: { securitySchemes, schemas },
    paths: {
      '/api/v1/monitoring/summary': {
        get: operation(
          'Seguimiento',
          'Consultar el resumen de las últimas 24 horas',
          200,
          ref('Summary'),
        ),
      },
      '/api/v1/monitoring/runs': {
        get: operation(
          'Seguimiento',
          'Listar resultados de sincronización',
          200,
          array(ref('Run')),
          {
            parameters: [
              ...pagination,
              query('status', values(['completed', 'failed'])),
            ],
          },
        ),
      },
      '/api/v1/monitoring/runs/{id}': {
        get: operation(
          'Seguimiento',
          'Consultar un resultado y sus cambios',
          200,
          ref('RunDetail'),
          {
            parameters: [id, ...pagination],
            errors: [401, 404, 422, 500],
            description:
              'limit y offset paginan los cambios de esta ejecución, no la lista de ejecuciones. next_changes_offset es null cuando no hay otra página.',
          },
        ),
      },
      '/api/v1/notifications': {
        get: operation(
          'Avisos',
          'Listar avisos',
          200,
          array(ref('Notification')),
          {
            parameters: [
              ...pagination,
              query('status', values(['unread', 'read'])),
            ],
          },
        ),
      },
      '/api/v1/notifications/unread-count': {
        get: operation(
          'Avisos',
          'Contar avisos sin leer',
          200,
          object({ unread: integer }),
        ),
      },
      '/api/v1/notifications/{id}/read': {
        patch: operation(
          'Avisos',
          'Marcar un aviso como leído',
          200,
          ref('Notification'),
          {
            security: write,
            parameters: [id],
            body: object({}),
            example: {},
            errors: [401, 403, 404, 422, 500],
            description:
              'Operación idempotente. El cuerpo debe ser exactamente {}. Swagger obtiene CSRF automáticamente.',
          },
        ),
      },
    },
  };
}
