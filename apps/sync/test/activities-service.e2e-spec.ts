import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from '../src/activities/activities.service';
import { activityContentHash } from '../src/activities/activity-content-hash';
import type {
  ActivityInput,
  ActivityRetirement,
  JsonValue,
} from '../src/activities/activity.types';
import { DatabaseService } from '../src/database/database.service';

interface StoredActivity {
  id: string;
  tenant_id: string;
  source_connection_id: string;
  source_collection: string;
  external_id: string;
  type: string;
  title: string;
  time_kind: string;
  time_role: string;
  on_date: string | null;
  at: Date | null;
  end_at: Date | null;
  status: string | null;
  details: Record<string, JsonValue>;
  source_updated_at: Date | null;
  content_hash: string;
  last_synced_at: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

describe('ActivitiesService (PostgreSQL integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let service: ActivitiesService;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;
  const oldTime = new Date('2000-01-01T00:00:00.000Z');

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, ActivitiesService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    service = module.get(ActivitiesService);
  });

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    connectionId = await createConnection(owner);
  });

  afterEach(async () => {
    await database.query(
      'DELETE FROM sync.activities WHERE tenant_id IN ($1, $2)',
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

  async function createConnection(tenantId: string): Promise<string> {
    const result = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Activity persistence test', 'http://academic:3000/api/v1/assignments/export', 'none')
       RETURNING id`,
      [tenantId],
    );
    return result.rows[0].id;
  }

  function activity(overrides: Partial<ActivityInput> = {}): ActivityInput {
    return {
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: '001',
      type: 'academic.assignment',
      title: "Entrega d'aplicación",
      schedule: {
        kind: 'date',
        role: 'deadline',
        date: '2026-11-24',
        at: null,
        end_at: null,
      },
      status: 'pending',
      details: { grade: null, mandatory: false, group_members: [] },
      source_updated_at: '2026-11-08T19:00:00.000Z',
      ...overrides,
    };
  }

  async function stored(id: string): Promise<StoredActivity> {
    const result = await database.query<StoredActivity>(
      'SELECT *, on_date::text AS on_date FROM sync.activities WHERE tenant_id = $1 AND id = $2',
      [owner, id],
    );
    return result.rows[0];
  }

  async function pinTimes(id: string): Promise<StoredActivity> {
    await database.query(
      `UPDATE sync.activities SET created_at = $3, updated_at = $3, last_synced_at = $3
       WHERE tenant_id = $1 AND id = $2`,
      [owner, id, oldTime],
    );
    return stored(id);
  }

  async function count(tenantId = owner): Promise<number> {
    const result = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.activities WHERE tenant_id = $1',
      [tenantId],
    );
    return result.rows[0].count;
  }

  it('creates a complete activity with owner, source identity and normalized content', async () => {
    const input = activity();
    const result = await service.save(owner, input);
    expect(result.outcome).toBe('created');
    expect(await stored(result.id)).toMatchObject({
      id: result.id,
      tenant_id: owner,
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: '001',
      type: 'academic.assignment',
      title: input.title,
      time_kind: 'date',
      time_role: 'deadline',
      on_date: '2026-11-24',
      at: null,
      end_at: null,
      status: 'pending',
      details: input.details,
      source_updated_at: new Date(input.source_updated_at!),
      content_hash: activityContentHash(input),
      deleted_at: null,
    });
    expect(await count()).toBe(1);
  });

  it('returns unchanged on reimport, preserves identity and modification time and refreshes read tracking', async () => {
    const first = await service.save(owner, activity());
    const before = await pinTimes(first.id);
    expect(await service.save(owner, activity())).toEqual({
      id: first.id,
      outcome: 'unchanged',
    });
    const after = await stored(first.id);
    expect(after.created_at).toEqual(before.created_at);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(after.content_hash).toBe(before.content_hash);
    expect(after.last_synced_at.getTime()).toBeGreaterThan(oldTime.getTime());
    expect(await count()).toBe(1);
  });

  it('tracks a new source timestamp without inventing a content update', async () => {
    const first = await service.save(owner, activity());
    await pinTimes(first.id);
    const source_updated_at = '2026-11-09T12:00:00.000Z';
    expect(await service.save(owner, activity({ source_updated_at }))).toEqual({
      id: first.id,
      outcome: 'unchanged',
    });
    expect(await stored(first.id)).toMatchObject({
      created_at: oldTime,
      updated_at: oldTime,
      source_updated_at: new Date(source_updated_at),
    });
  });

  it('does not change content when JSON object keys arrive in a different order', async () => {
    const first = await service.save(owner, activity());
    await pinTimes(first.id);
    const input = activity({
      details: { group_members: [], mandatory: false, grade: null },
    });
    expect(await service.save(owner, input)).toEqual({
      id: first.id,
      outcome: 'unchanged',
    });
    expect((await stored(first.id)).updated_at).toEqual(oldTime);
  });

  it('updates changed business content while preserving the central ID and creation time', async () => {
    const first = await service.save(owner, activity());
    await pinTimes(first.id);
    const input = activity({
      title: 'Entrega revisada',
      status: 'submitted',
      details: { grade: 8.75, mandatory: true },
    });
    expect(await service.save(owner, input)).toEqual({
      id: first.id,
      outcome: 'updated',
    });
    const after = await stored(first.id);
    expect(after).toMatchObject({
      title: input.title,
      status: 'submitted',
      details: input.details,
      created_at: oldTime,
      content_hash: activityContentHash(input),
    });
    expect(after.updated_at.getTime()).toBeGreaterThan(oldTime.getTime());
    expect(after.last_synced_at.getTime()).toBeGreaterThan(oldTime.getTime());
    expect(await count()).toBe(1);
  });

  it('switches from a day deadline to an instant and clears the previous date column', async () => {
    const first = await service.save(owner, activity());
    const input = activity({
      schedule: {
        kind: 'instant',
        role: 'deadline',
        date: null,
        at: '2026-11-24T22:59:00.000Z',
        end_at: null,
      },
    });
    expect(await service.save(owner, input)).toEqual({
      id: first.id,
      outcome: 'updated',
    });
    expect(await stored(first.id)).toMatchObject({
      time_kind: 'instant',
      on_date: null,
      at: new Date('2026-11-24T22:59:00.000Z'),
      end_at: null,
    });
  });

  it('preserves null, zero and false when replacing previous content', async () => {
    const first = await service.save(
      owner,
      activity({
        status: 'submitted',
        details: { grade: 8.75, mandatory: true },
      }),
    );
    const input = activity({
      status: null,
      details: { grade: 0, mandatory: false, weight_percent: null },
      source_updated_at: null,
    });
    expect(await service.save(owner, input)).toEqual({
      id: first.id,
      outcome: 'updated',
    });
    expect(await stored(first.id)).toMatchObject({
      status: null,
      details: input.details,
      source_updated_at: null,
    });
  });

  it('keeps the central identity when the normalized activity type changes', async () => {
    const first = await service.save(owner, activity());
    expect(
      await service.save(owner, activity({ type: 'academic.exam' })),
    ).toEqual({ id: first.id, outcome: 'updated' });
    expect((await stored(first.id)).type).toBe('academic.exam');
    expect(await count()).toBe(1);
  });

  it('distinguishes owners, connections, collections and textual external IDs', async () => {
    const secondConnection = await createConnection(owner);
    const foreignConnection = await createConnection(otherOwner);
    const results = [
      await service.save(owner, activity()),
      await service.save(owner, activity({ source_collection: 'exams' })),
      await service.save(
        owner,
        activity({ source_connection_id: secondConnection }),
      ),
      await service.save(
        otherOwner,
        activity({ source_connection_id: foreignConnection }),
      ),
      await service.save(owner, activity({ external_id: '1' })),
      await service.save(owner, activity({ external_id: 'ABC' })),
      await service.save(owner, activity({ external_id: 'abc' })),
    ];
    expect(new Set(results.map((result) => result.id)).size).toBe(7);
    expect(results.every((result) => result.outcome === 'created')).toBe(true);
    expect(await count()).toBe(6);
    expect(await count(otherOwner)).toBe(1);
  });

  it('rejects a missing connection and leaves the pool usable after rollback', async () => {
    await expect(
      service.save(owner, activity({ source_connection_id: randomUUID() })),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'activities_source_connection_fk',
    });
    expect(await count()).toBe(0);
    expect((await service.save(owner, activity())).outcome).toBe('created');
  });

  it('rejects another owner connection without changing that owner activity', async () => {
    const first = await service.save(owner, activity());
    const before = await stored(first.id);
    await expect(
      service.save(otherOwner, activity({ title: 'Foreign overwrite' })),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'activities_source_connection_fk',
    });
    expect(await stored(first.id)).toEqual(before);
    expect(await count(otherOwner)).toBe(0);
  });

  it('does not modify an existing activity or its timestamps when invalid content is rejected', async () => {
    const first = await service.save(owner, activity());
    const before = await pinTimes(first.id);
    const invalid = activity({
      title: 'Must not be saved',
      schedule: {
        kind: 'date',
        role: 'deadline',
        date: null,
        at: null,
        end_at: null,
      },
    } as unknown as Partial<ActivityInput>);
    await expect(service.save(owner, invalid)).rejects.toMatchObject({
      code: '23514',
      constraint: 'activities_schedule_valid',
    });
    expect(await stored(first.id)).toEqual(before);
  });

  it('creates only one activity when identical imports run concurrently', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => service.save(owner, activity())),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(
      results.filter((result) => result.outcome === 'created'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.outcome === 'unchanged'),
    ).toHaveLength(5);
    expect(await count()).toBe(1);
  });

  it('serializes concurrent updates without mixing fields from different versions', async () => {
    const first = await service.save(owner, activity());
    const versions = [
      activity({ title: 'Version A', details: { grade: 1 } }),
      activity({ title: 'Version B', details: { grade: 2 } }),
    ];
    const results = await Promise.all(
      versions.map((input) => service.save(owner, input)),
    );
    expect(results).toEqual([
      { id: first.id, outcome: 'updated' },
      { id: first.id, outcome: 'updated' },
    ]);
    const after = await stored(first.id);
    const finalVersion = versions.find((input) => input.title === after.title);
    expect(finalVersion).toBeDefined();
    expect(after.details).toEqual(finalVersion!.details);
    expect(after.content_hash).toBe(activityContentHash(finalVersion!));
    expect(await count()).toBe(1);
  });

  it('rolls back earlier statements when a later statement in the same transaction fails', async () => {
    const first = await service.save(owner, activity());
    const before = await stored(first.id);
    await expect(
      database.transaction(async (client) => {
        await client.query(
          'UPDATE sync.activities SET title = $1 WHERE id = $2 AND tenant_id = $3',
          ['Partial change', first.id, owner],
        );
        await client.query('SELECT 1 / 0');
      }),
    ).rejects.toMatchObject({ code: '22012' });
    expect(await stored(first.id)).toEqual(before);
  });

  describe('retirement and reactivation', () => {
    function retirement(
      overrides: Partial<ActivityRetirement> = {},
    ): ActivityRetirement {
      return {
        action: 'retire',
        source_connection_id: connectionId,
        source_collection: 'assignments',
        external_id: '001',
        source_updated_at: '2026-11-09T12:00:00.000Z',
        source_deleted_at: '2026-11-09T12:00:00.000Z',
        ...overrides,
      };
    }

    it('marks an existing activity as retired without deleting its identity or business content', async () => {
      const first = await service.save(owner, activity());
      const before = await pinTimes(first.id);
      const input = retirement({
        source_deleted_at: '2026-11-09T13:00:00+01:00',
      });
      expect(await service.retire(owner, input)).toEqual({
        id: first.id,
        outcome: 'retired',
      });
      const after = await stored(first.id);
      expect(after).toMatchObject({
        id: first.id,
        created_at: oldTime,
        title: before.title,
        details: before.details,
        content_hash: before.content_hash,
        on_date: before.on_date,
        deleted_at: new Date('2026-11-09T12:00:00.000Z'),
        source_updated_at: new Date(input.source_updated_at!),
      });
      expect(after.updated_at.getTime()).toBeGreaterThan(oldTime.getTime());
      expect(after.last_synced_at.getTime()).toBeGreaterThan(oldTime.getTime());
      expect(await count()).toBe(1);
    });

    it('treats repeated retirements as unchanged and refreshes only read metadata', async () => {
      const first = await service.save(owner, activity());
      await service.retire(owner, retirement());
      const before = await pinTimes(first.id);
      const input = retirement({ source_updated_at: '2026-11-09T13:00:00Z' });
      expect(await service.retire(owner, input)).toEqual({
        id: first.id,
        outcome: 'unchanged',
      });
      const after = await stored(first.id);
      expect(after).toMatchObject({
        created_at: before.created_at,
        updated_at: before.updated_at,
        deleted_at: before.deleted_at,
        content_hash: before.content_hash,
        source_updated_at: new Date(input.source_updated_at!),
      });
      expect(after.last_synced_at.getTime()).toBeGreaterThan(oldTime.getTime());
      expect(await count()).toBe(1);
    });

    it('does not invent an activity when the source record was deleted before its first import', async () => {
      expect(await service.retire(owner, retirement())).toEqual({
        id: null,
        outcome: 'not_found',
      });
      expect(await service.retire(owner, retirement())).toEqual({
        id: null,
        outcome: 'not_found',
      });
      expect(await count()).toBe(0);
    });

    it('cannot retire an activity belonging to another owner', async () => {
      const first = await service.save(owner, activity());
      const before = await stored(first.id);
      expect(await service.retire(otherOwner, retirement())).toEqual({
        id: null,
        outcome: 'not_found',
      });
      expect(await stored(first.id)).toEqual(before);
      expect(await count(otherOwner)).toBe(0);
    });

    it('does not confuse two connections owned by the same user', async () => {
      const first = await service.save(owner, activity());
      const before = await stored(first.id);
      const secondConnection = await createConnection(owner);
      expect(
        await service.retire(
          owner,
          retirement({ source_connection_id: secondConnection }),
        ),
      ).toEqual({ id: null, outcome: 'not_found' });
      expect(await stored(first.id)).toEqual(before);
    });

    it.each([
      { source_collection: 'exams' },
      { external_id: '1' },
      { external_id: 'ABC' },
    ])(
      'does not retire another collection or textual external identity: %j',
      async (identity) => {
        const first = await service.save(owner, activity());
        const before = await stored(first.id);
        expect(await service.retire(owner, retirement(identity))).toEqual({
          id: null,
          outcome: 'not_found',
        });
        expect(await stored(first.id)).toEqual(before);
      },
    );

    it('reactivates identical content with the original central ID and creation time', async () => {
      const first = await service.save(owner, activity());
      await service.retire(owner, retirement());
      const before = await pinTimes(first.id);
      expect(await service.save(owner, activity())).toEqual({
        id: first.id,
        outcome: 'updated',
      });
      const after = await stored(first.id);
      expect(after).toMatchObject({
        id: first.id,
        created_at: oldTime,
        deleted_at: null,
        content_hash: before.content_hash,
      });
      expect(after.updated_at.getTime()).toBeGreaterThan(oldTime.getTime());
      expect(await service.save(owner, activity())).toEqual({
        id: first.id,
        outcome: 'unchanged',
      });
      expect((await stored(first.id)).updated_at).toEqual(after.updated_at);
      expect(await count()).toBe(1);
    });

    it('reactivates changed content without creating a new activity', async () => {
      const first = await service.save(owner, activity());
      await service.retire(owner, retirement());
      const input = activity({
        title: 'Entrega reactivada',
        status: 'submitted',
        details: { grade: 0, mandatory: false },
      });
      expect(await service.save(owner, input)).toEqual({
        id: first.id,
        outcome: 'updated',
      });
      expect(await stored(first.id)).toMatchObject({
        deleted_at: null,
        title: input.title,
        status: 'submitted',
        details: input.details,
        content_hash: activityContentHash(input),
      });
      expect(await count()).toBe(1);
    });

    it('can retire a reactivated activity again using the new source deletion timestamp', async () => {
      const first = await service.save(owner, activity());
      await service.retire(owner, retirement());
      await service.save(owner, activity());
      const input = retirement({
        source_deleted_at: '2026-11-10T12:00:00Z',
        source_updated_at: '2026-11-10T12:00:00Z',
      });
      expect(await service.retire(owner, input)).toEqual({
        id: first.id,
        outcome: 'retired',
      });
      expect((await stored(first.id)).deleted_at).toEqual(
        new Date(input.source_deleted_at),
      );
    });

    it('changes the retirement state only once for concurrent identical retirement requests', async () => {
      const first = await service.save(owner, activity());
      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.retire(owner, retirement())),
      );
      expect(results.every((result) => result.id === first.id)).toBe(true);
      expect(
        results.filter((result) => result.outcome === 'retired'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.outcome === 'unchanged'),
      ).toHaveLength(5);
      expect(await count()).toBe(1);
    });

    it('reactivates only once when identical active imports arrive concurrently', async () => {
      const first = await service.save(owner, activity());
      await service.retire(owner, retirement());
      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.save(owner, activity())),
      );
      expect(results.every((result) => result.id === first.id)).toBe(true);
      expect(
        results.filter((result) => result.outcome === 'updated'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.outcome === 'unchanged'),
      ).toHaveLength(5);
      expect((await stored(first.id)).deleted_at).toBeNull();
      expect(await count()).toBe(1);
    });

    it('rolls back an invalid retirement timestamp and keeps the activity intact', async () => {
      const first = await service.save(owner, activity());
      const before = await stored(first.id);
      await expect(
        service.retire(
          owner,
          retirement({ source_deleted_at: 'not-a-timestamp' }),
        ),
      ).rejects.toMatchObject({ code: '22007' });
      expect(await stored(first.id)).toEqual(before);
      expect((await service.retire(owner, retirement())).outcome).toBe(
        'retired',
      );
    });

    it('supports a known source deletion timestamp without a source modification timestamp', async () => {
      const first = await service.save(owner, activity());
      expect(
        await service.retire(owner, retirement({ source_updated_at: null })),
      ).toEqual({ id: first.id, outcome: 'retired' });
      expect(await stored(first.id)).toMatchObject({
        deleted_at: new Date(retirement().source_deleted_at),
        source_updated_at: null,
      });
    });
  });
});
