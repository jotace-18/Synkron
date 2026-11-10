import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadGatewayException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { toSafeRunError } from '../src/runs/sync-run-error';

type RunStatus = 'queued' | 'running' | 'completed' | 'failed';
interface ErrorInput {
  status: RunStatus;
  code: string | null;
  message: string | null;
}
interface RunRow {
  id: string;
  status: RunStatus;
  error_code: string | null;
  error_message: string | null;
}

describe('Sync run errors (PostgreSQL integration)', () => {
  const createdAt = '2000-01-01T00:00:00.000Z';
  const startedAt = '2000-01-01T01:00:00.000Z';
  const finishedAt = '2000-01-01T02:00:00.000Z';
  const safeMessage = 'No se pudieron obtener datos válidos de la fuente.';
  let module: TestingModule;
  let database: DatabaseService;
  let owner: string;
  let definitionId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
  });

  beforeEach(async () => {
    owner = randomUUID();
    const connection = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Run errors test', 'http://academic:3000/api/v1/assignments/export', 'none') RETURNING id`,
      [owner],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Run errors test', 'academic.assignments', 'assignments') RETURNING id`,
      [owner, connection.rows[0].id],
    );
    definitionId = definition.rows[0].id;
  });

  afterEach(async () => {
    await database.query('DELETE FROM sync.runs WHERE tenant_id = $1', [owner]);
    await database.query('DELETE FROM sync.definitions WHERE tenant_id = $1', [
      owner,
    ]);
    await database.query('DELETE FROM sync.connections WHERE tenant_id = $1', [
      owner,
    ]);
  });

  afterAll(async () => {
    await module?.close();
  });

  async function insertRun(
    overrides: Partial<ErrorInput> = {},
  ): Promise<RunRow> {
    const status = overrides.status ?? 'failed';
    const input: ErrorInput = {
      status,
      code: status === 'failed' ? 'source_error' : null,
      message: status === 'failed' ? safeMessage : null,
      ...overrides,
    };
    const result = await database.query<RunRow>(
      `INSERT INTO sync.runs (
         tenant_id, definition_id, status, created_at, started_at, finished_at, error_code, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        owner,
        definitionId,
        status,
        createdAt,
        status === 'queued' ? null : startedAt,
        status === 'failed' || status === 'completed' ? finishedAt : null,
        input.code,
        input.message,
      ],
    );
    return result.rows[0];
  }

  it('initializes an accepted queued execution without an error', async () => {
    const result = await database.query<RunRow>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING *',
      [owner, definitionId],
    );
    expect(result.rows[0]).toMatchObject({
      status: 'queued',
      error_code: null,
      error_message: null,
    });
  });

  it.each(['queued', 'running', 'completed'] as const)(
    'accepts empty error fields while the state is %s',
    async (status) => {
      expect(await insertRun({ status })).toMatchObject({
        status,
        error_code: null,
        error_message: null,
      });
    },
  );

  it('stores a safe code and message on a failed execution', async () => {
    expect(await insertRun()).toMatchObject({
      status: 'failed',
      error_code: 'source_error',
      error_message: safeMessage,
    });
  });

  it.each([{ code: null, message: null }, { code: null }, { message: null }])(
    'rejects a failed execution with incomplete error information: %j',
    async (error) => {
      await expect(insertRun(error)).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_error_valid',
      });
    },
  );

  it.each([
    '',
    'SourceError',
    'source-error',
    '123error',
    'source error',
    '_source_error',
  ])('rejects an invalid machine-readable code: %j', async (code) => {
    await expect(insertRun({ code })).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_error_valid',
    });
  });

  it.each(['', '   '])(
    'rejects an empty error message: %j',
    async (message) => {
      await expect(insertRun({ message })).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_error_valid',
      });
    },
  );

  it('accepts an error code of exactly 64 characters', async () => {
    expect((await insertRun({ code: 'a'.repeat(64) })).error_code).toHaveLength(
      64,
    );
  });

  it('rejects an error code longer than 64 characters', async () => {
    await expect(insertRun({ code: 'a'.repeat(65) })).rejects.toMatchObject({
      code: '22001',
    });
  });

  it('accepts a message of exactly 500 characters', async () => {
    expect(
      (await insertRun({ message: 'a'.repeat(500) })).error_message,
    ).toHaveLength(500);
  });

  it('rejects a message longer than 500 characters', async () => {
    await expect(insertRun({ message: 'a'.repeat(501) })).rejects.toMatchObject(
      { code: '22001' },
    );
  });

  it.each(['queued', 'running', 'completed'] as const)(
    'rejects error information on a %s execution',
    async (status) => {
      await expect(
        insertRun({ status, code: 'source_error', message: safeMessage }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_error_valid',
      });
    },
  );

  it.each([
    { code: 'source_error', message: null },
    { code: null, message: safeMessage },
  ])(
    'rejects a partial error attached to a running execution: %j',
    async (error) => {
      await expect(
        insertRun({ status: 'running', ...error }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_error_valid',
      });
    },
  );

  it('stores the normalized failure without the original response, SQL or credentials', async () => {
    const marker = 'PRIVATE_SOURCE_TOKEN_AND_RESPONSE';
    const safe = toSafeRunError(
      new BadGatewayException({ message: marker, token: marker }),
    );
    const run = await insertRun(safe);
    expect(run).toMatchObject({
      error_code: 'source_error',
      error_message: safeMessage,
    });
    expect(JSON.stringify(run)).not.toContain(marker);
  });

  it('keeps an execution running if a failed state is saved without its error information', async () => {
    const before = await insertRun({ status: 'running' });
    await expect(
      database.query(
        `UPDATE sync.runs SET status = 'failed', finished_at = $3
       WHERE tenant_id = $1 AND id = $2`,
        [owner, before.id, finishedAt],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'runs_error_valid' });
    const after = await database.query<RunRow>(
      'SELECT * FROM sync.runs WHERE tenant_id = $1 AND id = $2',
      [owner, before.id],
    );
    expect(after.rows[0]).toEqual(before);
  });

  it('permits saving the failed state, finish time and safe error together', async () => {
    const before = await insertRun({ status: 'running' });
    const safe = toSafeRunError(
      new BadGatewayException('PRIVATE_INTERNAL_DETAILS'),
    );
    await database.query(
      `UPDATE sync.runs SET status = 'failed', finished_at = $3, error_code = $4, error_message = $5
       WHERE tenant_id = $1 AND id = $2`,
      [owner, before.id, finishedAt, safe.code, safe.message],
    );
    const after = await database.query<RunRow>(
      'SELECT * FROM sync.runs WHERE tenant_id = $1 AND id = $2',
      [owner, before.id],
    );
    expect(after.rows[0]).toMatchObject({
      id: before.id,
      status: 'failed',
      error_code: safe.code,
      error_message: safe.message,
    });
  });

  it('applies the actual error migration to legacy failed rows without inventing private details', async () => {
    const migration = readFileSync(
      join(__dirname, '../migrations/007_add_run_errors.sql'),
      'utf8',
    ).replaceAll('sync.runs', 'pg_temp.run_errors_migration_fixture');
    await database.transaction(async (client) => {
      await client.query(
        'CREATE TEMP TABLE run_errors_migration_fixture (status text NOT NULL) ON COMMIT DROP',
      );
      await client.query(
        "INSERT INTO pg_temp.run_errors_migration_fixture (status) VALUES ('failed'), ('completed'), ('queued'), ('running')",
      );
      await client.query(migration);
      const result = await client.query<{
        status: string;
        error_code: string | null;
        error_message: string | null;
      }>(
        'SELECT status, error_code, error_message FROM pg_temp.run_errors_migration_fixture ORDER BY status',
      );
      expect(result.rows).toEqual([
        { status: 'completed', error_code: null, error_message: null },
        {
          status: 'failed',
          error_code: 'unknown_error',
          error_message: 'La ejecución falló sin detalles registrados.',
        },
        { status: 'queued', error_code: null, error_message: null },
        { status: 'running', error_code: null, error_message: null },
      ]);
    });
  });
});
