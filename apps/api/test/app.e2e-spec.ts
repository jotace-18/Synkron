import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import {
  AuthService,
  LoginRateLimitException,
} from '../src/accounts/auth.service';
import { AccountsService } from '../src/accounts/accounts.service';
import { sessionCookieName } from '../src/accounts/session-cookie';

const appOrigin = process.env.APP_ORIGIN ?? '';

if (!appOrigin) {
  throw new Error('APP_ORIGIN es obligatoria para ejecutar las E2E de la API');
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let authenticationEmails: string[];
  let testBuckets: string[];
  const testSettings = {
    SESSION_IDLE_TTL_MINUTES: '30',
    SESSION_ABSOLUTE_TTL_HOURS: '12',
    AUTH_LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: '5',
    AUTH_LOGIN_MAX_ATTEMPTS_PER_IP: '10000',
  };
  const previousSettings = new Map<string, string | undefined>();

  beforeAll(() => {
    // Todos los clientes E2E comparten loopback; la prueba por IP usa un origen propio.
    for (const [name, value] of Object.entries(testSettings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
  });

  afterAll(() => {
    for (const [name, value] of previousSettings) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(async () => {
    authenticationEmails = [];
    testBuckets = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  function mergeCookies(previous: string[], updates: string[]): string[] {
    const jar = new Map<string, string>();
    for (const cookie of [...previous, ...updates]) {
      const pair = cookie.split(';')[0];
      jar.set(pair.slice(0, pair.indexOf('=')), pair);
    }
    return [...jar.values()];
  }

  async function getCsrfContext(previousCookies: string[] = []) {
    const csrfRequest = request(app.getHttpServer()).get('/api/v1/auth/csrf');
    if (previousCookies.length > 0) csrfRequest.set('Cookie', previousCookies);
    const response = await csrfRequest
      .expect(200)
      .expect('Cache-Control', 'no-store');

    const body = response.body as { csrf_token: string };
    const cookieHeaders = response.headers['set-cookie'] as unknown as string[];

    expect(typeof body.csrf_token).toBe('string');
    expect(body.csrf_token.length).toBeGreaterThan(0);
    expect(cookieHeaders).toHaveLength(2);

    return {
      token: body.csrf_token,
      cookies: mergeCookies(previousCookies, cookieHeaders),
      cookieHeaders,
    };
  }

  async function createAccount() {
    const context = await getCsrfContext();
    const email = `auth-${randomUUID()}@example.com`;
    const password = 'Una-clave-ficticia-para-pruebas';
    authenticationEmails.push(email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', appOrigin)
      .set('Cookie', context.cookies)
      .set('X-CSRF-Token', context.token)
      .send({ email, password })
      .expect(201);

    const account = response.body as { id: string; email: string };
    return { ...account, password, context };
  }

  async function loginAccount(
    account: { id: string; email: string; password: string },
    context: Awaited<ReturnType<typeof getCsrfContext>>,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', appOrigin)
      .set('Cookie', context.cookies)
      .set('X-CSRF-Token', context.token)
      .send({
        email: ` ${account.email.toUpperCase()} `,
        password: account.password,
      })
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toEqual({
      user: { id: account.id, email: account.email },
      expires_at: expect.any(String) as unknown,
    });
    const cookieHeaders = response.headers['set-cookie'] as unknown as string[];
    const cookies = mergeCookies(context.cookies, cookieHeaders);
    return {
      response,
      cookieHeaders,
      cookies,
      context: await getCsrfContext(cookies),
    };
  }

  function sessionHash(cookies: string[]): string {
    const prefix = `${sessionCookieName()}=`;
    const cookie = cookies.find((pair) => pair.startsWith(prefix));
    if (!cookie) throw new Error('Falta la cookie de sesión de prueba');
    return createHash('sha256')
      .update(cookie.slice(prefix.length))
      .digest('hex');
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

  it('does not authenticate a registered account or an anonymous CSRF context', async () => {
    const account = await createAccount();
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', account.context.cookies)
      .expect(401);
  });

  it('creates a protected session, stores only its hash and reports the account', async () => {
    const account = await createAccount();
    const login = await loginAccount(account, account.context);
    const cookie = login.cookieHeaders.find((value) =>
      value.startsWith(`${sessionCookieName()}=`),
    );
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; Path=\/(?:;|$)/);
    expect(cookie).toMatch(/; HttpOnly(?:;|$)/);
    expect(cookie).toMatch(/; Secure(?:;|$)/);
    expect(cookie).toMatch(/; SameSite=Lax(?:;|$)/);
    expect(cookie).not.toMatch(/; Domain=/i);

    const stored = await app
      .get(DatabaseService)
      .query<{ token_hash: string; lifetime_seconds: number }>(
        `SELECT token_hash, extract(epoch FROM (absolute_expires_at - created_at))::int
           AS lifetime_seconds FROM auth.sessions WHERE user_id = $1`,
        [account.id],
      );
    expect(stored.rows).toEqual([
      { token_hash: sessionHash(login.cookies), lifetime_seconds: 43200 },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', login.cookies)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toEqual({
      user: { id: account.id, email: account.email },
      expires_at: expect.any(String) as unknown,
    });
  });

  it('returns the same login error for unknown emails and wrong passwords', async () => {
    const account = await createAccount();
    const responses = [];
    for (const email of [
      account.email,
      `unknown-${randomUUID()}@example.com`,
    ]) {
      testBuckets.push(
        `account:${createHash('sha256').update(email).digest('hex')}`,
      );
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('Cookie', account.context.cookies)
        .set('X-CSRF-Token', account.context.token)
        .send({ email, password: 'incorrecta' })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
      responses.push(response.body as unknown);
    }
    expect(responses[0]).toEqual(responses[1]);
    const sessions = await app
      .get(DatabaseService)
      .query<{ total: number }>(
        'SELECT count(*)::int AS total FROM auth.sessions WHERE user_id = $1',
        [account.id],
      );
    expect(sessions.rows[0].total).toBe(0);
  });

  it('rejects missing, malformed and unknown session cookies', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/session').expect(401);
    for (const token of ['invalid', 'a'.repeat(64)]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', [`${sessionCookieName()}=${token}`])
        .expect(401);
    }
  });

  it('rotates the session on login and revokes the previous session', async () => {
    const account = await createAccount();
    const first = await loginAccount(account, account.context);
    const second = await loginAccount(account, first.context);
    expect(sessionHash(first.cookies)).not.toBe(sessionHash(second.cookies));
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', first.cookies)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', second.cookies)
      .expect(200);
  });

  it('rejects the pre-login CSRF context when an authenticated session is attached', async () => {
    const account = await createAccount();
    const login = await loginAccount(account, account.context);
    const sessionCookie = login.cookies.filter((cookie) =>
      cookie.startsWith(`${sessionCookieName()}=`),
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', appOrigin)
      .set('Cookie', [...account.context.cookies, ...sessionCookie])
      .set('X-CSRF-Token', account.context.token)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', login.cookies)
      .expect(200);
  });

  it('revokes logout on the server, clears the cookie and permits repeated logout', async () => {
    const account = await createAccount();
    const login = await loginAccount(account, account.context);
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', appOrigin)
      .set('Cookie', login.context.cookies)
      .set('X-CSRF-Token', login.context.token)
      .send({})
      .expect(204);
    expect(logout.text).toBe('');
    const clearedCookies = logout.headers['set-cookie'] as unknown as string[];
    expect(
      clearedCookies.some((cookie) =>
        cookie.startsWith(`${sessionCookieName()}=;`),
      ),
    ).toBe(true);
    // Reutilizar la cookie anterior tampoco debe recuperar acceso.
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', login.cookies)
      .expect(401);
    const anonymous = await getCsrfContext(
      mergeCookies(login.cookies, clearedCookies),
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', appOrigin)
      .set('Cookie', anonymous.cookies)
      .set('X-CSRF-Token', anonymous.token)
      .send({})
      .expect(204);
  });

  it('renews idle activity without extending the absolute expiration', async () => {
    const account = await createAccount();
    const login = await loginAccount(account, account.context);
    const database = app.get(DatabaseService);
    const before = await database.query<{ absolute_expires_at: Date }>(
      `UPDATE auth.sessions SET created_at = now() - interval '1 hour',
         last_seen_at = now() - interval '29 minutes'
       WHERE token_hash = $1 RETURNING absolute_expires_at`,
      [sessionHash(login.cookies)],
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', login.cookies)
      .expect(200);
    const after = await database.query<{
      absolute_expires_at: Date;
      recently_active: boolean;
    }>(
      `SELECT absolute_expires_at, last_seen_at > now() - interval '10 seconds'
         AS recently_active FROM auth.sessions WHERE token_hash = $1`,
      [sessionHash(login.cookies)],
    );
    expect(after.rows[0].recently_active).toBe(true);
    expect(after.rows[0].absolute_expires_at).toEqual(
      before.rows[0].absolute_expires_at,
    );
  });

  it.each(['idle', 'absolute'])(
    'rejects a session after %s expiration',
    async (kind) => {
      const account = await createAccount();
      const login = await loginAccount(account, account.context);
      const sql =
        kind === 'idle'
          ? `UPDATE auth.sessions SET created_at = now() - interval '1 hour',
           last_seen_at = now() - interval '31 minutes' WHERE token_hash = $1`
          : `UPDATE auth.sessions SET created_at = now() - interval '13 hours',
           absolute_expires_at = now() - interval '1 second' WHERE token_hash = $1`;
      await app.get(DatabaseService).query(sql, [sessionHash(login.cookies)]);
      await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', login.cookies)
        .expect(401);
    },
  );

  it.each(['/login', '/logout'])(
    'requires CSRF and an allowed origin for %s',
    async (path) => {
      const context = await getCsrfContext();
      await request(app.getHttpServer())
        .post(`/api/v1/auth${path}`)
        .set('Origin', appOrigin)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/auth${path}`)
        .set('Origin', 'https://other.example.com')
        .set('Cookie', context.cookies)
        .set('X-CSRF-Token', context.token)
        .send({})
        .expect(403);
    },
  );

  it('limits login attempts per account and returns Retry-After', async () => {
    const account = await createAccount();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('Cookie', account.context.cookies)
        .set('X-CSRF-Token', account.context.token)
        .send({ email: account.email, password: 'incorrecta' })
        .expect(401);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', appOrigin)
      .set('Cookie', account.context.cookies)
      .set('X-CSRF-Token', account.context.token)
      .send({ email: account.email.toUpperCase(), password: account.password })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await app
      .get(DatabaseService)
      .query(
        "UPDATE auth.login_attempts SET expires_at = now() - interval '1 second' WHERE bucket = $1",
        [`account:${createHash('sha256').update(account.email).digest('hex')}`],
      );
    await loginAccount(account, account.context);
  });

  it('limits a shared IP even when account names change', async () => {
    const account = await createAccount();
    const otherEmail = `other-${randomUUID()}@example.com`;
    const ip = `e2e-${randomUUID()}`;
    testBuckets.push(`ip:${createHash('sha256').update(ip).digest('hex')}`);
    testBuckets.push(
      `account:${createHash('sha256').update(otherEmail).digest('hex')}`,
    );
    const previousLimit = process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_IP;
    process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_IP = '1';
    let limited: AuthService;
    try {
      limited = new AuthService(
        app.get(DatabaseService),
        app.get(AccountsService),
      );
    } finally {
      if (previousLimit === undefined)
        delete process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_IP;
      else process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_IP = previousLimit;
    }
    const fakeRequest = {
      cookies: {},
      ip,
    } as unknown as import('express').Request;
    const fakeResponse = {
      cookie: () => undefined,
    } as unknown as import('express').Response;
    await expect(
      limited.login(account.email, 'incorrecta', fakeRequest, fakeResponse),
    ).rejects.toThrow('Credenciales no válidas');
    await expect(
      limited.login(otherEmail, 'incorrecta', fakeRequest, fakeResponse),
    ).rejects.toBeInstanceOf(LoginRateLimitException);
  });

  afterEach(async () => {
    try {
      for (const email of authenticationEmails) {
        await app
          .get(DatabaseService)
          .query('DELETE FROM auth.users WHERE email = $1', [email]);
        testBuckets.push(
          `account:${createHash('sha256').update(email).digest('hex')}`,
        );
      }
      if (testBuckets.length > 0) {
        await app
          .get(DatabaseService)
          .query(
            'DELETE FROM auth.login_attempts WHERE bucket = ANY($1::text[])',
            [testBuckets],
          );
      }
    } finally {
      await app.close();
    }
  });
});
