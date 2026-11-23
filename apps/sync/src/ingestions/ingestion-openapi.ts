import { PERSONAL_STATUSES } from '../activities/personal/personal-details.validator';
import { getEnabledActivityTypes } from '../activities/activity-schema';
import {
  GYM_STATUSES,
  TRAINING_MODES,
} from '../activities/sport/gym-details.validator';
import type {
  OpenAPIObject,
  SchemaObject,
  ReferenceObject,
  PathsObject,
  ParameterObject,
  ResponseObject,
  RequestBodyObject,
  SecurityRequirementObject,
} from '@nestjs/swagger';
import {
  ASSIGNMENT_STATUSES,
  EXAM_STATUSES,
} from '../activities/academic/academic-details.rules';
const ref = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
const text = (maxLength: number): SchemaObject => ({
  type: 'string',
  minLength: 1,
  maxLength,
});
const timestamp: SchemaObject = {
  type: 'string',
  format: 'date-time',
  description: 'Instante con Z o desplazamiento explícito; se normaliza a UTC.',
};
const nullableText = (maxLength: number): SchemaObject => ({
  ...text(maxLength),
  nullable: true,
});
const empty: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};
function object(
  properties: Record<string, SchemaObject | ReferenceObject>,
): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
export const ingestionExample = {
  schema_version: 1,
  action: 'upsert',
  external_id: 'external-exam-001',
  source_updated_at: null,
  activity: {
    type: 'academic.exam',
    title: 'Examen desde una fuente externa',
    schedule: {
      kind: 'date',
      role: 'start',
      date: '2026-12-02',
      at: null,
      end_at: null,
    },
    status: 'scheduled',
    details: {
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      topics: 'Temas 1 y 2',
      section: 'theory',
      weight_percent: null,
      weight_basis: null,
      grade: null,
    },
  },
};
export function buildIngestionOpenApi(): OpenAPIObject {
  const none: SchemaObject = { type: 'string', nullable: true, enum: [null] };
  const date = (role: string) =>
    object({
      kind: { type: 'string', enum: ['date'] },
      role: { type: 'string', enum: [role] },
      date: {
        type: 'string',
        format: 'date',
        pattern: '^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$',
      },
      at: none,
      end_at: none,
    });
  const instant = (role: string) =>
    object({
      kind: { type: 'string', enum: ['instant'] },
      role: { type: 'string', enum: [role] },
      date: none,
      at: timestamp,
      end_at: none,
    });
  const academic: Record<string, SchemaObject> = {
    course_name: text(150),
    course_abbreviation: nullableText(20),
    weight_percent: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      nullable: true,
    },
    weight_basis: {
      type: 'string',
      enum: ['course', 'section', null],
      nullable: true,
    },
    grade: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      multipleOf: 0.01,
      nullable: true,
    },
  };
  const request = (
    type: string,
    role: string,
    statuses: readonly string[],
    details: SchemaObject,
    schedule: SchemaObject = { oneOf: [date(role), instant(role)] },
  ) =>
    object({
      schema_version: { type: 'integer', enum: [1] },
      action: { type: 'string', enum: ['upsert'] },
      external_id: text(256),
      source_updated_at: { ...timestamp, nullable: true },
      activity: object({
        type: { type: 'string', enum: [type] },
        title: text(200),
        schedule,
        status: { type: 'string', enum: [...statuses] },
        details,
      }),
    });
  const schemas: Record<string, SchemaObject | ReferenceObject> = {
    PersonalUpsert: request(
      'personal.event',
      'start',
      PERSONAL_STATUSES,
      object({
        people: {
          type: 'array',
          maxItems: 50,
          items: {
            ...text(100),
            description:
              'Nombre no vacío, sin espacios exteriores. Lista vacía si no se indican personas.',
          },
        },
      }),
      {
        oneOf: [
          date('start'),
          instant('start'),
          {
            ...object({
              kind: { type: 'string', enum: ['interval'] },
              role: { type: 'string', enum: ['start'] },
              date: none,
              at: timestamp,
              end_at: timestamp,
            }),
            description:
              'Duración positiva en minutos enteros, máximo 2147483647. No se envía otra duración en details.',
          },
        ],
      },
    ),
    GymUpsert: request(
      'sport.gym',
      'start',
      GYM_STATUSES,
      object({
        training_mode: { type: 'string', enum: [...TRAINING_MODES] },
        accompanied: { type: 'boolean' },
      }),
      {
        ...object({
          kind: { type: 'string', enum: ['interval'] },
          role: { type: 'string', enum: ['start'] },
          date: none,
          at: timestamp,
          end_at: timestamp,
        }),
        description:
          'Intervalo de duración positiva en minutos enteros (máximo 2147483647). Inicio y final entre los años 1 y 9999.',
      },
    ),
    ExamUpsert: request(
      'academic.exam',
      'start',
      EXAM_STATUSES,
      object({
        ...academic,
        section: { type: 'string', enum: ['theory', 'practice'] },
        topics: nullableText(1000),
      }),
    ),
    AssignmentUpsert: request(
      'academic.assignment',
      'deadline',
      ASSIGNMENT_STATUSES,
      object({
        ...academic,
        section: { type: 'string', enum: ['theory', 'practice', 'seminar'] },
        mandatory: { type: 'boolean' },
        work_mode: { type: 'string', enum: ['individual', 'group'] },
        group_members: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      }),
    ),
    Retirement: object({
      schema_version: { type: 'integer', enum: [1] },
      action: { type: 'string', enum: ['retire'] },
      external_id: text(256),
      source_updated_at: { ...timestamp, nullable: true },
      source_deleted_at: timestamp,
    }),
    IngestionRequest: {
      oneOf: [
        ref('ExamUpsert'),
        ref('AssignmentUpsert'),
        ref('GymUpsert'),
        ref('PersonalUpsert'),
        ref('Retirement'),
      ],
      description:
        'Representación completa, una operación por petición y máximo 64 KiB. La ponderación exige porcentaje y referencia juntos o ambos null; un trabajo individual exige integrantes vacíos.',
    },
    Receipt: object({
      id: { type: 'string', format: 'uuid' },
      status: {
        type: 'string',
        enum: ['queued', 'running', 'completed', 'failed'],
      },
    }),
    Result: object({
      id: { type: 'string', format: 'uuid' },
      status: {
        type: 'string',
        enum: ['queued', 'running', 'completed', 'failed'],
      },
      counts: object(
        Object.fromEntries(
          ['read', 'created', 'updated', 'unchanged', 'retired', 'ignored'].map(
            (k) => [k, { type: 'integer', minimum: 0 }],
          ),
        ),
      ),
      error: {
        type: 'object',
        nullable: true,
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    }),
    SourceInput: object({
      name: text(100),
      source_collection: {
        type: 'string',
        pattern: '^[a-z][a-z0-9._-]{0,99}$',
      },
      allowed_types: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: {
          type: 'string',
          enum: getEnabledActivityTypes(),
        },
      },
    }),
    Source: object({
      id: { type: 'string', format: 'uuid' },
      name: text(100),
      source_connection_id: { type: 'string', format: 'uuid' },
      definition_id: { type: 'string', format: 'uuid' },
      source_collection: text(100),
      allowed_types: { type: 'array', items: { type: 'string' } },
      enabled: { type: 'boolean' },
      revoked: { type: 'boolean' },
      created_at: timestamp,
      updated_at: timestamp,
    }),
    SourceCredential: object({
      source: ref('Source'),
      token: {
        type: 'string',
        writeOnly: false,
        description:
          'Solo se devuelve al crear o rotar. Copiar y guardar fuera del código y del historial de comandos.',
      },
    }),
    Error: {
      type: 'object',
      required: ['statusCode', 'message'],
      properties: {
        statusCode: { type: 'integer' },
        message: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        errors: {
          type: 'array',
          items: object({
            path: { type: 'string' },
            message: { type: 'string' },
          }),
        },
      },
    },
  };
  const bearer: SecurityRequirementObject[] = [{ IngestionToken: [] }],
    session = [{ SessionCookie: [] }],
    write = [{ SessionCookie: [], CsrfToken: [] }];
  const id: ParameterObject = {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  };
  const page: ParameterObject[] = [
    {
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    },
    {
      name: 'offset',
      in: 'query',
      schema: { type: 'integer', minimum: 0, default: 0 },
    },
  ];
  const response = (
    schema: SchemaObject | ReferenceObject,
    description = 'Resultado',
  ): ResponseObject => ({
    description,
    content: { 'application/json': { schema } },
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 415, 422, 503].map((code) => [
      code,
      response(
        ref('Error'),
        (
          {
            400: 'JSON mal formado',
            401: 'Autenticación no válida',
            403: 'CSRF u origen no válidos',
            404: 'Recurso no encontrado',
            409: 'Conflicto de clave o fuente pausada',
            413: 'Cuerpo superior a 64 KiB',
            415: 'Se requiere JSON sin comprimir',
            422: 'Validación del contrato',
            503: 'Dependencia no disponible',
          } as Record<number, string>
        )[code],
      ),
    ]),
  );
  const body = (
    schema: SchemaObject | ReferenceObject,
    example: unknown,
  ): RequestBodyObject => ({
    required: true,
    content: { 'application/json': { schema, example } },
  });
  const sourceExample = {
    name: 'Fuente externa de exámenes',
    source_collection: 'external-exams',
    allowed_types: ['academic.exam'],
  };
  const paths: PathsObject = {
    '/api/v1/ingestion-sources': {
      get: {
        tags: ['Fuentes de entrada'],
        summary: 'Listar mis fuentes de entrada',
        security: session,
        parameters: page,
        responses: {
          200: response({ type: 'array', items: ref('Source') }),
          ...errors,
        },
      },
      post: {
        tags: ['Fuentes de entrada'],
        summary: 'Crear una fuente y obtener su credencial una vez',
        security: write,
        requestBody: body(ref('SourceInput'), sourceExample),
        responses: { 201: response(ref('SourceCredential')), ...errors },
      },
    },
    '/api/v1/ingestion-sources/{id}': {
      put: {
        tags: ['Fuentes de entrada'],
        summary: 'Activar o pausar una fuente',
        security: write,
        parameters: [id],
        requestBody: body(object({ enabled: { type: 'boolean' } }), {
          enabled: false,
        }),
        responses: { 200: response(ref('Source')), ...errors },
      },
    },
    '/api/v1/ingestion-sources/{id}/rotate-token': {
      post: {
        tags: ['Fuentes de entrada'],
        summary: 'Rotar la credencial sin cambiar la identidad de la fuente',
        security: write,
        parameters: [id],
        requestBody: body(empty, {}),
        responses: { 200: response(ref('SourceCredential')), ...errors },
      },
    },
    '/api/v1/ingestion-sources/{id}/revoke': {
      post: {
        tags: ['Fuentes de entrada'],
        summary:
          'Revocar la credencial; el trabajo aceptado conserva su ejecución',
        security: write,
        parameters: [id],
        requestBody: body(empty, {}),
        responses: { 200: response(ref('Source')), ...errors },
      },
    },
    '/api/v1/ingestions': {
      post: {
        tags: ['Entradas'],
        summary: 'Enviar una actividad o retirada',
        description:
          '202 confirma persistencia, no finalización. Un reenvío de la misma clave y contenido devuelve la misma ejecución. Nueva revisión: clave nueva e identidad externa estable.',
        security: bearer,
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
              pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$',
            },
          },
        ],
        requestBody: body(ref('IngestionRequest'), ingestionExample),
        responses: {
          202: {
            ...response(ref('Receipt'), 'Entrada persistida'),
            headers: {
              Location: {
                schema: { type: 'string' },
                description: 'URL de consulta del resultado',
              },
            },
          },
          ...errors,
        },
      },
    },
    '/api/v1/ingestions/{id}': {
      get: {
        tags: ['Entradas'],
        summary: 'Consultar el resultado de una entrada de mi fuente',
        security: bearer,
        parameters: [id],
        responses: { 200: response(ref('Result')), ...errors },
      },
    },
    '/api/v1/activities': {
      get: {
        tags: ['Consulta de Sync'],
        summary: 'Consultar actividades propias',
        security: session,
        parameters: [
          ...page,
          { name: 'type', in: 'query', schema: { type: 'string' } },
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string', default: 'Europe/Madrid' },
          },
        ],
        responses: {
          200: response({ type: 'array', items: { type: 'object' } }),
          ...errors,
        },
      },
    },
    '/api/v1/activities/{id}': {
      get: {
        tags: ['Consulta de Sync'],
        summary: 'Consultar una actividad propia',
        security: session,
        parameters: [id],
        responses: { 200: response({ type: 'object' }), ...errors },
      },
    },
    '/api/v1/sync-definitions': {
      get: {
        tags: ['Consulta de Sync'],
        summary: 'Listar sincronizaciones de lectura',
        security: session,
        parameters: page,
        responses: {
          200: response({ type: 'array', items: { type: 'object' } }),
          ...errors,
        },
      },
    },
    '/api/v1/sync-runs/{id}': {
      get: {
        tags: ['Consulta de Sync'],
        summary: 'Consultar una ejecución con la sesión de su propietario',
        security: session,
        parameters: [id],
        responses: { 200: response({ type: 'object' }), ...errors },
      },
    },
  };
  return {
    openapi: '3.0.4',
    info: {
      title: 'Synkron · Entrada estandarizada',
      version: '1.0.0',
      description:
        'Inicia sesión en [Synkron](/) desde este navegador para administrar fuentes. Swagger obtiene CSRF automáticamente en esas escrituras. Para enviar actividades, usa Authorize → IngestionToken e introduce la credencial sin el prefijo Bearer. No se guarda al recargar. El 202 confirma aceptación; consulta después el resultado. [Descargar OpenAPI](/api/docs/openapi.json).',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        IngestionToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'si_<64 hexadecimal>',
          description:
            'Credencial de una fuente de entrada; introducir solo si_…, sin el prefijo Bearer.',
        },
        SessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: process.env.SESSION_COOKIE_NAME ?? '__Host-synkron_session',
          description:
            'Usa la sesión de Synkron del navegador. No es necesario introducir ni copiar la cookie HttpOnly.',
        },
        CsrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description:
            'Swagger obtiene un token actual automáticamente al administrar fuentes; no es necesario introducirlo manualmente.',
        },
      },
    },
  };
}
