import type { OpenAPIObject } from '@nestjs/swagger';
import {
  object,
  text,
  uuid,
  instant,
  ref,
  securitySchemes,
  session,
  operation,
  errorSchema,
} from './openapi-support';

export function buildAccountsOpenApi(): OpenAPIObject {
  const credentials = (minimum: number) =>
    object({
      email: { ...text(254), format: 'email' },
      password: {
        ...text(128),
        minLength: minimum,
        format: 'password',
        writeOnly: true,
      },
    });
  const example = {
    email: 'integracion@example.com',
    password: 'Una-clave-ficticia-para-pruebas',
  };
  const csrf = [{ CsrfToken: [] }];
  return {
    openapi: '3.0.4',
    info: {
      title: 'Synkron · Cuentas y sesiones',
      version: '1.0.0',
      description:
        'Registro y sesiones con cookies HttpOnly. Las escrituras requieren origen autorizado y CSRF; el portal Swagger obtiene el token automáticamente. Login permite iniciar sesión desde este portal. Registro crea una cuenta, pero no inicia sesión. [Volver a Synkron](/).',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes,
      schemas: {
        Error: errorSchema,
        RegisterAccount: credentials(15),
        LoginAccount: credentials(1),
        Account: object({
          id: uuid,
          email: { ...text(), format: 'email' },
          created_at: instant,
        }),
        Session: object({
          user: object({ id: uuid, email: { ...text(), format: 'email' } }),
          expires_at: instant,
        }),
        Csrf: object({ csrf_token: text() }),
      },
    },
    paths: {
      '/api/v1/auth/csrf': {
        get: operation('Sesión', 'Obtener un token CSRF', 200, ref('Csrf'), {
          security: [],
          errors: [500],
          description:
            'Puede utilizarse antes del acceso. Emite la cookie de protección necesaria; el token no sustituye la sesión.',
        }),
      },
      '/api/v1/auth/register': {
        post: operation(
          'Cuentas',
          'Registrar una cuenta',
          201,
          ref('Account'),
          {
            body: ref('RegisterAccount'),
            example,
            security: csrf,
            errors: [403, 409, 422, 500],
          },
        ),
      },
      '/api/v1/auth/login': {
        post: operation('Sesión', 'Iniciar sesión', 200, ref('Session'), {
          body: ref('LoginAccount'),
          example,
          security: csrf,
          errors: [401, 403, 422, 429, 500],
          description:
            'Establece la cookie HttpOnly de sesión y renueva CSRF. Los límites de acceso devuelven Retry-After.',
        }),
      },
      '/api/v1/auth/session': {
        get: operation(
          'Sesión',
          'Consultar la sesión actual',
          200,
          ref('Session'),
          { security: session, errors: [401, 500] },
        ),
      },
      '/api/v1/auth/logout': {
        post: operation('Sesión', 'Cerrar sesión', 204, undefined, {
          security: csrf,
          errors: [403, 500],
          description: 'Invalida la sesión y renueva CSRF. No requiere cuerpo.',
        }),
      },
    },
  };
}
