import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { DatabaseService } from '../src/database/database.service';
import { DefinitionsService } from '../src/definitions/definitions.service';
import { CreateDefinitionDto } from '../src/definitions/dto/create-definition.dto';

describe('DefinitionsService (PostgreSQL integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let service: DefinitionsService;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, DefinitionsService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    service = module.get(DefinitionsService);
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

  async function createConnection(
    tenantId: string,
    authType: 'none' | 'bearer' = 'bearer',
  ): Promise<string> {
    const result = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type, credentials_encrypted)
       VALUES ($1, 'Definition creation test', 'http://academic:3000/api/v1/assignments/export', $2, $3)
       RETURNING id`,
      [
        tenantId,
        authType,
        authType === 'bearer' ? 'test-encrypted-placeholder' : null,
      ],
    );
    return result.rows[0].id;
  }

  function input(overrides: Record<string, unknown> = {}): CreateDefinitionDto {
    return plainToInstance(CreateDefinitionDto, {
      name: "  Entregas d'académico  ",
      source_connection_id: connectionId,
      connector: 'academic.assignments',
      ...overrides,
    });
  }

  async function count(): Promise<number> {
    const result = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.definitions WHERE tenant_id = $1',
      [owner],
    );
    return result.rows[0].count;
  }

  it('creates the normalized definition and returns only its public fields', async () => {
    const result = await service.create(owner, input());
    expect(result).toEqual({
      id: result.id,
      name: "Entregas d'académico",
      source_connection_id: connectionId,
      connector: 'academic.assignments',
      source_collection: 'assignments',
      enabled: true,
      created_at: result.created_at,
      updated_at: result.updated_at,
    });
    expect(result.id).toMatch(/^[a-f0-9-]{36}$/i);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    const stored = await database.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM sync.definitions WHERE id = $1',
      [result.id],
    );
    expect(stored.rows[0].tenant_id).toBe(owner);
    expect(await count()).toBe(1);
  });

  it('keeps an explicitly disabled definition disabled', async () => {
    expect(
      (await service.create(owner, input({ enabled: false }))).enabled,
    ).toBe(false);
  });

  it('does not reveal another owner connection or create a definition for it', async () => {
    const foreignConnection = await createConnection(otherOwner);
    await expect(
      service.create(owner, input({ source_connection_id: foreignConnection })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await count()).toBe(0);
  });

  it('returns the same not-found error for a nonexistent connection', async () => {
    await expect(
      service.create(owner, input({ source_connection_id: randomUUID() })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await count()).toBe(0);
  });

  it('rejects disabled source connections without saving a definition', async () => {
    await database.query(
      'UPDATE sync.connections SET enabled = false WHERE tenant_id = $1 AND id = $2',
      [owner, connectionId],
    );
    await expect(service.create(owner, input())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await count()).toBe(0);
  });

  it('rejects a source without the Bearer configuration required by Academic', async () => {
    const anonymousConnection = await createConnection(owner, 'none');
    await expect(
      service.create(
        owner,
        input({ source_connection_id: anonymousConnection }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await count()).toBe(0);
  });

  it('reports duplicate active definitions as a conflict and retains the original', async () => {
    const first = await service.create(owner, input());
    await expect(
      service.create(owner, input({ name: 'Different name' })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await count()).toBe(1);
    const original = await database.query<{ id: string; name: string }>(
      'SELECT id, name FROM sync.definitions WHERE tenant_id = $1',
      [owner],
    );
    expect(original.rows).toEqual([{ id: first.id, name: first.name }]);
    expect(
      (await service.create(owner, input({ enabled: false }))).enabled,
    ).toBe(false);
  });

  it('permits disabled alternatives alongside the active definition', async () => {
    const active = await service.create(owner, input());
    const disabled = await service.create(owner, input({ enabled: false }));
    const anotherDisabled = await service.create(
      owner,
      input({ enabled: false }),
    );
    expect(new Set([active.id, disabled.id, anotherDisabled.id]).size).toBe(3);
    expect(await count()).toBe(3);
  });

  it('keeps separate source connections and owners independent', async () => {
    const anotherConnection = await createConnection(owner);
    const foreignConnection = await createConnection(otherOwner);
    const results = [
      await service.create(owner, input()),
      await service.create(
        owner,
        input({ source_connection_id: anotherConnection }),
      ),
      await service.create(
        otherOwner,
        input({ source_connection_id: foreignConnection }),
      ),
    ];
    expect(new Set(results.map((result) => result.id)).size).toBe(3);
    expect(await count()).toBe(2);
  });

  it('creates one active definition and returns one conflict for concurrent requests', async () => {
    const results = await Promise.allSettled([
      service.create(owner, input({ name: 'Concurrent A' })),
      service.create(owner, input({ name: 'Concurrent B' })),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    if (!rejected || rejected.status !== 'rejected')
      throw new Error('Expected a duplicate conflict');
    const error: unknown = rejected.reason;
    expect(error).toBeInstanceOf(ConflictException);
    expect(await count()).toBe(1);
  });
});
