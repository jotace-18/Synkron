import type { OpenAPIObject } from '@nestjs/swagger';
import {
  operation,
  object,
  text,
  uuid,
  instant,
  array,
  nullable,
} from './openapi-support';
export function withSourceIdentity(
  document: OpenAPIObject,
  source: string,
): OpenAPIObject {
  const session = { SourceSession: [] };
  const write = { SourceSession: [], SourceCsrf: [] };
  const user = object({ id: uuid, email: { type: 'string', format: 'email' } });
  const login = object({
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  });
  const register = object({
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  });
  const token = object({
    id: uuid,
    name: text(100),
    suffix: text(4),
    created_at: instant,
    revoked_at: nullable(instant),
  });
  document.components ??= {};
  document.components.securitySchemes = {
    ...document.components.securitySchemes,
    SourceSession: {
      type: 'apiKey',
      in: 'cookie',
      name: `synkron_${source}_session`,
      description:
        'Sesión propia de esta fuente, distinta de Synkron. Inicia sesión desde su interfaz. HTTP solo en localhost; en despliegue HTTPS configurar SOURCE_COOKIE_SECURE=true.',
    },
    SourceCsrf: {
      type: 'apiKey',
      in: 'header',
      name: 'X-CSRF-Token',
      description:
        'Obtener un token nuevo en /api/v1/auth/csrf antes de cada escritura con sesión. Se comprueba también el origen.',
    },
  };
  const bearer = document.security ?? [];
  document.security = [...bearer, session];
  for (const [path, item] of Object.entries(document.paths)) {
    if (path.endsWith('/export') && item.get) item.get.security = bearer;
  }
  document.info.description = `${document.info.description ?? ''} Registro y sesión propios por correo/contraseña en /api/v1/auth. Conectar con Synkron genera tokens personales de solo lectura, mostrados una vez y revocables. Los tokens de sesión y las contraseñas no se comparten con Synkron. Las credenciales demo anteriores se conservan como compatibilidad; no se inyectan en las interfaces. Las exportaciones requieren Bearer, nunca una cookie de sesión.`;
  document.paths['/api/v1/auth/csrf'] = {
    get: operation(
      'Cuenta de la fuente',
      'Obtener protección CSRF',
      200,
      object({ csrf_token: text() }),
      { security: [], errors: [500] },
    ),
  };
  document.paths['/api/v1/auth/register'] = {
    post: operation(
      'Cuenta de la fuente',
      'Crear una cuenta personal',
      201,
      user,
      {
        body: register,
        security: [{ SourceCsrf: [] }],
        errors: [403, 409, 422, 429, 500],
        description:
          'No inicia sesión ni adopta los datos de la cuenta demo. Requiere origen autorizado y CSRF.',
      },
    ),
  };
  document.paths['/api/v1/auth/login'] = {
    post: operation('Cuenta de la fuente', 'Iniciar sesión', 200, user, {
      body: login,
      security: [{ SourceCsrf: [] }],
      errors: [401, 403, 422, 429, 500],
      description:
        'Cookie HttpOnly propia; 30 minutos de inactividad y 12 horas absolutas. El token CSRF anterior deja de ser válido al cambiar la sesión.',
    }),
  };
  document.paths['/api/v1/auth/session'] = {
    get: operation(
      'Cuenta de la fuente',
      'Consultar la sesión actual',
      200,
      user,
      { security: [session] },
    ),
  };
  document.paths['/api/v1/auth/logout'] = {
    post: operation('Cuenta de la fuente', 'Cerrar sesión', 204, undefined, {
      security: [write],
      errors: [403, 500],
    }),
  };
  document.paths['/api/v1/auth/tokens'] = {
    get: operation(
      'Credenciales para Synkron',
      'Listar las credenciales propias sin revelar el token',
      200,
      array(token),
      { security: [session] },
    ),
    post: operation(
      'Credenciales para Synkron',
      'Crear una credencial de solo lectura',
      201,
      object({
        id: uuid,
        name: text(100),
        suffix: text(4),
        created_at: instant,
        token: text(64),
      }),
      {
        body: object({ name: text(100) }),
        security: [write],
        errors: [401, 403, 422, 500],
        description:
          'El token solo se devuelve en esta respuesta. Guardar en Synkron antes de ocultarlo; el servidor conserva solo su SHA-256.',
      },
    ),
  };
  document.paths['/api/v1/auth/tokens/{id}'] = {
    delete: operation(
      'Credenciales para Synkron',
      'Revocar una credencial propia',
      204,
      undefined,
      {
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        security: [write],
        errors: [400, 401, 403, 404, 500],
        description:
          'Idempotente. No borra actividades ni cierra la sesión. La siguiente lectura con el token revocado devuelve 401.',
      },
    ),
  };
  return document;
}
