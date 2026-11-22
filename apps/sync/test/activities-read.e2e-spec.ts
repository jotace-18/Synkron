import { randomUUID } from 'node:crypto';
import { ActivitiesService } from '../src/activities/activities.service';
import type {
  ActivityInput,
  ActivitySchedule,
} from '../src/activities/activity.types';
import { ListActivitiesDto } from '../src/activities/dto/list-activities.dto';
import { DatabaseService } from '../src/database/database.service';

describe('Activity queries (PostgreSQL integration)', () => {
  const database = new DatabaseService();
  const service = new ActivitiesService(database);
  let owner: string;
  let otherOwner: string;
  let connectionId: string;

  async function connection(tenant: string) {
    const result = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Activity read fixture', 'http://academic:3000', 'none')
       RETURNING id`,
      [tenant],
    );
    return result.rows[0].id;
  }

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    connectionId = await connection(owner);
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
    await database.onModuleDestroy();
  });

  function day(date: string): ActivitySchedule {
    return { kind: 'date', role: 'deadline', date, at: null, end_at: null };
  }

  function instant(at: string): ActivitySchedule {
    return { kind: 'instant', role: 'start', date: null, at, end_at: null };
  }

  function interval(at: string, end_at: string): ActivitySchedule {
    return { kind: 'interval', role: 'start', date: null, at, end_at };
  }

  async function save(overrides: Partial<ActivityInput> = {}, tenant = owner) {
    // No lease or run job: fixtures never emit events or dispatch real work.
    return service.save(tenant, {
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: randomUUID(),
      type: 'academic.assignment',
      title: 'Activity read fixture',
      schedule: day('2026-07-01'),
      status: 'pending',
      details: { grade: null },
      source_updated_at: '2026-06-01T12:00:00.000Z',
      ...overrides,
    });
  }

  function list(filters: Partial<ListActivitiesDto> = {}) {
    return service.list(owner, Object.assign(new ListActivitiesDto(), filters));
  }

  it('returns the same public detail as the list and conceals foreign, missing and retired activities', async () => {
    const own = await save();
    const foreign = await save(
      { source_connection_id: await connection(otherOwner) },
      otherOwner,
    );
    await expect(service.get(owner, own.id)).resolves.toEqual(
      (await list())[0],
    );

    const notFound = {
      status: 404,
      response: { message: 'Actividad no encontrada' },
    };
    await expect(service.get(otherOwner, own.id)).rejects.toMatchObject(
      notFound,
    );
    await expect(service.get(owner, foreign.id)).rejects.toMatchObject(
      notFound,
    );
    await expect(service.get(owner, randomUUID())).rejects.toMatchObject(
      notFound,
    );

    await database.query(
      'UPDATE sync.activities SET deleted_at = now() WHERE tenant_id = $1 AND id = $2',
      [owner, own.id],
    );
    await expect(service.get(owner, own.id)).rejects.toMatchObject(notFound);
  });

  it('filters ownership, retirement, type and source before stable pagination and returns only public fields', async () => {
    const first = await save();
    const second = await save();
    const foreignConnection = await connection(otherOwner);
    await save(
      { source_connection_id: foreignConnection, schedule: day('2026-01-01') },
      otherOwner,
    );
    await save({
      source_connection_id: await connection(owner),
      schedule: day('2026-01-01'),
    });
    await save({ type: 'academic.exam', schedule: day('2026-01-01') });
    const retired = await save({ schedule: day('2026-01-01') });
    await database.query(
      'UPDATE sync.activities SET deleted_at = now() WHERE tenant_id = $1 AND id = $2',
      [owner, retired.id],
    );

    const filters = {
      type: 'academic.assignment' as const,
      source_connection_id: connectionId,
      limit: 1,
    };
    const pageOne = await list(filters);
    const pageTwo = await list({ ...filters, offset: 1 });
    expect([...pageOne, ...pageTwo].map((activity) => activity.id)).toEqual(
      [first.id, second.id].sort(),
    );
    expect(await list({ ...filters, offset: 2 })).toEqual([]);
    expect(await list({ source_connection_id: foreignConnection })).toEqual([]);
    expect(await list({ source_connection_id: randomUUID() })).toEqual([]);
    const stringValue: unknown = expect.any(String);
    expect(pageOne[0]).toEqual({
      id: stringValue,
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: stringValue,
      type: 'academic.assignment',
      title: 'Activity read fixture',
      schedule: day('2026-07-01'),
      status: 'pending',
      details: { grade: null },
      source_updated_at: '2026-06-01T12:00:00.000Z',
      created_at: stringValue,
      updated_at: stringValue,
      last_synced_at: stringValue,
    });
    expect(pageOne[0].created_at).toBe(
      new Date(pageOne[0].created_at).toISOString(),
    );
  });

  it('preserves date-only days and uses inclusive/exclusive local boundaries for instants', async () => {
    const date = await save();
    await save({ schedule: day('2026-06-30') });
    await save({ schedule: day('2026-07-02') });
    await save({ schedule: instant('2026-06-30T21:59:59.999Z') });
    const start = await save({ schedule: instant('2026-06-30T22:00:00.000Z') });
    const last = await save({ schedule: instant('2026-07-01T21:59:59.999Z') });
    const end = await save({ schedule: instant('2026-07-01T22:00:00.000Z') });
    const filters = { from: '2026-07-01', to: '2026-07-02' };
    const madrid = await list(filters);
    expect(madrid.map((activity) => activity.id)).toEqual([
      date.id,
      start.id,
      last.id,
    ]);
    expect(madrid[0].schedule).toEqual(day('2026-07-01'));
    expect(madrid[1].schedule).toEqual(instant('2026-06-30T22:00:00.000Z'));
    expect(
      (await list({ ...filters, timezone: 'UTC' })).map(
        (activity) => activity.id,
      ),
    ).toEqual([date.id, last.id, end.id]);
  });

  it('selects overlapping intervals without including boundary touches or clipping their real times', async () => {
    await save({
      schedule: interval(
        '2026-06-30T20:00:00.000Z',
        '2026-06-30T22:00:00.000Z',
      ),
    });
    await save({
      schedule: interval(
        '2026-07-01T22:00:00.000Z',
        '2026-07-01T23:00:00.000Z',
      ),
    });
    const crossingStart = interval(
      '2026-06-30T21:00:00.000Z',
      '2026-06-30T23:00:00.000Z',
    );
    const before = await save({ schedule: crossingStart });
    const spans = await save({
      schedule: interval(
        '2026-06-30T21:30:00.000Z',
        '2026-07-01T23:00:00.000Z',
      ),
    });
    const inside = await save({
      schedule: interval(
        '2026-07-01T10:00:00.000Z',
        '2026-07-01T11:00:00.000Z',
      ),
    });
    const after = await save({
      schedule: interval(
        '2026-07-01T21:00:00.000Z',
        '2026-07-01T23:00:00.000Z',
      ),
    });
    const result = await list({ from: '2026-07-01', to: '2026-07-02' });
    expect(result.map((activity) => activity.id)).toEqual([
      before.id,
      spans.id,
      inside.id,
      after.id,
    ]);
    expect(result[0].schedule).toEqual(crossingStart);
  });

  it.each([
    {
      label: '23-hour spring day',
      from: '2026-03-29',
      to: '2026-03-30',
      start: '2026-03-28T23:00:00.000Z',
      end: '2026-03-29T22:00:00.000Z',
    },
    {
      label: '25-hour autumn day',
      from: '2026-10-25',
      to: '2026-10-26',
      start: '2026-10-24T22:00:00.000Z',
      end: '2026-10-25T23:00:00.000Z',
    },
  ])(
    'uses the complete $label in Europe/Madrid',
    async ({ from, to, start, end }) => {
      await save({
        schedule: instant(new Date(Date.parse(start) - 1).toISOString()),
      });
      const first = await save({ schedule: instant(start) });
      const last = await save({
        schedule: instant(new Date(Date.parse(end) - 1).toISOString()),
      });
      await save({ schedule: instant(end) });
      expect((await list({ from, to })).map((activity) => activity.id)).toEqual(
        [first.id, last.id],
      );
    },
  );
});
