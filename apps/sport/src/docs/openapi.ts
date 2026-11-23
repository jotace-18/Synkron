import type { OpenAPIObject } from '@nestjs/swagger';
import { TRAINING_MODES, GYM_STATUSES } from '../gym/gym.types';
import {
  array,
  boolean,
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

export function buildSportOpenApi(): OpenAPIObject {
  const fields = {
    started_at: {
      ...instant,
      description:
        'Inicio obligatorio con zona explícita; por ejemplo 2026-11-24T18:00:00+01:00. Se devuelve normalizado a UTC. Máximo tres decimales de segundo.',
    },
    duration_minutes: {
      type: 'integer',
      minimum: 1,
      maximum: 2_147_483_647,
      description:
        'Minutos enteros positivos. El final calculado debe permanecer entre los años 1 y 9999.',
    },
    training_mode: values(TRAINING_MODES),
    accompanied: boolean,
    status: { ...values(GYM_STATUSES), default: 'scheduled' },
  };
  const session = object({
    ...fields,
    id: uuid,
    title: {
      ...text(),
      description:
        'Generado: Gimnasio · Push, Pull, Leg, Upper, Lower u Otros.',
    },
    end_at: instant,
    ...timestamps,
    deleted_at: nullable(instant),
  });
  const example = {
    started_at: '2026-11-24T18:00:00+01:00',
    duration_minutes: 60,
    training_mode: 'push',
    accompanied: false,
    status: 'scheduled',
  };
  return {
    openapi: '3.0.4',
    info: {
      title: 'Deporte · Sport (fuente externa)',
      version: '1.0.0',
      description:
        'Registro deportivo de origen, independiente de la colección de Synkron. SportBearer es la credencial de la cuenta deportiva, distinta de AcademicBearer, de la sesión de Synkron y de IngestionToken. Las sesiones pueden ser futuras o pasadas. El título y el final se calculan; no se envían. Sync puede consultar /api/v1/activities/export con el conector estándar standard.activities. La conexión se configura por cuenta en Synkron; Sport no envía cambios automáticamente.',
    },
    servers: [
      {
        url: '/sport',
        description: 'Fuente deportiva a través del gateway HTTPS',
      },
    ],
    security: [{ SportBearer: [] }],
    components: {
      securitySchemes: {
        SportBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: '64 caracteres hexadecimales',
          description:
            'Credencial deportiva; introducir solo el token, sin Bearer.',
        },
      },
      schemas: {
        CanonicalGymUpsert: object({
          schema_version: { type: 'integer', enum: [1] },
          action: values(['upsert']),
          external_id: {
            ...text(256),
            description: 'gym_sessions:<id>, estable y sensible a mayúsculas.',
          },
          source_updated_at: instant,
          activity: object({
            type: values(['sport.gym']),
            title: text(200),
            status: values(GYM_STATUSES),
            schedule: object({
              kind: values(['interval']),
              role: values(['start']),
              date: { type: 'string', nullable: true, enum: [null] },
              at: instant,
              end_at: instant,
            }),
            details: object({
              training_mode: values(TRAINING_MODES),
              accompanied: boolean,
            }),
          }),
        }),
        CanonicalRetirement: object({
          schema_version: { type: 'integer', enum: [1] },
          action: values(['retire']),
          external_id: text(256),
          source_updated_at: instant,
          source_deleted_at: instant,
        }),
        Error: errorSchema,
        CreateGymSession: object(fields, [
          'started_at',
          'duration_minutes',
          'training_mode',
          'accompanied',
        ]),
        UpdateGymSession: {
          ...object(fields, []),
          minProperties: 1,
          description:
            'Edición parcial. Se conserva lo omitido. Ningún campo admite null. No se aceptan title, end_at, account_id ni fechas técnicas.',
        },
        GymSession: session,
      },
    },
    paths: {
      '/api/v1/activities/export': {
        get: operation(
          'Integración estándar',
          'Exportar operaciones canónicas de las sesiones propias',
          200,
          array({
            oneOf: [ref('CanonicalGymUpsert'), ref('CanonicalRetirement')],
          }),
          {
            parameters: pagination,
            description:
              'Páginas limit/offset. Incluye retiradas explícitas. No mezcla cuentas. external_id=gym_sessions:<id>; colección activities. Consumir con standard.activities; no se infieren borrados por ausencia.',
          },
        ),
      },
      '/api/v1/gym-sessions': {
        get: operation(
          'Gimnasio',
          'Listar sesiones activas propias',
          200,
          array(ref('GymSession')),
          { parameters: pagination },
        ),
        post: operation(
          'Gimnasio',
          'Crear una sesión de gimnasio',
          201,
          ref('GymSession'),
          {
            body: ref('CreateGymSession'),
            example,
            description:
              'Fecha y hora se comunican juntas en started_at. accompanied=false significa solo; true, acompañado. other corresponde a Otros. El estado no cambia automáticamente con el paso del tiempo.',
          },
        ),
      },
      '/api/v1/gym-sessions/export': {
        get: operation(
          'Gimnasio',
          'Consultar sesiones propias incluidas las retiradas',
          200,
          array(ref('GymSession')),
          {
            parameters: pagination,
            description:
              'Exportación autenticada para conciliación. Incluye deleted_at; no envía datos a Sync ni permite consultar otras cuentas.',
          },
        ),
      },
      '/api/v1/gym-sessions/{id}': {
        get: operation(
          'Gimnasio',
          'Consultar una sesión activa',
          200,
          ref('GymSession'),
          { parameters: [id], errors: [401, 404, 422, 500] },
        ),
        patch: operation(
          'Gimnasio',
          'Editar o cancelar una sesión',
          200,
          ref('GymSession'),
          {
            parameters: [id],
            body: ref('UpdateGymSession'),
            example: {
              duration_minutes: 75,
              training_mode: 'upper',
              status: 'completed',
            },
            errors: [401, 404, 422, 500],
            description:
              'Mantiene el ID. Cambiar modalidad regenera el título; inicio o duración recalculan el final. Un PATCH sin cambios conserva updated_at. Cancelar conserva la sesión visible.',
          },
        ),
        delete: operation(
          'Gimnasio',
          'Retirar una sesión conservando su identidad',
          204,
          undefined,
          {
            parameters: [id],
            errors: [401, 404, 422, 500],
            description:
              'Borrado lógico e idempotente. Desaparece de las consultas normales, pero permanece en export. No equivale a status=cancelled.',
          },
        ),
      },
    },
  };
}
