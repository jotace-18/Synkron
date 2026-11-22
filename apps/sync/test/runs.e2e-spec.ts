import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';

interface RunRow {
  id: string;
  tenant_id: string;
  definition_id: string;
  status: string;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

interface RunInput {
  tenantId: string;
  definitionId: string;
  status: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

describe('Sync runs table (PostgreSQL integration)', () => {
  const createdAt = '2000-01-01T00:00:00.000Z';
  const startedAt = '2000-01-01T01:00:00.000Z';
  const finishedAt = '2000-01-01T02:00:00.000Z';
  let module: TestingModule;
  let database: DatabaseService;
  let owner: string;
  let otherOwner: string;
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
    otherOwner = randomUUID();
    definitionId = await createDefinition(owner);
  });

  afterEach(async () => {
    await database.query('DELETE FROM sync.runs WHERE tenant_id IN ($1, $2)', [
      owner,
      otherOwner,
    ]);
    await database.query(
      'DELETE FROM sync.definitions WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
    await database.query(
      'DELETE FROM sync.connections WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
  });

  afterAll(async () => {
    await module?.close();
  });

  async function createDefinition(tenantId: string): Promise<string> {
    const connection = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Run table test', 'http://academic:3000/api/v1/assignments/export', 'none')
       RETURNING id`,
      [tenantId],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Run table test', 'academic.assignments', 'assignments') RETURNING id`,
      [tenantId, connection.rows[0].id],
    );
    return definition.rows[0].id;
  }

  async function insertRun(overrides: Partial<RunInput> = {}): Promise<RunRow> {
    const input: RunInput = {
      tenantId: owner,
      definitionId,
      status: 'queued',
      createdAt,
      startedAt: null,
      finishedAt: null,
      ...overrides,
    };
    const result = await database.query<RunRow>(
      `INSERT INTO sync.runs (tenant_id, definition_id, status, created_at, started_at, finished_at, error_code, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        input.tenantId,
        input.definitionId,
        input.status,
        input.createdAt,
        input.startedAt,
        input.finishedAt,
        input.status === 'failed' ? 'source_error' : null,
        input.status === 'failed'
          ? 'No se pudieron obtener datos válidos de la fuente.'
          : null,
      ],
    );
    return result.rows[0];
  }

  it('creates a queued run by default with a fresh ID and no start or finish time', async () => {
    const result = await database.query<RunRow>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING *',
      [owner, definitionId],
    );
    const run = result.rows[0];
    expect(run.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    );
    expect(run).toMatchObject({
      tenant_id: owner,
      definition_id: definitionId,
      status: 'queued',
      started_at: null,
      finished_at: null,
    });
    expect(run.created_at).toBeInstanceOf(Date);
  });

  it.each([
    { status: 'queued', startedAt: null, finishedAt: null },
    { status: 'running', startedAt, finishedAt: null },
    { status: 'completed', startedAt, finishedAt },
    { status: 'failed', startedAt, finishedAt },
  ])('accepts coherent timestamps for $status', async (state) => {
    const run = await insertRun(state);
    expect(run.status).toBe(state.status);
    expect(run.created_at).toEqual(new Date(createdAt));
    expect(run.started_at).toEqual(
      state.startedAt === null ? null : new Date(state.startedAt),
    );
    expect(run.finished_at).toEqual(
      state.finishedAt === null ? null : new Date(state.finishedAt),
    );
  });

  it.each(['completed', 'failed'])(
    'permits a zero-duration %s result',
    async (status) => {
      const run = await insertRun({ status, startedAt, finishedAt: startedAt });
      expect(run.started_at).toEqual(run.finished_at);
    },
  );

  it.each([
    {
      label: 'queued with a start',
      status: 'queued',
      startedAt,
      finishedAt: null,
    },
    {
      label: 'queued with only a finish',
      status: 'queued',
      startedAt: null,
      finishedAt,
    },
    {
      label: 'queued with both times',
      status: 'queued',
      startedAt,
      finishedAt,
    },
    {
      label: 'running without a start',
      status: 'running',
      startedAt: null,
      finishedAt: null,
    },
    {
      label: 'running with a finish',
      status: 'running',
      startedAt,
      finishedAt,
    },
    {
      label: 'completed without a start',
      status: 'completed',
      startedAt: null,
      finishedAt,
    },
    {
      label: 'completed without a finish',
      status: 'completed',
      startedAt,
      finishedAt: null,
    },
    {
      label: 'failed without a start',
      status: 'failed',
      startedAt: null,
      finishedAt,
    },
    {
      label: 'failed without a finish',
      status: 'failed',
      startedAt,
      finishedAt: null,
    },
  ])(
    'rejects $label',
    async ({ status, startedAt: start, finishedAt: finish }) => {
      await expect(
        insertRun({ status, startedAt: start, finishedAt: finish }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_state_dates_valid',
      });
    },
  );

  it.each(['paused', 'retry_wait', ''])(
    'rejects an unsupported status: %j',
    async (status) => {
      await expect(insertRun({ status })).rejects.toMatchObject({
        code: '23514',
      });
    },
  );

  it('rejects an explicit null status rather than allowing SQL null checks to bypass the state rules', async () => {
    await expect(insertRun({ status: null })).rejects.toMatchObject({
      code: '23502',
      column: 'status',
    });
  });

  it.each([
    {
      label: 'running before creation',
      status: 'running',
      startedAt: '1999-12-31T23:00:00Z',
      finishedAt: null,
    },
    {
      label: 'completed with start before creation',
      status: 'completed',
      startedAt: '1999-12-31T23:00:00Z',
      finishedAt,
    },
    {
      label: 'completed with finish before start',
      status: 'completed',
      startedAt,
      finishedAt: createdAt,
    },
    {
      label: 'failed with finish before start',
      status: 'failed',
      startedAt,
      finishedAt: createdAt,
    },
  ])(
    'rejects $label',
    async ({ status, startedAt: start, finishedAt: finish }) => {
      await expect(
        insertRun({ status, startedAt: start, finishedAt: finish }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_time_order_valid',
      });
    },
  );

  it('rejects using another owner definition', async () => {
    await expect(insertRun({ tenantId: otherOwner })).rejects.toMatchObject({
      code: '23503',
      constraint: 'runs_definition_fk',
    });
  });

  it('rejects a definition that does not exist', async () => {
    await expect(
      insertRun({ definitionId: randomUUID() }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'runs_definition_fk',
    });
  });

  it('allows separate executions of one definition and keeps owners and definitions independent', async () => {
    const anotherDefinition = await createDefinition(owner);
    const foreignDefinition = await createDefinition(otherOwner);
    const runs = [
      await insertRun(),
      await insertRun(),
      await insertRun({ definitionId: anotherDefinition }),
      await insertRun({
        tenantId: otherOwner,
        definitionId: foreignDefinition,
      }),
    ];
    expect(new Set(runs.map((run) => run.id)).size).toBe(4);
  });

  it('prevents deleting a definition that has run history', async () => {
    await insertRun();
    await expect(
      database.query(
        'DELETE FROM sync.definitions WHERE tenant_id = $1 AND id = $2',
        [owner, definitionId],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'runs_definition_fk',
    });
  });

  it('rejects an invalid state update without changing the saved run', async () => {
    const run = await insertRun();
    await expect(
      database.query(
        'UPDATE sync.runs SET status = $3 WHERE tenant_id = $1 AND id = $2',
        [owner, run.id, 'running'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_state_dates_valid',
    });
    const stored = await database.query<RunRow>(
      'SELECT * FROM sync.runs WHERE tenant_id = $1 AND id = $2',
      [owner, run.id],
    );
    expect(stored.rows[0]).toEqual(run);
  });

  it('stores the queued, running and completed states with coherent lifecycle timestamps', async () => {
    const run = await insertRun();
    const running = await database.query<RunRow>(
      `UPDATE sync.runs SET status = 'running', started_at = $3
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [owner, run.id, startedAt],
    );
    expect(running.rows[0]).toMatchObject({
      id: run.id,
      status: 'running',
      started_at: new Date(startedAt),
      finished_at: null,
    });
    const completed = await database.query<RunRow>(
      `UPDATE sync.runs SET status = 'completed', finished_at = $3
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [owner, run.id, finishedAt],
    );
    expect(completed.rows[0]).toMatchObject({
      id: run.id,
      status: 'completed',
      created_at: new Date(createdAt),
      started_at: new Date(startedAt),
      finished_at: new Date(finishedAt),
    });
  });
});
