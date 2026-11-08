import {
  Controller,
  Get,
  Req,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthService } from '../src/auth/auth.service';
import {
  BearerGuard,
  type AuthenticatedRequest,
} from '../src/auth/bearer.guard';
import { DatabaseService } from '../src/database/database.service';

// This controller exists only in the test module, not in the application.
@Controller('__test__/auth')
@UseGuards(BearerGuard)
class ProtectedTestController {
  @Get('account')
  identify(@Req() req: AuthenticatedRequest) {
    return { account_id: req.accountId };
  }
}

describe('BearerGuard (HTTP)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  let accountId: string;
  let otherAccountId: string;
  let token: string;
  let otherToken: string;
  const protectedPath = '/__test__/auth/account';
  const unauthorizedBody = {
    statusCode: 401,
    message: 'Credencial académica no válida',
    error: 'Unauthorized',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController, ProtectedTestController],
      providers: [AppService, DatabaseService, AuthService, BearerGuard],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    database = app.get(DatabaseService);
  });

  beforeEach(async () => {
    accountId = randomUUID();
    otherAccountId = randomUUID();
    token = randomBytes(32).toString('hex');
    otherToken = randomBytes(32).toString('hex');
    await database.query(
      `INSERT INTO academic.accounts (id, name, token_hash)
       VALUES ($1, 'Guard HTTP test A', $2), ($3, 'Guard HTTP test B', $4)`,
      [
        accountId,
        createHash('sha256').update(token).digest('hex'),
        otherAccountId,
        createHash('sha256').update(otherToken).digest('hex'),
      ],
    );
  });

  afterEach(async () => {
    await database.query('DELETE FROM academic.accounts WHERE id IN ($1, $2)', [
      accountId,
      otherAccountId,
    ]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('identifies each account from its token and ignores client-supplied account IDs', async () => {
    await request(app.getHttpServer())
      .get(protectedPath)
      .query({ account_id: otherAccountId })
      .set('Authorization', `Bearer ${token}`)
      .set('X-Account-Id', otherAccountId)
      .expect(200)
      .expect({ account_id: accountId });

    await request(app.getHttpServer())
      .get(protectedPath)
      .set('Authorization', `bearer ${otherToken}`)
      .expect(200)
      .expect({ account_id: otherAccountId });
  });

  it('keeps the healthcheck accessible without credentials', async () => {
    await request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect({ status: 'ok', service: 'academic', database: 'up' });
  });

  it.each([
    { label: 'missing header', header: undefined },
    { label: 'another scheme', header: 'Basic credential' },
    { label: 'missing token', header: 'Bearer' },
    { label: 'extra parts', header: `Bearer ${'a'.repeat(64)} extra` },
    { label: 'malformed token', header: 'Bearer abc' },
  ])(
    'rejects $label with the same generic 401 response',
    async ({ header }) => {
      const pending = request(app.getHttpServer()).get(protectedPath);
      if (header !== undefined) pending.set('Authorization', header);
      await pending.expect(401).expect(unauthorizedBody);
    },
  );

  it('rejects a well-formed unknown credential', async () => {
    await request(app.getHttpServer())
      .get(protectedPath)
      .set('Authorization', `Bearer ${randomBytes(32).toString('hex')}`)
      .expect(401)
      .expect(unauthorizedBody);
  });

  it('rejects a disabled account without revealing whether its credential exists', async () => {
    await database.query(
      'UPDATE academic.accounts SET enabled = false WHERE id = $1',
      [accountId],
    );

    await request(app.getHttpServer())
      .get(protectedPath)
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect(unauthorizedBody);
  });

  it.each(['query', 'cookie'])(
    'does not accept a credential supplied through a %s',
    async (location) => {
      const pending = request(app.getHttpServer()).get(protectedPath);
      if (location === 'query') pending.query({ access_token: token });
      else pending.set('Cookie', `access_token=${token}`);
      await pending.expect(401).expect(unauthorizedBody);
    },
  );
});
