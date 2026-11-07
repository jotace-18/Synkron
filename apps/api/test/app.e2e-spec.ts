import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';

const appOrigin = process.env.APP_ORIGIN;

if (!appOrigin) {
  throw new Error('APP_ORIGIN es obligatoria para ejecutar las E2E de la API');
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  async function getCsrfContext() {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .expect(200)
      .expect('Cache-Control', 'no-store');

    const body = response.body as { csrf_token: string };
    const cookieHeaders = response.headers['set-cookie'] as unknown as string[];

    expect(typeof body.csrf_token).toBe('string');
    expect(body.csrf_token.length).toBeGreaterThan(0);
    expect(cookieHeaders).toHaveLength(2);

    return {
      token: body.csrf_token,
      cookies: cookieHeaders.map((cookie) => cookie.split(';')[0]),
      cookieHeaders,
    };
  }

  it('issues a CSRF token with protected context cookies', async () => {
    const context = await getCsrfContext();

    expect(
      context.cookies.some((cookie) =>
        cookie.startsWith('__Host-synkron_context='),
      ),
    ).toBe(true);
    expect(
      context.cookies.some((cookie) =>
        cookie.startsWith('__Host-synkron_csrf='),
      ),
    ).toBe(true);

    for (const cookie of context.cookieHeaders) {
      expect(cookie).toMatch(/; Path=\/(?:;|$)/);
      expect(cookie).toMatch(/; HttpOnly(?:;|$)/);
      expect(cookie).toMatch(/; Secure(?:;|$)/);
      expect(cookie).toMatch(/; SameSite=Lax(?:;|$)/);
      expect(cookie).not.toMatch(/; Domain=/i);
    }
  });

  it('/healthz (GET)', () => {
    return request(app.getHttpServer()).get('/healthz').expect(200).expect({
      status: 'ok',
      service: 'api',
      database: 'up',
    });
  });

  it('registers an account without returning secrets', async () => {
    const context = await getCsrfContext();
    const email = `e2e-${randomUUID()}@example.com`;

    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .set('Cookie', context.cookies)
        .set('X-CSRF-Token', context.token)
        .send({
          email: ` ${email.toUpperCase()} `,
          password: 'Una-clave-ficticia-para-pruebas',
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String) as unknown,
        email,
        created_at: expect.any(String) as unknown,
      });
    } finally {
      await app
        .get(DatabaseService)
        .query('DELETE FROM auth.users WHERE email = $1', [email]);
    }
  });

  it('rejects duplicate emails without creating another account', async () => {
    const context = await getCsrfContext();
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'Una-clave-ficticia-para-pruebas';

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .set('Cookie', context.cookies)
        .set('X-CSRF-Token', context.token)
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .set('Cookie', context.cookies)
        .set('X-CSRF-Token', context.token)
        .send({ email: email.toUpperCase(), password })
        .expect(409);

      const result = await app
        .get(DatabaseService)
        .query<{ total: number }>(
          'SELECT count(*)::int AS total FROM auth.users WHERE email = $1',
          [email],
        );

      expect(result.rows[0].total).toBe(1);
    } finally {
      await app
        .get(DatabaseService)
        .query('DELETE FROM auth.users WHERE email = $1', [email]);
    }
  });

  it('rejects invalid registration data without creating an account', async () => {
    const context = await getCsrfContext();
    const email = `invalid-${randomUUID()}`;

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .set('Cookie', context.cookies)
        .set('X-CSRF-Token', context.token)
        .send({ email, password: 'corta' })
        .expect(422);

      const result = await app
        .get(DatabaseService)
        .query<{ total: number }>(
          'SELECT count(*)::int AS total FROM auth.users WHERE email = $1',
          [email],
        );

      expect(result.rows[0].total).toBe(0);
    } finally {
      await app
        .get(DatabaseService)
        .query('DELETE FROM auth.users WHERE email = $1', [email]);
    }
  });

  it('rejects registration requests without an origin', async () => {
    const context = await getCsrfContext();

    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', context.cookies)
      .set('X-CSRF-Token', context.token)
      .send({})
      .expect(403);
  });

  it('rejects registration requests from another origin', async () => {
    const context = await getCsrfContext();

    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://other.example.com')
      .set('Cookie', context.cookies)
      .set('X-CSRF-Token', context.token)
      .send({})
      .expect(403);
  });

  it.each([
    'missing token',
    'incorrect token',
    'missing cookies',
    'token from another context',
  ])('rejects a registration with %s', async (scenario) => {
    const context = await getCsrfContext();
    const email = `e2e-${randomUUID()}@example.com`;
    let token: string | undefined = context.token;
    let cookies = context.cookies;

    if (scenario === 'missing token') token = undefined;
    if (scenario === 'incorrect token') token = 'invalid-token';
    if (scenario === 'missing cookies') cookies = [];

    if (scenario === 'token from another context') {
      const otherContext = await getCsrfContext();
      token = otherContext.token;
      cookies = [
        ...context.cookies.filter((cookie) =>
          cookie.startsWith('__Host-synkron_context='),
        ),
        ...otherContext.cookies.filter((cookie) =>
          cookie.startsWith('__Host-synkron_csrf='),
        ),
      ];
    }

    try {
      const registration = request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .send({ email, password: 'Una-clave-ficticia-para-pruebas' });

      if (cookies.length > 0) registration.set('Cookie', cookies);
      if (token !== undefined) registration.set('X-CSRF-Token', token);

      await registration.expect(403);

      const result = await app
        .get(DatabaseService)
        .query<{ total: number }>(
          'SELECT count(*)::int AS total FROM auth.users WHERE email = $1',
          [email],
        );

      expect(result.rows[0].total).toBe(0);
    } finally {
      await app
        .get(DatabaseService)
        .query('DELETE FROM auth.users WHERE email = $1', [email]);
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
