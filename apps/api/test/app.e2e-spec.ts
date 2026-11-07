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

  it('/healthz (GET)', () => {
    return request(app.getHttpServer()).get('/healthz').expect(200).expect({
      status: 'ok',
      service: 'api',
      database: 'up',
    });
  });

  it('registers an account without returning secrets', async () => {
    const email = `e2e-${randomUUID()}@example.com`;

    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
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
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'Una-clave-ficticia-para-pruebas';

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
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
    const email = `invalid-${randomUUID()}`;

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Origin', appOrigin)
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

  it('rejects registration requests without an origin', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({})
      .expect(403);
  });

  it('rejects registration requests from another origin', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://other.example.com')
      .send({})
      .expect(403);
  });

  afterEach(async () => {
    await app.close();
  });
});
