import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { RunJobsService } from '../src/messaging/run-jobs.service';
import type { SyncRunMessage } from '../src/messaging/sync-run-message';
import { RunsService } from '../src/runs/runs.service';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

interface StoredJob {
  run_id: string;
  created_at: Date;
  published_at: Date | null;
}

describe('Pending run publication (PostgreSQL, simulated broker)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let runs: RunsService;
  let owners: string[];
  let definitions: string[];
  let service: RunJobsService;
  const publish = jest.fn<Promise<void>, [SyncRunMessage]>();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, RunsService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    runs = module.get(RunsService);
  });

  beforeEach(async () => {
    owners = [randomUUID(), randomUUID()];
    definitions = [];
    publish.mockReset().mockResolvedValue(undefined);
    for (const owner of owners) {
      const source = await database.query<{ id: string }>(
        `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type, credentials_encrypted)
         VALUES ($1, 'Publisher fixture', 'http://academic:3000/api/v1/assignments/export', 'bearer', 'fixture-not-a-real-credential') RETURNING id`,
        [owner],
      );
      const definition = await database.query<{ id: string }>(
        `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
         VALUES ($1, $2, 'Publisher fixture', 'academic.assignments', 'assignments') RETURNING id`,
        [owner, source.rows[0].id],
      );
      definitions.push(definition.rows[0].id);
    }
    service = scopedService();
  });

  afterEach(async () => {
    await database.query(
      'DELETE FROM sync.runs WHERE tenant_id = ANY($1::uuid[])',
      [owners],
    );
    await database.query(
      'DELETE FROM sync.definitions WHERE tenant_id = ANY($1::uuid[])',
      [owners],
    );
    await database.query(
      'DELETE FROM sync.connections WHERE tenant_id = ANY($1::uuid[])',
      [owners],
    );
  });
  afterAll(async () => {
    await module?.close();
  });

  function scopedService(failUpdate = false): RunJobsService {
    // The production publisher scans every account. Add ONLY a fixture scope at
    // the database boundary so this suite cannot publish a real user's jobs.
    // Ordering, LIMIT, row locks, SKIP LOCKED, UPDATE and transactions are real.
    return new RunJobsService({
      transaction: <T>(operation: (client: PoolClient) => Promise<T>) =>
        database.transaction((client) =>
          operation({
            query: (sql: string, values?: unknown[]) => {
              if (sql.includes('FROM sync.run_jobs')) {
                const predicate = 'WHERE published_at IS NULL';
                if (!sql.includes(predicate))
                  throw new Error('Missing safe fixture selection point');
                return client.query(
                  sql.replace(
                    predicate,
                    `${predicate} AND tenant_id = ANY($1::uuid[])`,
                  ),
                  [owners],
                );
              }
              if (failUpdate && sql.includes('UPDATE sync.run_jobs')) {
                // Real PostgreSQL constraint violation after the simulated broker
                // confirmed reception. No triggers or shared schema changes.
                return client.query(
                  sql.replace('clock_timestamp()', "'1900-01-01'::timestamptz"),
                  values,
                );
              }
              return client.query(sql, values);
            },
          } as unknown as PoolClient),
        ),
    } as DatabaseService);
  }

  async function createJob(index = 0): Promise<string> {
    return (await runs.createQueued(owners[index], definitions[index])).id;
  }
  async function stored(runId: string): Promise<StoredJob> {
    return (
      await database.query<StoredJob>(
        'SELECT run_id, created_at, published_at FROM sync.run_jobs WHERE tenant_id = ANY($1::uuid[]) AND run_id = $2',
        [owners, runId],
      )
    ).rows[0];
  }

  it('returns false without calling the sender when the fixture has no pending jobs', async () => {
    await expect(service.publishNext(publish)).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes the owned message, records confirmation and leaves execution processing to the worker', async () => {
    const id = await createJob();
    await expect(service.publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls).toEqual([
      [{ schema_version: 1, run_id: id, tenant_id: owners[0] }],
    ]);
    const job = await stored(id);
    expect(job.published_at).toBeInstanceOf(Date);
    expect(job.published_at!.getTime()).toBeGreaterThanOrEqual(
      job.created_at.getTime(),
    );
    expect((await runs.get(owners[0], id)).status).toBe('queued');
    const activities = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.activities WHERE tenant_id = ANY($1::uuid[])',
      [owners],
    );
    expect(activities.rows[0].count).toBe(0);
  });

  it('does not send already published work again on a subsequent pass', async () => {
    const id = await createJob();
    await service.publishNext(publish);
    const before = await stored(id);
    await expect(service.publishNext(publish)).resolves.toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await stored(id)).toEqual(before);
  });

  it('selects the oldest pending work and preserves the account associated with each job', async () => {
    const recent = await createJob();
    const oldest = await createJob(1);
    await database.query(
      `UPDATE sync.run_jobs SET created_at = '2000-01-01' WHERE run_id = $1 AND tenant_id = $2`,
      [oldest, owners[1]],
    );
    await service.publishNext(publish);
    await service.publishNext(publish);
    expect(publish.mock.calls).toEqual([
      [{ schema_version: 1, run_id: oldest, tenant_id: owners[1] }],
      [{ schema_version: 1, run_id: recent, tenant_id: owners[0] }],
    ]);
  });

  it('uses the run identity as a stable tie-breaker for equal creation times', async () => {
    const ids = [await createJob(), await createJob()];
    await database.query(
      `UPDATE sync.run_jobs SET created_at = '2000-01-01' WHERE tenant_id = $1`,
      [owners[0]],
    );
    await service.publishNext(publish);
    await service.publishNext(publish);
    expect(publish.mock.calls.map(([message]) => message.run_id)).toEqual(
      ids.sort(),
    );
  });

  it('does not expose publication before confirmation and lets another publisher skip the held job', async () => {
    const id = await createJob();
    const entered = deferred();
    const confirmed = deferred();
    const held = service.publishNext(() => {
      entered.resolve();
      return confirmed.promise;
    });
    try {
      await entered.promise;
      expect((await stored(id)).published_at).toBeNull();
      await expect(scopedService().publishNext(publish)).resolves.toBe(false);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      confirmed.resolve();
      await held;
    }
    expect((await stored(id)).published_at).toBeInstanceOf(Date);
  });

  it('allows a second publisher to process different work while the first waits for broker confirmation', async () => {
    const ids = [await createJob(), await createJob(1)];
    const entered = deferred();
    const confirmed = deferred();
    let firstId: string | undefined;
    const held = service.publishNext((message) => {
      firstId = message.run_id;
      entered.resolve();
      return confirmed.promise;
    });
    try {
      await entered.promise;
      await expect(scopedService().publishNext(publish)).resolves.toBe(true);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls[0][0].run_id).not.toBe(firstId);
      expect(ids).toContain(publish.mock.calls[0][0].run_id);
      expect((await stored(firstId!)).published_at).toBeNull();
    } finally {
      confirmed.resolve();
      await held;
    }
    for (const id of ids)
      expect((await stored(id)).published_at).toBeInstanceOf(Date);
  });

  it('rolls back a failed send and releases the row so the same job can be retried', async () => {
    const id = await createJob();
    const error = new Error('Broker unavailable');
    publish.mockRejectedValueOnce(error);
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect((await stored(id)).published_at).toBeNull();
    await expect(scopedService().publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls.map(([message]) => message.run_id)).toEqual([
      id,
      id,
    ]);
    expect((await stored(id)).published_at).toBeInstanceOf(Date);
  });

  it('keeps work pending when recording publication fails even after the broker accepted it', async () => {
    const id = await createJob();
    await expect(
      scopedService(true).publishNext(publish),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'run_jobs_publication_date_valid',
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect((await stored(id)).published_at).toBeNull();
    // Delivery is at least once: a broker-confirmed job may be sent again when
    // its PostgreSQL acknowledgement could not commit. The worker must dedupe.
    await expect(service.publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls.map(([message]) => message.run_id)).toEqual([
      id,
      id,
    ]);
  });

  it('never gives the same row simultaneously to several independent publishers', async () => {
    const id = await createJob();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => scopedService().publishNext(publish)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(publish.mock.calls).toEqual([
      [{ schema_version: 1, run_id: id, tenant_id: owners[0] }],
    ]);
  });
});
