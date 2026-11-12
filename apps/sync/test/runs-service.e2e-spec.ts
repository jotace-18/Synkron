import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { RunsService } from '../src/runs/runs.service';

describe('RunsService.createQueued (PostgreSQL integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let service: RunsService;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;
  let definitionId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, RunsService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    service = module.get(RunsService);
  });

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    const source = await createDefinition(owner);
    connectionId = source.connectionId;
    definitionId = source.definitionId;
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

  async function createDefinition(
    tenantId: string,
  ): Promise<{ connectionId: string; definitionId: string }> {
    const source = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type, credentials_encrypted)
       VALUES ($1, 'Queued run test', 'http://academic:3000/api/v1/assignments/export', 'bearer', 'test-credential-placeholder')
       RETURNING id`,
      [tenantId],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Queued run test', 'academic.assignments', 'assignments') RETURNING id`,
      [tenantId, source.rows[0].id],
    );
    return {
      connectionId: source.rows[0].id,
      definitionId: definition.rows[0].id,
    };
  }

  async function count(): Promise<number> {
    const result = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.runs WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
    return result.rows[0].count;
  }

  it('registers a queued execution with empty results, no error and the verified owner', async () => {
    const result = await service.createQueued(owner, definitionId);
    expect(result).toMatchObject({
      definition_id: definitionId,
      status: 'queued',
      started_at: null,
      finished_at: null,
      read_count: 0,
      created_count: 0,
      updated_count: 0,
      unchanged_count: 0,
      retired_count: 0,
      ignored_count: 0,
      error_code: null,
      error_message: null,
    });
    expect(result.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    );
    expect(result.created_at).toBeInstanceOf(Date);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'definition_id',
        'status',
        'created_at',
        'started_at',
        'finished_at',
        'read_count',
        'created_count',
        'updated_count',
        'unchanged_count',
        'retired_count',
        'ignored_count',
        'error_code',
        'error_message',
      ].sort(),
    );
    const stored = await database.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM sync.runs WHERE id = $1',
      [result.id],
    );
    expect(stored.rows[0].tenant_id).toBe(owner);
    const activities = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.activities WHERE tenant_id = $1',
      [owner],
    );
    expect(activities.rows[0].count).toBe(0);
    expect(await count()).toBe(1);
  });

  it('rejects a definition that does not exist without creating a run', async () => {
    await expect(
      service.createQueued(owner, randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await count()).toBe(0);
  });

  it('does not reveal another owner definition or create a run for it', async () => {
    await expect(
      service.createQueued(otherOwner, definitionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await count()).toBe(0);
  });

  it('rejects a disabled definition without creating a run', async () => {
    await database.query(
      'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, definitionId],
    );
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await count()).toBe(0);
  });

  it('checks the current source state and rejects a disabled connection', async () => {
    await database.query(
      'UPDATE sync.connections SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, connectionId],
    );
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await count()).toBe(0);
  });

  it('rejects a source whose Bearer configuration was removed after creating the definition', async () => {
    await database.query(
      `UPDATE sync.connections SET auth_type = 'none', credentials_encrypted = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [owner, connectionId],
    );
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await count()).toBe(0);
  });

  it('records separate internal requests as separate executions without replacing their history', async () => {
    const first = await service.createQueued(owner, definitionId);
    const second = await service.createQueued(owner, definitionId);
    expect(second.id).not.toBe(first.id);
    expect(first.status).toBe('queued');
    expect(second.status).toBe('queued');
    expect(await count()).toBe(2);
  });

  it('keeps owners and definitions independent', async () => {
    const another = await createDefinition(owner);
    const foreign = await createDefinition(otherOwner);
    const runs = [
      await service.createQueued(owner, definitionId),
      await service.createQueued(owner, another.definitionId),
      await service.createQueued(otherOwner, foreign.definitionId),
    ];
    expect(new Set(runs.map((run) => run.id)).size).toBe(3);
    expect(await count()).toBe(3);
  });

  it('registers independent concurrent internal requests with separate run identities', async () => {
    const runs = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.createQueued(owner, definitionId),
      ),
    );
    expect(new Set(runs.map((run) => run.id)).size).toBe(4);
    expect(runs.every((run) => run.status === 'queued')).toBe(true);
    expect(await count()).toBe(4);
  });

  it('blocks new requests after disabling a definition while preserving previously registered runs', async () => {
    const first = await service.createQueued(owner, definitionId);
    await database.query(
      'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, definitionId],
    );
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(ConflictException);
    const original = await database.query<{ id: string; status: string }>(
      'SELECT id, status FROM sync.runs WHERE tenant_id = $1 AND id = $2',
      [owner, first.id],
    );
    expect(original.rows).toEqual([{ id: first.id, status: 'queued' }]);
    expect(await count()).toBe(1);
  });
  it('replays an accepted request without creating another run or pending job', async () => {
    const first = await service.createQueued(
      owner,
      definitionId,
      'same-request',
    );
    const second = await service.createQueued(
      owner,
      definitionId,
      'same-request',
    );
    expect(second).toEqual(first);
    const jobs = await database.query<{
      run_id: string;
      published_at: Date | null;
    }>('SELECT run_id, published_at FROM sync.run_jobs WHERE tenant_id = $1', [
      owner,
    ]);
    expect(jobs.rows).toEqual([{ run_id: first.id, published_at: null }]);
    expect(await count()).toBe(1);
  });

  it('deduplicates simultaneous requests across independent service instances', async () => {
    const anotherService = new RunsService(database);
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        (index % 2 ? service : anotherService).createQueued(
          owner,
          definitionId,
          'concurrent-retry',
        ),
      ),
    );
    expect(new Set(results.map((run) => run.id)).size).toBe(1);
    expect(await count()).toBe(1);
    const jobs = await database.query(
      'SELECT run_id FROM sync.run_jobs WHERE tenant_id = $1',
      [owner],
    );
    expect(jobs.rows).toHaveLength(1);
  });

  it('rejects a key reused for another definition without creating work', async () => {
    const other = await createDefinition(owner);
    const first = await service.createQueued(owner, definitionId, 'reused-key');
    await expect(
      service.createQueued(owner, other.definitionId, 'reused-key'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await count()).toBe(1);
    expect((await service.get(owner, first.id)).definition_id).toBe(
      definitionId,
    );
  });

  it('allows the same key in another account and distinct keys for the same definition', async () => {
    const foreign = await createDefinition(otherOwner);
    const results = [
      await service.createQueued(owner, definitionId, 'shared-key'),
      await service.createQueued(
        otherOwner,
        foreign.definitionId,
        'shared-key',
      ),
      await service.createQueued(owner, definitionId, 'another-key'),
    ];
    expect(new Set(results.map((run) => run.id)).size).toBe(3);
    expect(await count()).toBe(3);
  });

  it('returns accepted history on retry even after the definition and connection are disabled', async () => {
    const first = await service.createQueued(
      owner,
      definitionId,
      'accepted-before-disable',
    );
    await database.query(
      'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1',
      [owner],
    );
    await database.query(
      'UPDATE sync.connections SET enabled = false WHERE tenant_id = $1',
      [owner],
    );
    await expect(
      service.createQueued(
        owner,
        definitionId.toUpperCase(),
        'accepted-before-disable',
      ),
    ).resolves.toEqual(first);
    await expect(
      service.createQueued(owner, definitionId, 'new-after-disable'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await count()).toBe(1);
  });

  it('keeps the original source snapshot if the definition is subsequently edited', async () => {
    const first = await service.createQueued(owner, definitionId, 'snapshot');
    const other = await createDefinition(owner);
    await database.query(
      'UPDATE sync.definitions SET source_connection_id = $1, enabled = false WHERE id = $2',
      [other.connectionId, definitionId],
    );
    const stored = await database.query<{
      source_connection_id: string;
      connector: string;
      source_collection: string;
      request_key_hash: string;
      request_fingerprint: string;
    }>(
      'SELECT source_connection_id, connector, source_collection, request_key_hash, request_fingerprint FROM sync.runs WHERE id = $1',
      [first.id],
    );
    expect(stored.rows[0]).toMatchObject({
      source_connection_id: connectionId,
      connector: 'academic.assignments',
      source_collection: 'assignments',
    });
    expect(stored.rows[0].request_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(await service.get(owner, first.id))).not.toContain(
      'request_key_hash',
    );
    expect(Object.keys(await service.get(owner, first.id))).not.toContain(
      'source_connection_id',
    );
  });

  it('rolls back the run if inserting its job fails, and permits retrying the key afterwards', async () => {
    // Inject a real FK violation at the job insertion, on the same PostgreSQL
    // transaction used by the service. No triggers or shared schema changes.
    const failing = new RunsService({
      transaction: <T>(operation: (client: PoolClient) => Promise<T>) =>
        database.transaction((client) =>
          operation({
            query: (sql: string, values: unknown[]) =>
              client.query(
                sql,
                sql.startsWith('INSERT INTO sync.run_jobs')
                  ? [otherOwner, values[1]]
                  : values,
              ),
          } as unknown as PoolClient),
        ),
    } as DatabaseService);
    await expect(
      failing.createQueued(owner, definitionId, 'failed-job'),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await count()).toBe(0);
    const jobs = await database.query(
      'SELECT run_id FROM sync.run_jobs WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
    expect(jobs.rows).toEqual([]);
    await expect(
      service.createQueued(owner, definitionId, 'failed-job'),
    ).resolves.toMatchObject({ status: 'queued' });
    expect(await count()).toBe(1);
  });

  it('returns a run only to its owner and uses identical errors for foreign and absent IDs', async () => {
    const run = await service.createQueued(owner, definitionId, 'lookup');
    await expect(service.get(owner, run.id)).resolves.toEqual(run);
    await expect(service.get(otherOwner, run.id)).rejects.toThrow(
      'Ejecución no encontrada',
    );
    await expect(service.get(owner, randomUUID())).rejects.toThrow(
      'Ejecución no encontrada',
    );
  });

  it('returns the latest persisted state on lookup and idempotent retry', async () => {
    const run = await service.createQueued(owner, definitionId, 'state-lookup');
    await database.query(
      `UPDATE sync.runs SET status = 'completed', started_at = now(), finished_at = now() WHERE id = $1`,
      [run.id],
    );
    const completed = await service.get(owner, run.id);
    expect(completed.status).toBe('completed');
    expect(completed.finished_at).toBeInstanceOf(Date);
    await expect(
      service.createQueued(owner, definitionId, 'state-lookup'),
    ).resolves.toEqual(completed);
  });
  it('keeps historical runs without request metadata readable without creating pending jobs', async () => {
    const legacy = await database.query<{ id: string }>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING id',
      [owner, definitionId],
    );
    await expect(service.get(owner, legacy.rows[0].id)).resolves.toMatchObject({
      status: 'queued',
    });
    const jobs = await database.query(
      'SELECT run_id FROM sync.run_jobs WHERE tenant_id = $1',
      [owner],
    );
    expect(jobs.rows).toEqual([]);
  });

  it('enforces request-key uniqueness in PostgreSQL independently of application locks', async () => {
    const run = await service.createQueued(
      owner,
      definitionId,
      'database-unique',
    );
    await expect(
      database.query(
        `INSERT INTO sync.runs (tenant_id, definition_id, request_key_hash, request_fingerprint)
      SELECT tenant_id, definition_id, request_key_hash, request_fingerprint FROM sync.runs WHERE id = $1`,
        [run.id],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'runs_request_key_unique',
    });
    expect(await count()).toBe(1);
  });

  it('rejects partial request metadata and incomplete source snapshots', async () => {
    await expect(
      database.query(
        `INSERT INTO sync.runs (tenant_id, definition_id, request_key_hash)
      VALUES ($1, $2, $3)`,
        [owner, definitionId, 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_request_metadata_valid',
    });
    await expect(
      database.query(
        `INSERT INTO sync.runs (tenant_id, definition_id, source_connection_id)
      VALUES ($1, $2, $3)`,
        [owner, definitionId, connectionId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'runs_source_snapshot_valid',
    });
  });

  it('prevents duplicate jobs and attaching a job to another account execution', async () => {
    const run = await service.createQueued(
      owner,
      definitionId,
      'job-invariants',
    );
    await expect(
      database.query(
        'INSERT INTO sync.run_jobs (tenant_id, run_id) VALUES ($1, $2)',
        [owner, run.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const legacy = await database.query<{ id: string }>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING id',
      [owner, definitionId],
    );
    await expect(
      database.query(
        'INSERT INTO sync.run_jobs (tenant_id, run_id) VALUES ($1, $2)',
        [otherOwner, legacy.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: '23503', constraint: 'run_jobs_run_fk' });
  });
});
