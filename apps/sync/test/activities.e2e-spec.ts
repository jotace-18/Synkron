import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';

interface ActivityInput {
  tenantId: string;
  connectionId: string;
  collection: string;
  externalId: string;
  kind: string;
  role: string;
  date: string | null;
  at: string | null;
  endAt: string | null;
}

describe('Activities table (integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;

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
    connectionId = await createConnection(owner);
  });

  afterEach(async () => {
    // Delete children first: the foreign key deliberately prevents orphaning.
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
       VALUES ($1, 'Activities test', 'http://task-api:3000/tasks', 'none')
       RETURNING id`,
      [tenantId],
    );
    return result.rows[0].id;
  }

  function insertActivity(overrides: Partial<ActivityInput> = {}) {
    const input: ActivityInput = {
      tenantId: owner,
      connectionId,
      collection: 'assignments',
      externalId: '001',
      kind: 'date',
      role: 'deadline',
      date: '2026-11-12',
      at: null,
      endAt: null,
      ...overrides,
    };

    return database.query<{ id: string; external_id: string }>(
      `INSERT INTO sync.activities (
         tenant_id, source_connection_id, source_collection, external_id,
         type, title, time_kind, time_role, on_date, at, end_at, content_hash
       ) VALUES (
         $1, $2, $3, $4, 'academic.assignment', 'Test activity',
         $5, $6, $7, $8, $9, $10
       ) RETURNING id, external_id`,
      [
        input.tenantId,
        input.connectionId,
        input.collection,
        input.externalId,
        input.kind,
        input.role,
        input.date,
        input.at,
        input.endAt,
        'a'.repeat(64),
      ],
    );
  }

  it.each([
    { label: 'date deadline', role: 'deadline' },
    { label: 'date start', role: 'start' },
    {
      label: 'instant deadline',
      kind: 'instant',
      role: 'deadline',
      date: null,
      at: '2026-11-12T17:00:00Z',
    },
    {
      label: 'instant start',
      kind: 'instant',
      role: 'start',
      date: null,
      at: '2026-11-12T17:00:00Z',
    },
    {
      label: 'interval start',
      kind: 'interval',
      role: 'start',
      date: null,
      at: '2026-11-12T17:00:00Z',
      endAt: '2026-11-12T18:00:00Z',
    },
  ])('accepts a valid $label', async (schedule) => {
    const inserted = await insertActivity(schedule);
    expect(inserted.rows).toHaveLength(1);
    expect(typeof inserted.rows[0].id).toBe('string');
    expect(inserted.rows[0].external_id).toBe('001');
  });

  it.each([
    { label: 'date without a day', date: null },
    { label: 'date with an instant', at: '2026-11-12T17:00:00Z' },
    { label: 'date with an end', endAt: '2026-11-12T18:00:00Z' },
    { label: 'instant without a start', kind: 'instant', date: null },
    {
      label: 'instant with a day',
      kind: 'instant',
      at: '2026-11-12T17:00:00Z',
    },
    {
      label: 'instant with an end',
      kind: 'instant',
      date: null,
      at: '2026-11-12T17:00:00Z',
      endAt: '2026-11-12T18:00:00Z',
    },
  ])('rejects $label', async (schedule) => {
    await expect(insertActivity(schedule)).rejects.toMatchObject({
      code: '23514',
      constraint: 'activities_schedule_valid',
    });
  });

  it.each([
    { label: 'missing start', at: null },
    { label: 'missing end', endAt: null },
    { label: 'end before start', endAt: '2026-11-12T16:00:00Z' },
    { label: 'end equal to start', endAt: '2026-11-12T17:00:00Z' },
    { label: 'deadline role', role: 'deadline' },
    { label: 'additional day', date: '2026-11-12' },
  ])('rejects an interval with $label', async (schedule) => {
    await expect(
      insertActivity({
        kind: 'interval',
        role: 'start',
        date: null,
        at: '2026-11-12T17:00:00Z',
        endAt: '2026-11-12T18:00:00Z',
        ...schedule,
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'activities_schedule_valid',
    });
  });

  it('rejects a duplicate source identity even if its normalized type changes', async () => {
    const first = await insertActivity();
    await expect(insertActivity()).rejects.toMatchObject({
      code: '23505',
      constraint: 'activities_source_identity_unique',
    });
    await database.query('UPDATE sync.activities SET type = $1 WHERE id = $2', [
      'academic.exam',
      first.rows[0].id,
    ]);
    await expect(insertActivity()).rejects.toMatchObject({
      code: '23505',
      constraint: 'activities_source_identity_unique',
    });
  });

  it('distinguishes collections, connections, owners and textual external IDs', async () => {
    const anotherConnection = await createConnection(owner);
    const otherOwnerConnection = await createConnection(otherOwner);
    const results = [
      await insertActivity(),
      await insertActivity({ collection: 'exams' }),
      await insertActivity({ connectionId: anotherConnection }),
      await insertActivity({
        tenantId: otherOwner,
        connectionId: otherOwnerConnection,
      }),
      await insertActivity({ externalId: '1' }),
      await insertActivity({ externalId: 'ABC' }),
      await insertActivity({ externalId: 'abc' }),
    ];
    expect(new Set(results.map((result) => result.rows[0].id)).size).toBe(7);
  });

  it('rejects using another owner connection', async () => {
    await expect(
      insertActivity({ tenantId: otherOwner }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'activities_source_connection_fk',
    });
  });

  it('rejects a connection that does not exist', async () => {
    await expect(
      insertActivity({ connectionId: randomUUID() }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'activities_source_connection_fk',
    });
  });
});
