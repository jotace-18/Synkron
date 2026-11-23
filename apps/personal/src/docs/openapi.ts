import type { OpenAPIObject } from '@nestjs/swagger';
import { EVENT_STATUSES } from '../events/event.types';
import {
  array,
  day,
  errorSchema,
  id,
  instant,
  nullable,
  object,
  operation,
  pagination,
  ref,
  text,
  timestamps,
  uuid,
  values,
} from './openapi-support';
export function buildPersonalOpenApi(): OpenAPIObject {
  const fields = {
    title: {
      ...text(200),
      description: 'Asunto obligatorio. Se eliminan espacios exteriores.',
    },
    on_date: {
      ...nullable(day),
      description: 'Día sin hora. Excluyente con started_at.',
    },
    started_at: {
      ...nullable(instant),
      description:
        'Inicio con zona explícita; se normaliza a UTC. Máximo tres decimales de segundo. Excluyente con on_date.',
    },
    duration_minutes: {
      type: 'integer' as const,
      minimum: 1,
      maximum: 2_147_483_647,
      nullable: true,
      description:
        'Opcional. Requiere started_at; null significa actividad puntual. El final calculado debe quedar entre los años 1 y 9999.',
    },
    people: {
      ...array(text(100)),
      maxItems: 50,
      default: [],
      description:
        'Nombres opcionales, sin cuentas ni invitaciones. Se recortan los espacios exteriores. No se admiten nombres vacíos ni null.',
    },
    status: {
      ...values(EVENT_STATUSES),
      default: 'pending',
      description: 'No cambia automáticamente por el paso del tiempo.',
    },
  };
  const scheduleVariants = ['date', 'instant', 'interval'].map((kind) =>
    object({
      kind: values([kind]),
      role: values(['start']),
      date:
        kind === 'date'
          ? day
          : { type: 'string' as const, nullable: true, enum: [null] },
      at:
        kind === 'date'
          ? { type: 'string' as const, nullable: true, enum: [null] }
          : instant,
      end_at:
        kind === 'interval'
          ? instant
          : { type: 'string' as const, nullable: true, enum: [null] },
    }),
  );
  return {
    openapi: '3.0.4',
    info: {
      title: 'Otros · Personal (fuente externa)',
      version: '1.0.0',
      description:
        'Recados, citas y quedadas. Cada cuenta utiliza su PersonalBearer, independiente de SportBearer, AcademicBearer, la sesión Synkron y los tokens de ingesta. La fuente ofrece el contrato canónico personal.event, admitido por el lector estándar de Sync tras aplicar la migración 015. Conocer el día es obligatorio: on_date para día sin hora o started_at para un instante con zona. No se guarda un día redundante junto al instante.',
    },
    servers: [
      { url: '/personal', description: 'Fuente personal por el gateway HTTPS' },
    ],
    security: [{ PersonalBearer: [] }],
    components: {
      securitySchemes: {
        PersonalBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: '64 caracteres hexadecimales',
          description:
            'Token propio de la cuenta personal, sin el prefijo Bearer.',
        },
      },
      schemas: {
        Error: errorSchema,
        CreateEvent: {
          ...object(fields, ['title']),
          oneOf: [
            {
              required: ['on_date'],
              properties: {
                on_date: day,
                started_at: { type: 'string', nullable: true, enum: [null] },
                duration_minutes: {
                  type: 'integer',
                  nullable: true,
                  enum: [null],
                },
              },
            },
            {
              required: ['started_at'],
              properties: {
                on_date: { type: 'string', nullable: true, enum: [null] },
                started_at: instant,
              },
            },
          ],
          description:
            'Debe proporcionarse exactamente una referencia temporal: on_date o started_at. Las demás propiedades temporales omitidas se inicializan a null; people a []; status a pending. Solo admite los campos documentados.',
        },
        UpdateEvent: {
          ...object(
            {
              ...fields,
              people: {
                ...array(text(100)),
                maxItems: 50,
                description: fields.people.description,
              },
              status: {
                ...values(EVENT_STATUSES),
                description: fields.status.description,
              },
            },
            [],
          ),
          minProperties: 1,
          description:
            'PATCH parcial y atómico. Se conserva lo omitido. on_date, started_at y duration_minutes admiten null para borrar. Para cambiar de forma temporal, borra explícitamente la anterior; por ejemplo {on_date:null,started_at:"2026-11-25T10:00:00+01:00"}. Vaciar la hora exige además duration_minutes:null si existía duración. title, people y status no admiten null. Un PATCH sin cambios conserva updated_at.',
        },
        Event: object({
          ...fields,
          id: uuid,
          end_at: {
            ...nullable(instant),
            description: 'Final calculado; null si no existe intervalo.',
          },
          ...timestamps,
          deleted_at: nullable(instant),
        }),
        CanonicalEventUpsert: object({
          schema_version: { type: 'integer', enum: [1] },
          action: values(['upsert']),
          external_id: {
            ...text(256),
            description: 'events:<id>, estable y sensible a mayúsculas.',
          },
          source_updated_at: instant,
          activity: object({
            type: values(['personal.event']),
            title: text(200),
            schedule: { oneOf: scheduleVariants },
            status: values(EVENT_STATUSES),
            details: object({ people: fields.people }),
          }),
        }),
        CanonicalRetirement: object({
          schema_version: { type: 'integer', enum: [1] },
          action: values(['retire']),
          external_id: text(256),
          source_updated_at: instant,
          source_deleted_at: instant,
        }),
      },
    },
    paths: {
      '/api/v1/events': {
        get: operation(
          'Compromisos personales',
          'Listar compromisos activos propios',
          200,
          array(ref('Event')),
          { parameters: pagination },
        ),
        post: operation(
          'Compromisos personales',
          'Crear un compromiso personal',
          201,
          ref('Event'),
          {
            body: ref('CreateEvent'),
            example: {
              title: 'Ir a comprar',
              on_date: '2026-11-25',
              people: [],
              status: 'pending',
            },
          },
        ),
      },
      '/api/v1/events/export': {
        get: operation(
          'Compromisos personales',
          'Consultar compromisos propios incluidas las retiradas',
          200,
          array(ref('Event')),
          {
            parameters: pagination,
            description:
              'Exportación de origen para conciliación. No infiere retiradas por ausencia ni mezcla cuentas.',
          },
        ),
      },
      '/api/v1/events/{id}': {
        get: operation(
          'Compromisos personales',
          'Consultar un compromiso activo',
          200,
          ref('Event'),
          { parameters: [id], errors: [401, 404, 422, 500] },
        ),
        patch: operation(
          'Compromisos personales',
          'Editar, completar o cancelar un compromiso',
          200,
          ref('Event'),
          {
            parameters: [id],
            body: ref('UpdateEvent'),
            example: {
              on_date: null,
              started_at: '2026-11-25T10:00:00+01:00',
              duration_minutes: 30,
              people: ['Ana'],
            },
            errors: [401, 404, 422, 500],
          },
        ),
        delete: operation(
          'Compromisos personales',
          'Retirar un compromiso conservando la identidad',
          204,
          undefined,
          {
            parameters: [id],
            errors: [401, 404, 422, 500],
            description:
              'Borrado lógico e idempotente, distinto de cancelar. Desaparece de las consultas normales y permanece en las exportaciones.',
          },
        ),
      },
      '/api/v1/activities/export': {
        get: operation(
          'Integración estándar',
          'Exportar operaciones canónicas propias',
          200,
          array({
            oneOf: [ref('CanonicalEventUpsert'), ref('CanonicalRetirement')],
          }),
          {
            parameters: pagination,
            description:
              'Array paginado limit/offset, orden estable created_at DESC e id DESC; incluye retiradas explícitas. external_id=events:<id>; colección lógica activities. El día se exporta sin hora inventada; el intervalo tiene final calculado. Sync admite este contrato mediante standard.activities con la migración 015 aplicada.',
          },
        ),
      },
    },
  };
}
