import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Test, type TestingModule } from '@nestjs/testing';
import { ActivitiesService } from '../src/activities/activities.service';
import type {
  ActivityInput,
  ActivityRetirement,
  ActivityRunLease,
} from '../src/activities/activity.types';
import { DatabaseService } from '../src/database/database.service';
import { RunLeaseLostError } from '../src/runs/run-lease';
import { RunsService } from '../src/runs/runs.service';
import * as eventOutbox from '../src/events/event-outbox';
import type { DataChangedPayload } from '../src/events/sync-event.types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('Activity writes protected by a run lease (PostgreSQL integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let activities: ActivitiesService;
  let owner: string;
  let connectionId: string;
  let lease: ActivityRunLease;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, ActivitiesService, RunsService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    activities = module.get(ActivitiesService);
  });

  beforeEach(async () => {
    owner = randomUUID();
    const connection = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Lease fixture', 'http://academic:3000/api/v1/assignments/export', 'none') RETURNING id`,
      [owner],
    );
    connectionId = connection.rows[0].id;
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Lease fixture', 'academic.assignments', 'assignments') RETURNING id`,
      [owner, connectionId],
    );
    // No outbox job: a real publisher must never dispatch these fixtures.
    const run = await database.query<{ id: string }>(
      `INSERT INTO sync.runs (tenant_id, definition_id, source_connection_id, connector, source_collection)
       VALUES ($1, $2, $3, 'academic.assignments', 'assignments') RETURNING id`,
      [owner, definition.rows[0].id, connectionId],
    );
    const claimed = await module
      .get(RunsService)
      .claimQueued(owner, run.rows[0].id);
    if (!claimed) throw new Error('Fixture run was not claimed');
    lease = { run_id: claimed.id, claim_token: claimed.claim_token };
  });

  afterEach(async () => {
    await database.query('DELETE FROM sync.event_outbox WHERE tenant_id = $1', [
      owner,
    ]);
    await database.query('DELETE FROM sync.activities WHERE tenant_id = $1', [
      owner,
    ]);
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

  function input(overrides: Partial<ActivityInput> = {}): ActivityInput {
    return {
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: 'lease-fixture',
      type: 'academic.assignment',
      title: 'Protected assignment',
      schedule: {
        kind: 'date',
        role: 'deadline',
        date: '2026-11-24',
        at: null,
        end_at: null,
      },
      status: 'pending',
      details: { grade: null },
      source_updated_at: '2026-11-16T10:00:00Z',
      ...overrides,
    };
  }

  function retirement(
    overrides: Partial<ActivityRetirement> = {},
  ): ActivityRetirement {
    return {
      action: 'retire',
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: 'lease-fixture',
      source_updated_at: '2026-11-16T11:00:00Z',
      source_deleted_at: '2026-11-16T11:00:00Z',
      ...overrides,
    };
  }

  async function snapshot() {
    return (
      await database.query<Record<string, unknown>>(
        'SELECT * FROM sync.activities WHERE tenant_id = $1 ORDER BY id',
        [owner],
      )
    ).rows;
  }

  async function events() {
    return (
      await database.query<{
        event_id: string;
        tenant_id: string;
        event_type: string;
        correlation_id: string;
        causation_id: string;
        payload: DataChangedPayload;
        published_at: Date | null;
      }>(
        `SELECT event_id, tenant_id, event_type, correlation_id, causation_id,
                payload, published_at
         FROM sync.event_outbox WHERE tenant_id = $1
         ORDER BY occurred_at, event_id`,
        [owner],
      )
    ).rows;
  }

  async function expectRejectedWrites(reservation = lease) {
    const before = await snapshot();
    await expect(
      activities.save(owner, input({ external_id: 'new-id' }), reservation),
    ).rejects.toBeInstanceOf(RunLeaseLostError);
    await expect(
      activities.save(owner, input({ title: 'Stale update' }), reservation),
    ).rejects.toBeInstanceOf(RunLeaseLostError);
    await expect(
      activities.retire(owner, retirement(), reservation),
    ).rejects.toBeInstanceOf(RunLeaseLostError);
    expect(await snapshot()).toEqual(before);
  }

  it('permits creation, update, unchanged tracking and retirement with the current reservation', async () => {
    const created = await activities.save(owner, input(), lease);
    expect(created.outcome).toBe('created');
    const changed = input({ details: { grade: 8.75 } });
    await expect(activities.save(owner, changed, lease)).resolves.toEqual({
      id: created.id,
      outcome: 'updated',
    });
    await expect(activities.save(owner, changed, lease)).resolves.toEqual({
      id: created.id,
      outcome: 'unchanged',
    });
    await expect(
      activities.retire(owner, retirement(), lease),
    ).resolves.toEqual({ id: created.id, outcome: 'retired' });
    await expect(
      activities.retire(owner, retirement(), lease),
    ).resolves.toEqual({ id: created.id, outcome: 'unchanged' });
    await expect(
      activities.retire(owner, retirement({ external_id: 'absent' }), lease),
    ).resolves.toEqual({ id: null, outcome: 'not_found' });
    expect(await snapshot()).toMatchObject([
      {
        id: created.id,
        title: changed.title,
        deleted_at: new Date('2026-11-16T11:00:00Z'),
      },
    ]);
    await expect(activities.save(owner, changed, lease)).resolves.toEqual({
      id: created.id,
      outcome: 'updated',
    });
    const recorded = await events();
    expect(recorded).toHaveLength(4);
    for (const event of recorded) {
      expect(event).toMatchObject({
        tenant_id: owner,
        event_type: 'data.changed',
        correlation_id: lease.run_id,
        causation_id: lease.run_id,
        published_at: null,
      });
    }
    expect(new Set(recorded.map((event) => event.event_id)).size).toBe(4);
    expect(recorded.map((event) => event.payload)).toEqual(
      [
        { change_type: 'created', changed_fields: [] },
        { change_type: 'updated', changed_fields: ['grade'] },
        { change_type: 'retired', changed_fields: ['deleted_at'] },
        { change_type: 'updated', changed_fields: ['deleted_at'] },
      ].map((change) => ({
        ...change,
        sync_run_id: lease.run_id,
        activity_id: created.id,
        source_connection_id: connectionId,
        source_collection: 'assignments',
        activity_type: 'academic.assignment',
        external_id: 'lease-fixture',
      })),
    );
  });

  it('rolls back the activity change when appending its event fails', async () => {
    await activities.save(owner, input(), lease);
    const before = await snapshot();
    const beforeEvents = await events();
    const failure = new Error('Simulated outbox write failure');
    const append = jest
      .spyOn(eventOutbox, 'appendOutboxEvent')
      .mockRejectedValueOnce(failure);
    try {
      await expect(
        activities.save(owner, input({ details: { grade: 9.25 } }), lease),
      ).rejects.toBe(failure);
      expect(await snapshot()).toEqual(before);
      expect(await events()).toEqual(beforeEvents);
    } finally {
      append.mockRestore();
    }
  });

  it('rejects an old token without inserting, updating or retiring data and accepts the replacement token', async () => {
    const created = await activities.save(owner, input(), lease);
    const replacement = { ...lease, claim_token: randomUUID() };
    await database.query(
      'UPDATE sync.runs SET claim_token = $3 WHERE tenant_id = $1 AND id = $2',
      [owner, lease.run_id, replacement.claim_token],
    );
    await expectRejectedWrites();
    await expect(
      activities.save(
        owner,
        input({ title: 'Current worker update' }),
        replacement,
      ),
    ).resolves.toEqual({ id: created.id, outcome: 'updated' });
  });

  it('rejects expired and terminal reservations without changing activity content or synchronization metadata', async () => {
    await activities.save(owner, input(), lease);
    await database.query(
      `UPDATE sync.runs SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1 AND id = $2`,
      [owner, lease.run_id],
    );
    await expectRejectedWrites();
    await database.query(
      `UPDATE sync.runs SET status = 'completed', finished_at = clock_timestamp(), claim_token = NULL, lease_expires_at = NULL WHERE tenant_id = $1 AND id = $2`,
      [owner, lease.run_id],
    );
    await expectRejectedWrites();
  });

  it('scopes the reservation to its account, run, source connection and source collection', async () => {
    await activities.save(owner, input(), lease);
    const before = await snapshot();
    for (const scope of [
      { tenant: randomUUID(), reservation: lease, identity: {} },
      {
        tenant: owner,
        reservation: { ...lease, run_id: randomUUID() },
        identity: {},
      },
      {
        tenant: owner,
        reservation: lease,
        identity: { source_connection_id: randomUUID() },
      },
      {
        tenant: owner,
        reservation: lease,
        identity: { source_collection: 'exams' },
      },
    ]) {
      await expect(
        activities.save(scope.tenant, input(scope.identity), scope.reservation),
      ).rejects.toBeInstanceOf(RunLeaseLostError);
      await expect(
        activities.retire(
          scope.tenant,
          retirement(scope.identity),
          scope.reservation,
        ),
      ).rejects.toBeInstanceOf(RunLeaseLostError);
    }
    expect(await snapshot()).toEqual(before);
  });

  async function waitUntilBlocked(blockerPid: number) {
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const result = await database.query<{ waiting: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
           WHERE $1::integer = ANY(pg_blocking_pids(pid))
         ) AS waiting`,
        [blockerPid],
      );
      if (result.rows[0].waiting) return;
      await delay(10);
    }
    throw new Error('Activity operation did not wait for the run lock');
  }

  async function waitUntilLeaseExpires() {
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const result = await database.query<{ expired: boolean }>(
        `SELECT lease_expires_at <= clock_timestamp() AS expired
         FROM sync.runs WHERE tenant_id = $1 AND id = $2`,
        [owner, lease.run_id],
      );
      if (result.rows[0].expired) return;
      await delay(10);
    }
    throw new Error('Fixture lease did not expire');
  }

  it.each(['save', 'retire'] as const)(
    'rechecks the reservation after a blocked %s acquires the run lock',
    async (operation) => {
      await activities.save(owner, input(), lease);
      const before = await snapshot();
      if (operation === 'retire') {
        await database.query(
          `UPDATE sync.runs SET lease_expires_at = clock_timestamp() + interval '750 milliseconds'
           WHERE tenant_id = $1 AND id = $2`,
          [owner, lease.run_id],
        );
      }
      const locked = deferred<number>();
      const release = deferred<void>();
      const blocker = database.transaction(async (client) => {
        await client.query(
          'SELECT id FROM sync.runs WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
          [owner, lease.run_id],
        );
        const pid = await client.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        locked.resolve(pid.rows[0].pid);
        await release.promise;
        if (operation === 'save') {
          await client.query(
            'UPDATE sync.runs SET claim_token = $3 WHERE tenant_id = $1 AND id = $2',
            [owner, lease.run_id, randomUUID()],
          );
        }
      });
      // Observe setup failures as well as the concurrent write immediately.
      void blocker.catch((error: unknown) => locked.reject(error));
      const blockerPid = await locked.promise;
      const writing = (
        operation === 'save'
          ? activities.save(
              owner,
              input({ title: 'Blocked stale update' }),
              lease,
            )
          : activities.retire(owner, retirement(), lease)
      ).then(
        () => ({ succeeded: true, error: undefined as unknown }),
        (error: unknown) => ({ succeeded: false, error }),
      );
      try {
        await waitUntilBlocked(blockerPid);
        // No row update here: expiry advances only because database time passes.
        // This catches validating the lease before, rather than after, waiting.
        if (operation === 'retire') await waitUntilLeaseExpires();
      } finally {
        release.resolve();
        await blocker;
      }
      const outcome = await writing;
      expect(outcome.succeeded).toBe(false);
      expect(outcome.error).toBeInstanceOf(RunLeaseLostError);
      expect(await snapshot()).toEqual(before);
    },
  );
});
