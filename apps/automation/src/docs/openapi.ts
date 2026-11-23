import type { OpenAPIObject } from '@nestjs/swagger';
import { RULE_EVENT_TYPES } from '../rules/rule.types';
import { REMINDER_LEAD_MINUTES } from '../reminders/reminder.types';
import {
  array,
  boolean,
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
  timestamps,
  uuid,
  values,
  write,
} from './openapi-support';

export function buildAutomationOpenApi(): OpenAPIObject {
  const condition = {
    oneOf: [
      object({
        field: values(['payload.change_type']),
        operator: values(['==']),
        value: values(['created', 'updated', 'retired']),
      }),
      object({
        field: values([
          'payload.definition_id',
          'payload.source_connection_id',
        ]),
        operator: values(['==']),
        value: uuid,
      }),
      object({
        field: values(['payload.activity_type']),
        operator: values(['==']),
        value: { ...text(200), pattern: '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$' },
      }),
      object({
        field: values(['payload.error.code']),
        operator: values(['==']),
        value: { ...text(200), pattern: '^[a-z][a-z0-9_]*$' },
      }),
      object({
        field: values(['payload.changed_fields']),
        operator: values(['contains']),
        value: { ...text(200), pattern: '^[a-z][a-z0-9_]*$' },
      }),
    ],
  };
  const ruleInput = {
    name: text(150),
    enabled: { ...boolean, default: true },
    trigger: object({ event_type: values(RULE_EVENT_TYPES) }),
    condition: object({
      mode: values(['all', 'any']),
      conditions: { ...array(condition), maxItems: 10 },
    }),
    actions: {
      ...array({
        oneOf: [
          object({ type: values(['notify']), message: text(500) }),
          object({ type: values(['start_sync']), definition_id: uuid }),
        ],
      }),
      minItems: 1,
      maxItems: 5,
    },
  };
  const scheduleInput = {
    name: text(150),
    definition_id: uuid,
    enabled: { ...boolean, default: true },
    schedule_kind: values(['interval', 'daily']),
    interval_minutes: { ...values([15, 30, 60, null]), default: null },
    daily_time: {
      ...nullable(text()),
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      default: null,
    },
  };
  const scheduleDescription =
    'Horario Europe/Madrid. interval requiere interval_minutes=15,30 o 60 y daily_time=null; daily requiere daily_time HH:mm e interval_minutes=null. PUT reemplaza la configuración. La definición debe pertenecer a la cuenta y ser una sincronización de lectura.';
  const scheduleExample = {
    name: 'Revisar entregas cada hora',
    definition_id: '11111111-1111-4111-8111-111111111111',
    enabled: false,
    schedule_kind: 'interval',
    interval_minutes: 60,
    daily_time: null,
  };
  const ruleExample = {
    name: 'Avisar al terminar una sincronización',
    enabled: false,
    trigger: { event_type: 'sync.completed' },
    condition: { mode: 'all', conditions: [] },
    actions: [{ type: 'notify', message: 'La sincronización ha terminado.' }],
  };
  const settings = object({
    enabled: boolean,
    lead_minutes: values(REMINDER_LEAD_MINUTES),
  });
  const schemas: NonNullable<OpenAPIObject['components']>['schemas'] = {
    Error: errorSchema,
    ScheduleInput: {
      ...object(scheduleInput, ['name', 'definition_id', 'schedule_kind']),
      description: scheduleDescription,
      oneOf: [
        {
          properties: {
            schedule_kind: values(['interval']),
            interval_minutes: values([15, 30, 60]),
            daily_time: { type: 'string', nullable: true, enum: [null] },
          },
          required: ['interval_minutes'],
        },
        {
          properties: {
            schedule_kind: values(['daily']),
            interval_minutes: { type: 'integer', nullable: true, enum: [null] },
            daily_time: text(),
          },
          required: ['daily_time'],
        },
      ],
    },
    Schedule: object({
      ...scheduleInput,
      timezone: values(['Europe/Madrid']),
      id: uuid,
      next_run_at: nullable(instant),
      ...timestamps,
    }),
    RuleInput: object(ruleInput, ['name', 'trigger', 'condition', 'actions']),
    Rule: object({
      ...ruleInput,
      id: uuid,
      revision: { type: 'integer', minimum: 1 },
      ...timestamps,
    }),
    ReminderSettingsInput: settings,
    ReminderSettings: object({
      ...settings.properties,
      id: uuid,
      ...timestamps,
    }),
    HistoryEntry: object({
      id: uuid,
      kind: values(['schedule', 'rule', 'reminder']),
      name: text(),
      action_type: values(['notify', 'start_sync']),
      status: values(['pending', 'accepted', 'failed', 'blocked', 'cancelled']),
      created_at: instant,
      resolved_at: nullable(instant),
      next_attempt_at: nullable(instant),
      attempt_count: integer,
      error_code: nullable(text()),
      error_message: nullable(text()),
      result_id: nullable(uuid),
      sync_run_id: nullable(uuid),
      activity_id: nullable(uuid),
    }),
  };
  const reads = { parameters: pagination };
  const writing = {
    security: write,
    errors: [401, 403, 404, 409, 422, 500, 503],
  };
  return {
    openapi: '3.0.4',
    info: {
      title: 'Synkron · Automation',
      version: '1.0.0',
      description:
        'Programaciones, reglas, recordatorios e historial de la cuenta. Utiliza la sesión de Synkron; Swagger obtiene CSRF antes de cada escritura. Una acción accepted confirma recepción de su solicitud, no el resultado final de la sincronización. Las entregas sin hora se recuerdan a las 09:00 de Madrid del día anterior.',
    },
    servers: [{ url: '/' }],
    security: session,
    components: { schemas, securitySchemes },
    paths: {
      '/api/v1/automation/schedules': {
        get: operation(
          'Programaciones',
          'Listar programaciones',
          200,
          array(ref('Schedule')),
          reads,
        ),
        post: operation(
          'Programaciones',
          'Crear una programación',
          201,
          ref('Schedule'),
          {
            ...writing,
            body: ref('ScheduleInput'),
            example: scheduleExample,
            description: scheduleDescription,
          },
        ),
      },
      '/api/v1/automation/schedules/{id}': {
        get: operation(
          'Programaciones',
          'Consultar una programación',
          200,
          ref('Schedule'),
          { parameters: [id], errors: [401, 404, 422, 500] },
        ),
        put: operation(
          'Programaciones',
          'Reemplazar o pausar una programación',
          200,
          ref('Schedule'),
          {
            ...writing,
            parameters: [id],
            body: ref('ScheduleInput'),
            example: scheduleExample,
            description: scheduleDescription,
          },
        ),
      },
      '/api/v1/automation/rules': {
        get: operation(
          'Reglas',
          'Listar reglas',
          200,
          array(ref('Rule')),
          reads,
        ),
        post: operation('Reglas', 'Crear una regla', 201, ref('Rule'), {
          ...writing,
          body: ref('RuleInput'),
          example: ruleExample,
          description:
            'Hasta 10 condiciones y entre 1 y 5 acciones. Un grupo vacío all coincide con cualquier evento del tipo elegido. El ejemplo se crea pausado.',
        }),
      },
      '/api/v1/automation/rules/{id}': {
        get: operation('Reglas', 'Consultar una regla', 200, ref('Rule'), {
          parameters: [id],
          errors: [401, 404, 422, 500],
        }),
        put: operation(
          'Reglas',
          'Reemplazar o pausar una regla',
          200,
          ref('Rule'),
          {
            ...writing,
            parameters: [id],
            body: ref('RuleInput'),
            example: ruleExample,
            description:
              'Reemplaza la configuración completa y actualiza su revisión cuando cambia. No es un PATCH.',
          },
        ),
      },
      '/api/v1/automation/reminders/settings': {
        get: operation(
          'Recordatorios',
          'Consultar ajustes de recordatorios',
          200,
          object({ settings: { ...schemas.ReminderSettings, nullable: true } }),
        ),
        put: operation(
          'Recordatorios',
          'Guardar ajustes de recordatorios',
          200,
          ref('ReminderSettings'),
          {
            ...writing,
            body: ref('ReminderSettingsInput'),
            example: { enabled: true, lead_minutes: 1440 },
          },
        ),
      },
      '/api/v1/automation/history': {
        get: operation(
          'Historial',
          'Consultar acciones y recordatorios',
          200,
          array(ref('HistoryEntry')),
          {
            parameters: [
              ...pagination,
              query('kind', values(['schedule', 'rule', 'reminder'])),
              query(
                'status',
                values([
                  'pending',
                  'accepted',
                  'failed',
                  'blocked',
                  'cancelled',
                ]),
              ),
            ],
          },
        ),
      },
    },
  };
}
