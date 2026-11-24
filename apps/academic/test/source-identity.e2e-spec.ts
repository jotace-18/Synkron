import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';

describe('Personal source accounts, browser sessions and revocable read-only connections (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  const email = `identity-${randomUUID()}@example.test`,
    otherEmail = `identity-${randomUUID()}@example.test`;
  const password = 'A personal password for integration';
  const old = {
    secret: process.env.CSRF_SECRET,
    origins: process.env.SOURCE_APP_ORIGINS,
    secure: process.env.SOURCE_COOKIE_SECURE,
  };
  const origin = 'http://localhost:3105';
  beforeAll(async () => {
    process.env.CSRF_SECRET = 'e'.repeat(64);
    process.env.SOURCE_APP_ORIGINS = origin;
    process.env.SOURCE_COOKIE_SECURE = 'false';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get(DatabaseService);
  });
  afterAll(async () => {
    if (database) {
      await database.query(
        'DELETE FROM academic.assignments WHERE account_id IN (SELECT id FROM academic.accounts WHERE email=ANY($1::text[]))',
        [[email, otherEmail]],
      );
      await database.query(
        'DELETE FROM academic.accounts WHERE email=ANY($1::text[])',
        [[email, otherEmail]],
      );
    }
    if (app) await app.close();
    for (const [key, value] of [
      ['CSRF_SECRET', old.secret],
      ['SOURCE_APP_ORIGINS', old.origins],
      ['SOURCE_COOKIE_SECURE', old.secure],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  });
  function browser() {
    const cookies = new Map<string, string>();
    function keep(response: Response) {
      const values: unknown = response.headers['set-cookie'];
      if (Array.isArray(values))
        for (const cookie of values)
          if (typeof cookie === 'string') {
            const pair = cookie.split(';')[0];
            const index = pair.indexOf('=');
            cookies.set(pair.slice(0, index), pair.slice(index + 1));
          }
    }
    const header = () =>
      [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    return {
      header,
      async call(
        method: 'get' | 'post' | 'delete',
        path: string,
        body?: object,
      ) {
        let csrf: string | undefined;
        if (method !== 'get') {
          const response = await request(app.getHttpServer())
            .get('/api/v1/auth/csrf')
            .set('Cookie', header())
            .expect(200);
          keep(response);
          csrf = (response.body as { csrf_token: string }).csrf_token;
        }
        const operation = request(app.getHttpServer())
          [method](path)
          .set('Cookie', header());
        if (csrf) operation.set('Origin', origin).set('X-CSRF-Token', csrf);
        if (body) operation.send(body);
        const response = await operation;
        keep(response);
        return response;
      },
    };
  }
  it('isolates two users, requires CSRF, preserves sessions and revokes export-only credentials', async () => {
    const first = browser(),
      second = browser();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(403);
    expect(
      (await first.call('post', '/api/v1/auth/register', { email, password }))
        .status,
    ).toBe(201);
    expect(
      (
        await second.call('post', '/api/v1/auth/register', {
          email: otherEmail,
          password,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await first.call('post', '/api/v1/auth/login', {
          email,
          password: 'wrong',
        })
      ).status,
    ).toBe(401);
    expect(
      (await first.call('post', '/api/v1/auth/login', { email, password }))
        .status,
    ).toBe(200);
    expect(
      (
        await second.call('post', '/api/v1/auth/login', {
          email: otherEmail,
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      (await first.call('get', '/api/v1/auth/session')).body as unknown,
    ).toMatchObject({ email });
    const stored = await database.query<{ password_hash: string }>(
      'SELECT password_hash FROM academic.accounts WHERE email=$1',
      [email],
    );
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].password_hash).not.toContain(password);
    const data = {
      title: 'Private assignment',
      course_name: 'Identity test',
      section: 'theory',
      mandatory: true,
      due_date: '2030-01-01',
      work_mode: 'individual',
      group_members: [],
    };
    const created = await first.call('post', '/api/v1/assignments', data);
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    expect((await second.call('get', `/api/v1/assignments/${id}`)).status).toBe(
      404,
    );
    expect(
      (await second.call('get', '/api/v1/assignments')).body as unknown,
    ).toEqual([]);
    const credential = await first.call('post', '/api/v1/auth/tokens', {
      name: 'My Synkron',
    });
    expect(credential.status).toBe(201);
    const token = (credential.body as { token: string }).token,
      tokenId = (credential.body as { id: string }).id;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const listed = await first.call('get', '/api/v1/auth/tokens');
    expect(JSON.stringify(listed.body)).not.toContain(token);
    expect(
      (await second.call('get', '/api/v1/auth/tokens')).body as unknown,
    ).toEqual([]);
    expect(
      (await second.call('delete', `/api/v1/auth/tokens/${tokenId}`)).status,
    ).toBe(404);
    await request(app.getHttpServer())
      .get('/api/v1/assignments/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${token}`)
      .send(data)
      .expect(401);
    expect(
      (await first.call('get', '/api/v1/assignments/export/')).status,
    ).toBe(401);
    expect(
      (await first.call('delete', `/api/v1/auth/tokens/${tokenId}`)).status,
    ).toBe(204);
    await request(app.getHttpServer())
      .get('/api/v1/assignments/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const oldCookies = first.header();
    expect((await first.call('post', '/api/v1/auth/logout')).status).toBe(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', oldCookies)
      .expect(401);
    expect((await second.call('get', '/api/v1/auth/session')).status).toBe(200);
    await database.query(
      `UPDATE academic.browser_sessions SET expires_at=now()-interval '1 minute' WHERE account_id=(SELECT id FROM academic.accounts WHERE email=$1)`,
      [otherEmail],
    );
    expect((await second.call('get', '/api/v1/auth/session')).status).toBe(401);
  });
});
