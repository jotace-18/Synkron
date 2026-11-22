import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';

interface RunCounts {
  read_count: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  retired_count: number;
  ignored_count: number;
}

interface RunRow extends RunCounts {
  id: string;
  status: string;
  finished_at: Date | null;
}

type RawCounts = { [Field in keyof RunCounts]: number | null };
type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

describe('Sync run counts (PostgreSQL integration)', () => {
  const createdAt = '2000-01-01T00:00:00.000Z';
  const startedAt = '2000-01-01T01:00:00.000Z';
  const finishedAt = '2000-01-01T02:00:00.000Z';
  const zeroCounts: RunCounts = {
    read_count: 0,
    created_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    retired_count: 0,
    ignored_count: 0,
  };
  const fields = [
    'read_count',
    'created_count',
    'updated_count',
    'unchanged_count',
    'retired_count',
    'ignored_count',
  ] as const;
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
       VALUES ($1, 'Run counts test', 'http://academic:3000/api/v1/assignments/export', 'none')
       RETURNING id`,
      [owner],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Run counts test', 'academic.assignments', 'assignments') RETURNING id`,
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
    overrides: Partial<RawCounts> = {},
    status: RunStatus = 'running',
  ): Promise<RunRow> {
    const counts: RawCounts = { ...zeroCounts, ...overrides };
    const result = await database.query<RunRow>(
      `INSERT INTO sync.runs (
         tenant_id, definition_id, status, created_at, started_at, finished_at,
         read_count, created_count, updated_count, unchanged_count, retired_count, ignored_count,
         error_code, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        owner,
        definitionId,
        status,
        createdAt,
        status === 'queued' ? null : startedAt,
        status === 'completed' || status === 'failed' ? finishedAt : null,
        ...fields.map((field) => counts[field]),
        status === 'failed' ? 'source_error' : null,
        status === 'failed'
          ? 'No se pudieron obtener datos válidos de la fuente.'
          : null,
      ],
    );
    return result.rows[0];
  }

  async function stored(id: string): Promise<RunRow> {
    const result = await database.query<RunRow>(
      'SELECT * FROM sync.runs WHERE tenant_id = $1 AND id = $2',
      [owner, id],
    );
    return result.rows[0];
  }

  it('initializes every counter to zero when a queued run is created without results', async () => {
    const result = await database.query<RunRow>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING *',
      [owner, definitionId],
    );
    expect(result.rows[0]).toMatchObject({ status: 'queued', ...zeroCounts });
  });

  it('stores a complete mixed result including retirements and ignored records', async () => {
    const counts: RunCounts = {
      read_count: 10,
      created_count: 2,
      updated_count: 2,
      unchanged_count: 3,
      retired_count: 1,
      ignored_count: 2,
    };
    expect(await insertRun(counts, 'completed')).toMatchObject({
      status: 'completed',
      ...counts,
    });
  });

  it.each([
    'created_count',
    'updated_count',
    'unchanged_count',
    'retired_count',
    'ignored_count',
  ] as const)(
    'counts %s as a processed record in a completed execution',
    async (field) => {
      const run = await insertRun({ read_count: 1, [field]: 1 }, 'completed');
      expect(run.read_count).toBe(1);
      expect(run[field]).toBe(1);
    },
  );

  it.each(['running', 'failed'] as const)(
    'allows a partial result while the run is %s',
    async (status) => {
      const counts = { read_count: 10, created_count: 2, updated_count: 1 };
      expect(await insertRun(counts, status)).toMatchObject({
        status,
        ...counts,
      });
    },
  );

  it('allows an empty completed execution', async () => {
    expect(await insertRun({}, 'completed')).toMatchObject({
      status: 'completed',
      ...zeroCounts,
    });
  });

  it.each(fields)('rejects a negative %s', async (field) => {
    await expect(
      insertRun({ read_count: 5, [field]: -1 }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(fields)(
    'rejects a fractional %s instead of rounding it',
    async (field) => {
      await expect(
        insertRun({ read_count: 5, [field]: 1.5 }),
      ).rejects.toMatchObject({ code: '22P02' });
    },
  );

  it.each(fields)('rejects an explicit null %s', async (field) => {
    await expect(
      insertRun({ read_count: 5, [field]: null }),
    ).rejects.toMatchObject({ code: '23502', column: field });
  });

  it('rejects reporting more processed records than were read', async () => {
    await expect(
      insertRun({ read_count: 2, created_count: 1, updated_count: 2 }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_counts_balance_valid',
    });
  });

  it('rejects a completed run with records still unaccounted for', async () => {
    await expect(
      insertRun({ read_count: 3, created_count: 1 }, 'completed'),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_completed_counts_valid',
    });
  });

  it('accepts valid counters at the PostgreSQL integer boundary', async () => {
    const run = await insertRun(
      { read_count: 2147483647, created_count: 2147483647 },
      'completed',
    );
    expect(run.read_count).toBe(2147483647);
    expect(run.created_count).toBe(2147483647);
  });

  it('safely rejects a combined total beyond the integer boundary without an arithmetic overflow', async () => {
    await expect(
      insertRun({
        read_count: 2147483647,
        created_count: 2147483647,
        updated_count: 2147483647,
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_counts_balance_valid',
    });
  });

  it('rejects a counter value outside the supported integer range', async () => {
    await expect(insertRun({ read_count: 2147483648 })).rejects.toMatchObject({
      code: '22003',
    });
  });

  it('keeps the running state and its counters intact if an incomplete result is marked completed', async () => {
    const before = await insertRun({ read_count: 3, created_count: 1 });
    await expect(
      database.query(
        `UPDATE sync.runs SET status = 'completed', finished_at = $3
       WHERE tenant_id = $1 AND id = $2`,
        [owner, before.id, finishedAt],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_completed_counts_valid',
    });
    expect(await stored(before.id)).toEqual(before);
  });

  it('permits completing the run when the state, timestamp and balanced counters are saved together', async () => {
    const before = await insertRun({ read_count: 3, created_count: 1 });
    await database.query(
      `UPDATE sync.runs SET status = 'completed', finished_at = $3, unchanged_count = 2
       WHERE tenant_id = $1 AND id = $2`,
      [owner, before.id, finishedAt],
    );
    expect(await stored(before.id)).toMatchObject({
      id: before.id,
      status: 'completed',
      read_count: 3,
      created_count: 1,
      unchanged_count: 2,
      finished_at: new Date(finishedAt),
    });
  });

  it('retains partial counters when an execution fails', async () => {
    const before = await insertRun({ read_count: 3, created_count: 1 });
    await database.query(
      `UPDATE sync.runs SET status = 'failed', finished_at = $3,
         error_code = 'source_error', error_message = 'No se pudieron obtener datos válidos de la fuente.'
       WHERE tenant_id = $1 AND id = $2`,
      [owner, before.id, finishedAt],
    );
    expect(await stored(before.id)).toMatchObject({
      id: before.id,
      status: 'failed',
      read_count: 3,
      created_count: 1,
      finished_at: new Date(finishedAt),
    });
  });
});
