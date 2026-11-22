import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  SchemaObject,
  ReferenceObject,
  SecurityRequirementObject,
} from '@nestjs/swagger';

export type Schema = SchemaObject | ReferenceObject;
export const ref = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
export const text = (maxLength?: number): SchemaObject => ({
  type: 'string',
  ...(maxLength ? { minLength: 1, maxLength } : {}),
});
export const uuid: SchemaObject = { type: 'string', format: 'uuid' };
export const instant: SchemaObject = { type: 'string', format: 'date-time' };
export const day: SchemaObject = {
  type: 'string',
  format: 'date',
  pattern: '^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$',
};
export const boolean: SchemaObject = { type: 'boolean' };
export const integer: SchemaObject = { type: 'integer', minimum: 0 };
export const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
export const values = (
  items: readonly (string | number | null)[],
): SchemaObject => ({
  type:
    typeof items.find((x) => x !== null) === 'number' ? 'integer' : 'string',
  enum: [...items],
  ...(items.includes(null) ? { nullable: true } : {}),
});
export const array = (items: Schema): SchemaObject => ({
  type: 'array',
  items,
});
export const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
export const id: ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: uuid,
};
export const query = (
  name: string,
  schema: SchemaObject,
  description?: string,
): ParameterObject => ({
  name,
  in: 'query',
  schema,
  ...(description ? { description } : {}),
});
export const pagination: ParameterObject[] = [
  query('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
  query('offset', {
    type: 'integer',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    default: 0,
  }),
];
export const timestamps = { created_at: instant, updated_at: instant };
export const session: SecurityRequirementObject[] = [{ SessionCookie: [] }];
export const write: SecurityRequirementObject[] = [
  { SessionCookie: [], CsrfToken: [] },
];
export const securitySchemes: NonNullable<
  OpenAPIObject['components']
>['securitySchemes'] = {
  SessionCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: process.env.SESSION_COOKIE_NAME ?? '__Host-synkron_session',
    description:
      'Sesión HttpOnly del navegador. Inicia sesión en Synkron; no copies la cookie en Authorize.',
  },
  CsrfToken: {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description:
      'El portal Swagger de Synkron obtiene un CSRF actual antes de cada escritura; no hace falta introducirlo manualmente.',
  },
};
export const errorSchema: SchemaObject = object(
  {
    statusCode: integer,
    message: { oneOf: [text(), array(text())] },
    error: text(),
  },
  ['statusCode', 'message'],
);
export function operation(
  tag: string,
  summary: string,
  status: number,
  result?: Schema,
  options: {
    description?: string;
    parameters?: ParameterObject[];
    body?: Schema;
    example?: unknown;
    security?: SecurityRequirementObject[];
    errors?: number[];
  } = {},
): OperationObject {
  return {
    tags: [tag],
    summary,
    ...(options.description ? { description: options.description } : {}),
    ...(options.security ? { security: options.security } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: options.body,
                ...(options.example !== undefined
                  ? { example: options.example }
                  : {}),
              },
            },
          },
        }
      : {}),
    responses: {
      [status]: {
        description:
          status === 204 ? 'Operación completada, sin cuerpo' : 'Resultado',
        ...(result
          ? { content: { 'application/json': { schema: result } } }
          : {}),
      },
      ...Object.fromEntries(
        (options.errors ?? [401, 422, 500]).map((code) => [
          code,
          {
            description:
              (
                {
                  400: 'Petición no válida',
                  401: 'Autenticación no válida',
                  403: 'CSRF u origen no válidos',
                  404: 'Recurso no encontrado',
                  409: 'Conflicto con el estado actual',
                  422: 'Validación',
                  429: 'Demasiados intentos',
                  500: 'Error del servidor',
                  503: 'Dependencia no disponible',
                } as Record<number, string>
              )[code] ?? 'Error',
            content: { 'application/json': { schema: ref('Error') } },
            ...(code === 429
              ? {
                  headers: {
                    'Retry-After': {
                      description: 'Segundos hasta poder reintentar',
                      schema: { type: 'integer', minimum: 1 },
                    },
                  },
                }
              : {}),
          },
        ]),
      ),
    },
  };
}

// Discover routes from Nest controllers; keep only the public API and use explicit
// contracts for interface/union bodies and responses that TypeScript erases.
export function generatePublicDocument(
  app: INestApplication,
  contract: OpenAPIObject,
): OpenAPIObject {
  const discovered = SwaggerModule.createDocument(
    app,
    {
      openapi: contract.openapi,
      info: contract.info,
      servers: contract.servers,
    },
    { autoTagControllers: false },
  );
  const paths: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(discovered.paths)) {
    if (!path.startsWith('/api/v1/')) continue;
    paths[path] = {};
    for (const method of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ] as const) {
      if (!item[method]) continue;
      paths[path][method] = {
        ...(contract.paths[path]?.[method] ?? item[method]),
        operationId: item[method].operationId,
      };
    }
  }
  // Do not copy schemas collected from internal controllers into the public spec.
  return { ...contract, paths };
}
