import { randomUUID } from 'node:crypto';
import { BadGatewayException, ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import { RunsService } from '../src/runs/runs.service';

describe('Run execution lifecycle (PostgreSQL integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let service: RunsService;
  let owner: string;
  let otherOwner: string;
  let source: { connectionId: string; definitionId: string };

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
    source = await createSource(owner);
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

  async function createSource(tenant: string) {
    const connection = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type, credentials_encrypted)
       VALUES ($1, 'Claim fixture', 'http://academic:3000/api/v1/assignments/export', 'bearer', 'fixture-not-a-real-credential') RETURNING id`,
      [tenant],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Claim fixture', 'academic.assignments', 'assignments') RETURNING id`,
      [tenant, connection.rows[0].id],
    );
    return {
      connectionId: connection.rows[0].id,
      definitionId: definition.rows[0].id,
    };
  }

  async function createRun(
    tenant = owner,
    definition = source.definitionId,
  ): Promise<string> {
    // Insert only the run fixture, without an outbox job: an active real
    // publisher must never enqueue these disposable test runs into Rabbit.
    const result = await database.query<{ id: string }>(
      `INSERT INTO sync.runs (tenant_id, definition_id, source_connection_id, connector, source_collection)
       SELECT tenant_id, id, source_connection_id, connector, source_collection
       FROM sync.definitions WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenant, definition],
    );
    return result.rows[0].id;
  }

  async function snapshot(id: string) {
    return (
      await database.query(
        'SELECT * FROM sync.runs WHERE tenant_id IN ($1, $2) AND id = $3',
        [owner, otherOwner, id],
      )
    ).rows[0] as Record<string, unknown>;
  }

  it('claims the owned run and returns its captured source with coherent running timestamps and unchanged counters', async () => {
    const id = await createRun();
    const result = await service.claimQueued(owner, id);
    expect(result).toMatchObject({
      id,
      tenant_id: owner,
      definition_id: source.definitionId,
      status: 'running',
      source_connection_id: source.connectionId,
      connector: 'academic.assignments',
      source_collection: 'assignments',
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
    expect(result?.started_at).toBeInstanceOf(Date);
    expect(result!.started_at!.getTime()).toBeGreaterThanOrEqual(
      result!.created_at.getTime(),
    );
    const stored = await snapshot(id);
    expect(stored.started_at).toEqual(result?.started_at);
    expect(stored.status).toBe('running');
    const jobs = await database.query(
      'SELECT run_id FROM sync.run_jobs WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
    expect(jobs.rows).toEqual([]);
  });

  it('returns null for an absent execution without changing owned history', async () => {
    const id = await createRun();
    const before = await snapshot(id);
    await expect(service.claimQueued(owner, randomUUID())).resolves.toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });

  it('does not reveal or modify an execution owned by another account', async () => {
    const id = await createRun();
    const before = await snapshot(id);
    await expect(service.claimQueued(otherOwner, id)).resolves.toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });

  it('does not claim an execution twice or refresh the original start time', async () => {
    const id = await createRun();
    await service.claimQueued(owner, id);
    const before = await snapshot(id);
    await expect(
      new RunsService(database).claimQueued(owner, id),
    ).resolves.toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });

  it.each(['completed', 'failed'] as const)(
    'does not restart a %s execution or clear its result',
    async (status) => {
      const id = await createRun();
      await database.query(
        `UPDATE sync.runs SET status = $1, started_at = created_at, finished_at = created_at,
       read_count = 1, created_count = 1,
       error_code = $2, error_message = $3 WHERE tenant_id = $4 AND id = $5`,
        [
          status,
          status === 'failed' ? 'unknown_error' : null,
          status === 'failed' ? 'Error seguro de prueba' : null,
          owner,
          id,
        ],
      );
      const before = await snapshot(id);
      await expect(service.claimQueued(owner, id)).resolves.toBeNull();
      expect(await snapshot(id)).toEqual(before);
    },
  );

  it('allows only one of four independent service instances to start the same execution', async () => {
    const id = await createRun();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        new RunsService(database).claimQueued(owner, id),
      ),
    );
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(3);
    expect((await snapshot(id)).started_at).toEqual(winners[0]?.started_at);
    expect((await snapshot(id)).status).toBe('running');
  });

  it('keeps different executions and accounts independently claimable', async () => {
    const otherSource = await createSource(otherOwner);
    const first = await createRun();
    const second = await createRun();
    const foreign = await createRun(otherOwner, otherSource.definitionId);
    const results = await Promise.all([
      service.claimQueued(owner, first),
      service.claimQueued(owner, second),
      new RunsService(database).claimQueued(otherOwner, foreign),
    ]);
    expect(results.map((result) => result?.id)).toEqual([
      first,
      second,
      foreign,
    ]);
    expect(results.map((result) => result?.tenant_id)).toEqual([
      owner,
      owner,
      otherOwner,
    ]);
  });

  it('uses the source captured at acceptance even if the definition is later retargeted', async () => {
    const id = await createRun();
    const replacement = await createSource(owner);
    await database.query(
      'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, replacement.definitionId],
    );
    await database.query(
      'UPDATE sync.definitions SET source_connection_id = $1 WHERE tenant_id = $2 AND id = $3',
      [replacement.connectionId, owner, source.definitionId],
    );
    await expect(service.claimQueued(owner, id)).resolves.toMatchObject({
      source_connection_id: source.connectionId,
    });
  });

  it('does not start legacy history without a captured source configuration', async () => {
    const legacy = await database.query<{ id: string }>(
      'INSERT INTO sync.runs (tenant_id, definition_id) VALUES ($1, $2) RETURNING id',
      [owner, source.definitionId],
    );
    const id = legacy.rows[0].id;
    const before = await snapshot(id);
    await expect(service.claimQueued(owner, id)).resolves.toBeNull();
    expect(await snapshot(id)).toEqual(before);
  });

  it('keeps internal ownership and source configuration out of the public detail after claiming', async () => {
    const id = await createRun();
    await service.claimQueued(owner, id);
    const detail = await service.get(owner, id);
    expect(detail.status).toBe('running');
    for (const field of [
      'tenant_id',
      'source_connection_id',
      'connector',
      'source_collection',
      'request_key_hash',
      'request_fingerprint',
      'credentials_encrypted',
    ]) {
      expect(Object.hasOwn(detail, field)).toBe(false);
    }
  });

  it('matches canonical UUID identities regardless of the case received in the message', async () => {
    const id = await createRun();
    await expect(
      service.claimQueued(owner.toUpperCase(), id.toUpperCase()),
    ).resolves.toMatchObject({ id, tenant_id: owner, status: 'running' });
  });

  it('reads delivery state privately and distinguishes missing ownership and unsupported captured sources', async () => {
    const id = await createRun();
    await expect(service.getDeliveryState(owner, id)).resolves.toEqual({
      status: 'queued',
      source_supported: true,
      lease_expires_at: null,
    });
    await expect(service.getDeliveryState(otherOwner, id)).resolves.toBeNull();
    await expect(
      service.getDeliveryState(owner, randomUUID()),
    ).resolves.toBeNull();
    const claimed = (await service.claimQueued(owner, id))!;
    await expect(service.getDeliveryState(owner, id)).resolves.toEqual({
      status: 'running',
      source_supported: true,
      lease_expires_at: claimed.lease_expires_at,
    });
    await database.query(
      'UPDATE sync.runs SET source_connection_id = NULL, connector = NULL, source_collection = NULL WHERE tenant_id = $1 AND id = $2',
      [owner, id],
    );
    await expect(service.getDeliveryState(owner, id)).resolves.toEqual({
      status: 'running',
      source_supported: false,
      lease_expires_at: claimed.lease_expires_at,
    });
    const detail = await service.get(owner, id);
    for (const field of ['source_supported', 'lease_expires_at', 'claim_token'])
      expect(Object.hasOwn(detail, field)).toBe(false);
  });

  describe('recovery', () => {
    const empty = {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    };

    async function expire(id: string) {
      await database.query(
        `UPDATE sync.runs SET lease_expires_at = clock_timestamp() - interval '1 second'
         WHERE tenant_id = $1 AND id = $2`,
        [owner, id],
      );
    }

    it('recovers the same run with a new token, preserves its start and captured source, and rejects the old worker', async () => {
      const id = await createRun();
      const original = (await service.claimQueued(owner, id))!;
      const replacementSource = await createSource(owner);
      await database.query(
        'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1 AND id = $2',
        [owner, replacementSource.definitionId],
      );
      await database.query(
        'UPDATE sync.definitions SET source_connection_id = $3 WHERE tenant_id = $1 AND id = $2',
        [owner, source.definitionId, replacementSource.connectionId],
      );
      await expire(id);
      const expired = await snapshot(id);
      await expect(service.claimQueued(otherOwner, id)).resolves.toBeNull();
      expect(await snapshot(id)).toEqual(expired);

      const recovered = await new RunsService(database).claimQueued(owner, id);
      expect(recovered).not.toBeNull();
      expect(recovered).toMatchObject({
        id,
        tenant_id: owner,
        definition_id: original.definition_id,
        status: 'running',
        created_at: original.created_at,
        started_at: original.started_at,
        finished_at: null,
        source_connection_id: original.source_connection_id,
        connector: original.connector,
        source_collection: original.source_collection,
      });
      expect(recovered!.claim_token).not.toBe(original.claim_token);
      expect(recovered!.lease_expires_at.getTime()).toBeGreaterThan(
        (expired.lease_expires_at as Date).getTime(),
      );
      const beforeOldWorker = await snapshot(id);
      await expect(
        service.renewLease(owner, id, original.claim_token),
      ).resolves.toBe(false);
      await expect(
        service.complete(owner, id, empty, original.claim_token),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.fail(
          owner,
          id,
          empty,
          new Error('Old worker'),
          original.claim_token,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot(id)).toEqual(beforeOldWorker);
      await expect(
        service.complete(owner, id, empty, recovered!.claim_token),
      ).resolves.toMatchObject({
        id,
        status: 'completed',
        started_at: original.started_at,
      });
    });

    it('allows exactly one concurrent recovery and does not replace its fresh reservation', async () => {
      const id = await createRun();
      const original = (await service.claimQueued(owner, id))!;
      await expire(id);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          new RunsService(database).claimQueued(owner, id),
        ),
      );
      const winners = results.filter((result) => result !== null);
      expect(winners).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(3);
      expect(winners[0].claim_token).not.toBe(original.claim_token);
      expect(winners[0].started_at).toEqual(original.started_at);
      const before = await snapshot(id);
      expect(before.claim_token).toBe(winners[0].claim_token);
      await expect(service.claimQueued(owner, id)).resolves.toBeNull();
      expect(await snapshot(id)).toEqual(before);
    });

    it('does not guess ownership of legacy running history or recover a run without a captured source', async () => {
      for (const capturedSource of [true, false]) {
        const id = await createRun();
        if (capturedSource) {
          // An older running execution without a lease has no known expiration.
          await database.query(
            `UPDATE sync.runs SET status = 'running', started_at = created_at WHERE tenant_id = $1 AND id = $2`,
            [owner, id],
          );
        } else {
          await service.claimQueued(owner, id);
          await expire(id);
          await database.query(
            `UPDATE sync.runs SET source_connection_id = NULL, connector = NULL, source_collection = NULL WHERE tenant_id = $1 AND id = $2`,
            [owner, id],
          );
        }
        const before = await snapshot(id);
        await expect(service.claimQueued(owner, id)).resolves.toBeNull();
        expect(await snapshot(id)).toEqual(before);
      }
    });
  });

  describe('lease ownership', () => {
    const empty = {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    };

    it('renews only the active owner and token without modifying rejected reservations', async () => {
      const id = await createRun();
      const claimed = (await service.claimQueued(owner, id))!;
      expect(claimed.claim_token).toMatch(/^[a-f0-9-]{36}$/);
      expect(claimed.lease_expires_at).toBeInstanceOf(Date);
      expect(claimed.lease_expires_at.getTime()).toBeGreaterThan(
        claimed.started_at!.getTime(),
      );
      await database.query(
        `UPDATE sync.runs SET lease_expires_at = clock_timestamp() + interval '10 seconds' WHERE tenant_id = $1 AND id = $2`,
        [owner, id],
      );
      const before = await snapshot(id);
      await expect(
        service.renewLease(otherOwner, id, claimed.claim_token),
      ).resolves.toBe(false);
      await expect(service.renewLease(owner, id, randomUUID())).resolves.toBe(
        false,
      );
      await expect(
        service.renewLease(owner, randomUUID(), claimed.claim_token),
      ).resolves.toBe(false);
      expect(await snapshot(id)).toEqual(before);
      await expect(
        service.renewLease(owner, id, claimed.claim_token),
      ).resolves.toBe(true);
      const after = await snapshot(id);
      expect(after.claim_token).toBe(claimed.claim_token);
      expect((after.lease_expires_at as Date).getTime()).toBeGreaterThan(
        (before.lease_expires_at as Date).getTime(),
      );
    });

    it('does not revive or finalize an expired reservation even with the matching token', async () => {
      const id = await createRun();
      const claimed = (await service.claimQueued(owner, id))!;
      await database.query(
        `UPDATE sync.runs SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1 AND id = $2`,
        [owner, id],
      );
      const before = await snapshot(id);
      await expect(
        service.renewLease(owner, id, claimed.claim_token),
      ).resolves.toBe(false);
      await expect(
        service.complete(owner, id, empty, claimed.claim_token),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.fail(
          owner,
          id,
          empty,
          new Error('Stale failure'),
          claimed.claim_token,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot(id)).toEqual(before);
    });

    it('rejects a replaced token and releases the current reservation on completion without exposing it', async () => {
      const id = await createRun();
      const claimed = (await service.claimQueued(owner, id))!;
      const replacement = randomUUID();
      // Model a later reservation; automatic recovery is tested when implemented.
      await database.query(
        'UPDATE sync.runs SET claim_token = $3 WHERE tenant_id = $1 AND id = $2',
        [owner, id, replacement],
      );
      const before = await snapshot(id);
      await expect(
        service.renewLease(owner, id, claimed.claim_token),
      ).resolves.toBe(false);
      await expect(
        service.complete(owner, id, empty, claimed.claim_token),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.fail(
          owner,
          id,
          empty,
          new Error('Stale failure'),
          claimed.claim_token,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot(id)).toEqual(before);
      const completed = await service.complete(owner, id, empty, replacement);
      expect(completed.status).toBe('completed');
      expect(Object.hasOwn(completed, 'claim_token')).toBe(false);
      expect(Object.hasOwn(completed, 'lease_expires_at')).toBe(false);
      expect(await snapshot(id)).toMatchObject({
        claim_token: null,
        lease_expires_at: null,
      });
      await expect(service.renewLease(owner, id, replacement)).resolves.toBe(
        false,
      );
    });
  });

  describe('completion', () => {
    const counts = {
      read: 15,
      created: 1,
      updated: 2,
      unchanged: 3,
      retired: 4,
      ignored: 5,
    };

    it('atomically stores a complete result with correctly mapped counters and public timestamps', async () => {
      const id = await createRun();
      const claimed = await service.claimQueued(owner, id);
      const claimToken = claimed!.claim_token;
      const completed = await service.complete(owner, id, counts, claimToken);
      expect(completed).toMatchObject({
        id,
        definition_id: source.definitionId,
        status: 'completed',
        started_at: claimed?.started_at,
        read_count: 15,
        created_count: 1,
        updated_count: 2,
        unchanged_count: 3,
        retired_count: 4,
        ignored_count: 5,
        error_code: null,
        error_message: null,
      });
      expect(completed.finished_at).toBeInstanceOf(Date);
      expect(completed.finished_at!.getTime()).toBeGreaterThanOrEqual(
        claimed!.started_at!.getTime(),
      );
      await expect(service.get(owner, id)).resolves.toEqual(completed);
      for (const field of [
        'tenant_id',
        'source_connection_id',
        'connector',
        'request_key_hash',
        'credentials_encrypted',
      ]) {
        expect(Object.hasOwn(completed, field)).toBe(false);
      }
    });

    it('completes an empty import with all counters at zero', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const empty = {
        read: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        retired: 0,
        ignored: 0,
      };
      await expect(
        service.complete(owner, id, empty, claimToken),
      ).resolves.toMatchObject({
        status: 'completed',
        read_count: 0,
        created_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        retired_count: 0,
        ignored_count: 0,
      });
    });

    it('rejects foreign and nonexistent execution identities without altering the running execution', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const before = await snapshot(id);
      await expect(
        service.complete(otherOwner, id, counts, claimToken),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.complete(owner, randomUUID(), counts, claimToken),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot(id)).toEqual(before);
    });

    it('does not complete a queued execution or overwrite completed and failed history', async () => {
      const claimToken = randomUUID();
      for (const status of ['queued', 'completed', 'failed'] as const) {
        const id = await createRun();
        if (status !== 'queued') {
          await database.query(
            `UPDATE sync.runs SET status = $1, started_at = created_at, finished_at = created_at,
             error_code = $2, error_message = $3 WHERE tenant_id = $4 AND id = $5`,
            [
              status,
              status === 'failed' ? 'unknown_error' : null,
              status === 'failed' ? 'Error seguro de prueba' : null,
              owner,
              id,
            ],
          );
        }
        const before = await snapshot(id);
        await expect(
          service.complete(owner, id, counts, claimToken),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await snapshot(id)).toEqual(before);
      }
    });

    it('rejects an unbalanced completed result without partially changing status, dates or counters', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const before = await snapshot(id);
      await expect(
        service.complete(owner, id, { ...counts, read: 16 }, claimToken),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_completed_counts_valid',
      });
      expect(await snapshot(id)).toEqual(before);
      await expect(
        service.complete(owner, id, counts, claimToken),
      ).resolves.toMatchObject({
        status: 'completed',
      });
    });

    it('allows only one concurrent completion and preserves the complete winning result', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const alternative = {
        read: 1,
        created: 0,
        updated: 0,
        unchanged: 1,
        retired: 0,
        ignored: 0,
      };
      const results = await Promise.allSettled([
        service.complete(owner, id, counts, claimToken),
        new RunsService(database).complete(owner, id, alternative, claimToken),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const winner = results.find((result) => result.status === 'fulfilled');
      const loser = results.find((result) => result.status === 'rejected');
      if (
        !winner ||
        winner.status !== 'fulfilled' ||
        !loser ||
        loser.status !== 'rejected'
      ) {
        throw new Error('Expected one winner and one rejected completion');
      }
      expect(loser.reason).toBeInstanceOf(ConflictException);
      await expect(service.get(owner, id)).resolves.toEqual(winner.value);
    });
  });

  describe('failure', () => {
    const partial = {
      read: 20,
      created: 1,
      updated: 2,
      unchanged: 3,
      retired: 4,
      ignored: 5,
    };

    it('stores a safe error and partial counters atomically without persisting the original exception', async () => {
      const id = await createRun();
      const claimed = await service.claimQueued(owner, id);
      const claimToken = claimed!.claim_token;
      const marker = 'private-upstream-token-must-not-leak';
      const result = await service.fail(
        owner,
        id,
        partial,
        new BadGatewayException(marker),
        claimToken,
      );
      expect(result).toMatchObject({
        id,
        status: 'failed',
        started_at: claimed?.started_at,
        read_count: 20,
        created_count: 1,
        updated_count: 2,
        unchanged_count: 3,
        retired_count: 4,
        ignored_count: 5,
        error_code: 'source_error',
        error_message: 'No se pudieron obtener datos válidos de la fuente.',
      });
      expect(result.finished_at).toBeInstanceOf(Date);
      expect(result.finished_at!.getTime()).toBeGreaterThanOrEqual(
        claimed!.started_at!.getTime(),
      );
      await expect(service.get(owner, id)).resolves.toEqual(result);
      expect(JSON.stringify(await snapshot(id))).not.toContain(marker);
    });

    it('protects ownership and never overwrites queued or terminal executions', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const before = await snapshot(id);
      const error = new Error('Fixture failure');
      await expect(
        service.fail(otherOwner, id, partial, error, claimToken),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.fail(owner, randomUUID(), partial, error, claimToken),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot(id)).toEqual(before);
      for (const status of ['queued', 'completed', 'failed'] as const) {
        const another = await createRun();
        if (status !== 'queued') {
          await database.query(
            `UPDATE sync.runs SET status = $1, started_at = created_at, finished_at = created_at,
             error_code = $2, error_message = $3 WHERE tenant_id = $4 AND id = $5`,
            [
              status,
              status === 'failed' ? 'unknown_error' : null,
              status === 'failed' ? 'Error seguro previo' : null,
              owner,
              another,
            ],
          );
        }
        const original = await snapshot(another);
        await expect(
          service.fail(owner, another, partial, error, claimToken),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await snapshot(another)).toEqual(original);
      }
    });

    it('rejects incoherent counters without leaving a failed state or error fields partially saved', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const before = await snapshot(id);
      await expect(
        service.fail(
          owner,
          id,
          { ...partial, read: 14 },
          new Error('Fixture failure'),
          claimToken,
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'runs_counts_balance_valid',
      });
      expect(await snapshot(id)).toEqual(before);
    });

    it('allows only one terminal result when completion and failure compete for the same running execution', async () => {
      const id = await createRun();
      const claimToken = (await service.claimQueued(owner, id))!.claim_token;
      const completeCounts = { ...partial, read: 15 };
      const results = await Promise.allSettled([
        service.complete(owner, id, completeCounts, claimToken),
        new RunsService(database).fail(
          owner,
          id,
          partial,
          new BadGatewayException('Fixture source unavailable'),
          claimToken,
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const winner = results.find((result) => result.status === 'fulfilled');
      const loser = results.find((result) => result.status === 'rejected');
      if (
        !winner ||
        winner.status !== 'fulfilled' ||
        !loser ||
        loser.status !== 'rejected'
      ) {
        throw new Error('Expected exactly one terminal transition');
      }
      expect(loser.reason).toBeInstanceOf(ConflictException);
      await expect(service.get(owner, id)).resolves.toEqual(winner.value);
    });
  });
});
