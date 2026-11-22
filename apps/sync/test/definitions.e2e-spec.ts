import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';

interface DefinitionRow {
  id: string;
  tenant_id: string;
  source_connection_id: string;
  name: string;
  connector: string;
  source_collection: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DefinitionInput {
  tenantId: string;
  connectionId: string;
  name: string;
  connector: string;
  collection: string;
  enabled?: boolean;
}

describe('Sync definitions table (PostgreSQL integration)', () => {
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

  async function createConnection(tenantId: string): Promise<string> {
    const result = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
       VALUES ($1, 'Definition test', 'http://academic:3000/api/v1/assignments/export', 'none')
       RETURNING id`,
      [tenantId],
    );
    return result.rows[0].id;
  }

  async function insertDefinition(
    overrides: Partial<DefinitionInput> = {},
  ): Promise<DefinitionRow> {
    const input: DefinitionInput = {
      tenantId: owner,
      connectionId,
      name: "Centralizar entregas d'académico",
      connector: 'academic.assignments',
      collection: 'assignments',
      ...overrides,
    };
    const values: unknown[] = [
      input.tenantId,
      input.connectionId,
      input.name,
      input.connector,
      input.collection,
    ];
    // Omit enabled entirely to exercise the database default when it is not specified.
    const enabledColumn = input.enabled === undefined ? '' : ', enabled';
    const enabledParameter = input.enabled === undefined ? '' : ', $6';
    if (input.enabled !== undefined) values.push(input.enabled);
    const result = await database.query<DefinitionRow>(
      `INSERT INTO sync.definitions (
         tenant_id, source_connection_id, name, connector, source_collection${enabledColumn}
       ) VALUES ($1, $2, $3, $4, $5${enabledParameter}) RETURNING *`,
      values,
    );
    return result.rows[0];
  }

  it('creates an active academic definition with an ID, owner, source reference and timestamps', async () => {
    const created = await insertDefinition();
    expect(created.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    );
    expect(created).toMatchObject({
      tenant_id: owner,
      source_connection_id: connectionId,
      name: "Centralizar entregas d'académico",
      connector: 'academic.assignments',
      source_collection: 'assignments',
      enabled: true,
    });
    expect(created.created_at).toBeInstanceOf(Date);
    expect(created.updated_at).toEqual(created.created_at);
  });

  it('accepts a name at the maximum length', async () => {
    expect(
      (await insertDefinition({ name: 'x'.repeat(100) })).name,
    ).toHaveLength(100);
  });

  it.each(['', '   '])('rejects a blank definition name: %j', async (name) => {
    await expect(insertDefinition({ name })).rejects.toMatchObject({
      code: '23514',
      constraint: 'definitions_name_not_empty',
    });
  });

  it('rejects a name exceeding the database length limit', async () => {
    await expect(
      insertDefinition({ name: 'x'.repeat(101) }),
    ).rejects.toMatchObject({ code: '22001' });
  });

  it.each(['sport.tasks', ''])(
    'rejects an unsupported connector: %j',
    async (connector) => {
      await expect(insertDefinition({ connector })).rejects.toMatchObject({
        code: '23514',
        constraint: 'definitions_connector_valid',
      });
    },
  );

  it.each(['exams', ''])(
    'rejects a collection that the connector does not import: %j',
    async (collection) => {
      await expect(insertDefinition({ collection })).rejects.toMatchObject({
        code: '23514',
        constraint: 'definitions_collection_valid',
      });
    },
  );

  it('rejects another owner connection', async () => {
    await expect(
      insertDefinition({ tenantId: otherOwner }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'definitions_source_connection_fk',
    });
  });

  it('rejects a connection that does not exist', async () => {
    await expect(
      insertDefinition({ connectionId: randomUUID() }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'definitions_source_connection_fk',
    });
  });

  it('rejects a second active definition for the same source even if its name differs', async () => {
    await insertDefinition();
    await expect(
      insertDefinition({ name: 'Another name' }),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'definitions_active_source_unique',
    });
  });

  it('keeps multiple disabled definitions alongside one active definition', async () => {
    const active = await insertDefinition();
    const disabled = await insertDefinition({ enabled: false });
    const secondDisabled = await insertDefinition({ enabled: false });
    expect(new Set([active.id, disabled.id, secondDisabled.id]).size).toBe(3);
    expect(disabled.enabled).toBe(false);
    expect(secondDisabled.enabled).toBe(false);
  });

  it('permits a replacement after disabling the original and preserves the original row', async () => {
    const original = await insertDefinition();
    await database.query(
      'UPDATE sync.definitions SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, original.id],
    );
    const replacement = await insertDefinition();
    expect(replacement.id).not.toBe(original.id);
    const preserved = await database.query<DefinitionRow>(
      'SELECT * FROM sync.definitions WHERE tenant_id = $1 AND id = $2',
      [owner, original.id],
    );
    expect(preserved.rows[0]).toMatchObject({
      id: original.id,
      enabled: false,
      created_at: original.created_at,
    });
  });

  it('rejects reactivation when another definition already owns the active source slot', async () => {
    await insertDefinition();
    const disabled = await insertDefinition({ enabled: false });
    await expect(
      database.query(
        'UPDATE sync.definitions SET enabled = true WHERE tenant_id = $1 AND id = $2',
        [owner, disabled.id],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'definitions_active_source_unique',
    });
    const stored = await database.query<{ enabled: boolean }>(
      'SELECT enabled FROM sync.definitions WHERE tenant_id = $1 AND id = $2',
      [owner, disabled.id],
    );
    expect(stored.rows[0].enabled).toBe(false);
  });

  it('allows separate connections and owners to define the same collection independently', async () => {
    const anotherConnection = await createConnection(owner);
    const foreignConnection = await createConnection(otherOwner);
    const definitions = [
      await insertDefinition(),
      await insertDefinition({ connectionId: anotherConnection }),
      await insertDefinition({
        tenantId: otherOwner,
        connectionId: foreignConnection,
      }),
    ];
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(
      3,
    );
    expect(definitions.every((definition) => definition.enabled)).toBe(true);
  });

  it('allows only one active definition when two requests compete for the same source', async () => {
    const results = await Promise.allSettled([
      insertDefinition({ name: 'Concurrent A' }),
      insertDefinition({ name: 'Concurrent B' }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    if (!failed || failed.status !== 'rejected')
      throw new Error('Expected a conflicting insert');
    const error: unknown = failed.reason;
    expect(error).toMatchObject({
      code: '23505',
      constraint: 'definitions_active_source_unique',
    });
  });

  it('prevents deleting a connection that a definition still references', async () => {
    await insertDefinition();
    await expect(
      database.query(
        'DELETE FROM sync.connections WHERE tenant_id = $1 AND id = $2',
        [owner, connectionId],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'definitions_source_connection_fk',
    });
  });
});
