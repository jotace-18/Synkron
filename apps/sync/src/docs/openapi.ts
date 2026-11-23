import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';
import { ACTIVITY_TYPES } from '../activities/activity.types';
import { CONNECTOR_NAMES } from '../connectors/connector-catalog';
import { buildIngestionOpenApi } from '../ingestions/ingestion-openapi';
import {
  array,
  boolean,
  day,
  id,
  instant,
  integer,
  nullable,
  object,
  operation,
  pagination,
  query,
  ref,
  session,
  text,
  timestamps,
  uuid,
  values,
  write,
} from './openapi-support';

export function buildSyncOpenApi(): OpenAPIObject {
  const doc = buildIngestionOpenApi();
  const schemas = doc.components!.schemas!;
  const connection = object({
    id: uuid,
    name: text(100),
    base_url: { ...text(2048), format: 'uri' },
    auth_type: values(['none', 'bearer']),
    has_credentials: boolean,
    enabled: boolean,
    ...timestamps,
  });
  const definition = object({
    id: uuid,
    name: text(100),
    source_connection_id: uuid,
    connector: values(CONNECTOR_NAMES),
    source_collection: values(['assignments', 'exams', 'activities']),
    enabled: boolean,
    ...timestamps,
  });
  const run = object({
    id: uuid,
    definition_id: uuid,
    status: values(['queued', 'running', 'completed', 'failed']),
    created_at: instant,
    started_at: nullable(instant),
    finished_at: nullable(instant),
    ...Object.fromEntries(
      ['read', 'created', 'updated', 'unchanged', 'retired', 'ignored'].map(
        (field) => [`${field}_count`, integer],
      ),
    ),
    error_code: nullable(text()),
    error_message: nullable(text()),
  });
  const activity = (model: string) => {
    const upsert = schemas[model] as SchemaObject;
    const normalized = upsert.properties!.activity as SchemaObject;
    return object({
      ...normalized.properties,
      id: uuid,
      source_connection_id: uuid,
      source_collection: text(),
      external_id: text(256),
      source_updated_at: nullable(instant),
      ...timestamps,
      last_synced_at: instant,
    });
  };
  Object.assign(schemas, {
    Connection: connection,
    ConnectionInput: object(
      {
        name: text(100),
        base_url: {
          ...text(2048),
          format: 'uri',
          description:
            'URL absoluta HTTP/HTTPS, sin usuario ni contraseña; el destino debe estar autorizado en la configuración de Sync.',
        },
        auth: {
          oneOf: [
            object({ type: values(['none']) }),
            object({
              type: values(['bearer']),
              token: {
                ...text(4096),
                writeOnly: true,
                pattern: '^[A-Za-z0-9._~+/-]+=*$',
              },
            }),
          ],
        },
        enabled: { ...boolean, default: true },
      },
      ['name', 'base_url', 'auth'],
    ),
    ConnectionProbe: object({
      ok: boolean,
      status_code: nullable(integer),
      error: values([
        'http_error',
        'network_error',
        'timeout',
        'redirect_not_allowed',
        'response_too_large',
        null,
      ]),
    }),
    Definition: definition,
    DefinitionInput: object(
      {
        name: text(100),
        source_connection_id: uuid,
        connector: values(CONNECTOR_NAMES),
        enabled: { ...boolean, default: true },
      },
      ['name', 'source_connection_id', 'connector'],
    ),
    Run: run,
    AssignmentActivity: activity('AssignmentUpsert'),
    ExamActivity: activity('ExamUpsert'),
    GymActivity: activity('GymUpsert'),
    Activity: {
      oneOf: [
        ref('AssignmentActivity'),
        ref('ExamActivity'),
        ref('GymActivity'),
      ],
    },
  });
  doc.info.title = 'Synkron · Sync';
  doc.info.description =
    'Conexiones de lectura, definiciones, ejecuciones, actividades y recepción directa. Usa la sesión de Synkron para gestionar y consultar; Swagger obtiene CSRF automáticamente. IngestionToken se reserva a /ingestions: introducir solo si_…, sin Bearer. La credencial saliente de una conexión es otra credencial distinta y nunca se devuelve. [Guía de la entrada](/api/docs/openapi.json).';
  doc.security = session;
  const writeErrors = [400, 401, 403, 404, 409, 422, 500, 503];
  const key = {
    name: 'Idempotency-Key',
    in: 'header' as const,
    required: true,
    schema: { ...text(128), pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
    description:
      'Misma solicitud: conserva la clave. Otra solicitud: nueva clave.',
  };
  const sourceInput = schemas.ConnectionInput as SchemaObject;
  schemas.SyncSourceInput = {
    ...sourceInput,
    properties: {
      ...sourceInput.properties,
      connector: values(CONNECTOR_NAMES),
      auth: object({
        type: values(['bearer']),
        token: {
          ...text(4096),
          writeOnly: true,
          pattern: '^[A-Za-z0-9._~+/-]+=*$',
        },
      }),
    },
    required: [...sourceInput.required!, 'connector'],
  };
  schemas.SyncSource = object({
    connection: ref('Connection'),
    definition: ref('Definition'),
  });
  doc.paths['/api/v1/sync-sources'] = {
    post: operation(
      'Conexiones',
      'Conectar una fuente de lectura y su definición de forma atómica',
      201,
      ref('SyncSource'),
      {
        body: ref('SyncSourceInput'),
        security: write,
        errors: writeErrors,
        description:
          'Un reintento del mismo propietario, URL, conector y credencial devuelve la misma conexión y definición. Otra credencial o una fuente existente deshabilitada devuelve 409. No reactiva ni renombra una fuente existente. standard.activities lee páginas de operaciones canónicas v1 (limit/offset, 20 registros, 64 KiB/página, máximo 100 páginas), incluidas retiradas explícitas; la ausencia de un registro no lo retira.',
      },
    ),
  };
  doc.paths['/api/v1/connections'] = {
    get: operation(
      'Conexiones',
      'Listar conexiones de lectura',
      200,
      array(ref('Connection')),
      { parameters: pagination },
    ),
    post: operation(
      'Conexiones',
      'Crear una conexión de lectura',
      201,
      ref('Connection'),
      {
        body: ref('ConnectionInput'),
        security: write,
        errors: writeErrors,
        example: {
          name: 'Academic · exámenes',
          base_url: 'http://academic:3000/api/v1/exams/export',
          auth: { type: 'bearer', token: 'token-ficticio-reemplazar' },
          enabled: true,
        },
      },
    ),
  };
  doc.paths['/api/v1/connections/{id}/test'] = {
    post: operation(
      'Conexiones',
      'Comprobar una conexión autorizada',
      200,
      ref('ConnectionProbe'),
      {
        parameters: [id],
        security: write,
        errors: writeErrors,
        description:
          'Utiliza la credencial almacenada. No recibe cuerpo. Un resultado ok=false puede devolverse con HTTP 200; revisa status_code y error.',
      },
    ),
  };
  doc.paths['/api/v1/sync-definitions'] = {
    get: operation(
      'Definiciones',
      'Listar sincronizaciones de lectura',
      200,
      array(ref('Definition')),
      { parameters: pagination },
    ),
    post: operation(
      'Definiciones',
      'Crear una definición de sincronización',
      201,
      ref('Definition'),
      {
        security: write,
        body: ref('DefinitionInput'),
        errors: writeErrors,
        example: {
          name: 'Centralizar exámenes académicos',
          source_connection_id: '11111111-1111-4111-8111-111111111111',
          connector: 'academic.exams',
          enabled: true,
        },
        description:
          'La colección se obtiene del conector; no se envía. Requiere conexión propia, habilitada y compatible. Las fuentes push se administran en ingestion-sources.',
      },
    ),
  };
  doc.paths['/api/v1/sync-definitions/{id}/runs'] = {
    post: operation(
      'Ejecuciones',
      'Solicitar una sincronización en segundo plano',
      202,
      ref('Receipt'),
      {
        security: write,
        parameters: [id, key],
        body: object({}),
        example: {},
        errors: writeErrors,
        description:
          'El cuerpo es exactamente {}. 202 confirma una ejecución persistida y su trabajo. Repetir la misma clave conserva su ID. Consulta después GET /sync-runs/{id}; Location indica esa ruta.',
      },
    ),
  };
  doc.paths['/api/v1/sync-runs/{id}'] = {
    get: operation(
      'Ejecuciones',
      'Consultar una ejecución propia',
      200,
      ref('Run'),
      {
        parameters: [id],
        errors: [401, 404, 422, 500],
        description:
          'Resultado persistido en Sync, incluidos estados queued/running; Monitoring recibe los resultados terminales de forma asíncrona.',
      },
    ),
  };
  doc.paths['/api/v1/activities'] = {
    get: operation(
      'Actividades',
      'Listar actividades centralizadas activas',
      200,
      array(ref('Activity')),
      {
        parameters: [
          ...pagination,
          query('type', values(ACTIVITY_TYPES)),
          query('source_connection_id', uuid),
          query('from', day, 'Día inicial incluido; exige también to.'),
          query('to', day, 'Día final excluido; exige from anterior a to.'),
          query(
            'timezone',
            { ...text(), default: 'Europe/Madrid' },
            'Zona IANA utilizada al filtrar fechas e instantes.',
          ),
        ],
        description:
          'from/to son opcionales como pareja. Las actividades retiradas no aparecen. Los tipos del catálogo que aún no tienen fuente implementada pueden no devolver registros.',
      },
    ),
  };
  doc.paths['/api/v1/activities/{id}'] = {
    get: operation(
      'Actividades',
      'Consultar una actividad centralizada activa',
      200,
      ref('Activity'),
      { parameters: [id], errors: [401, 404, 422, 500] },
    ),
  };
  return doc;
}
