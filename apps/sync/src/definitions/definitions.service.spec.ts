import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { DefinitionsService } from './definitions.service';
import type { SyncDefinition } from './definition.types';
import { CreateDefinitionDto } from './dto/create-definition.dto';

describe('DefinitionsService.create', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const connectionId = '22222222-2222-4222-8222-222222222222';
  const connection = {
    id: connectionId,
    enabled: true,
    auth_type: 'bearer',
    has_credentials: true,
  };
  const definition: SyncDefinition = {
    id: '33333333-3333-4333-8333-333333333333',
    name: "Entregas d'académico",
    source_connection_id: connectionId,
    connector: 'academic.assignments',
    source_collection: 'assignments',
    enabled: true,
    created_at: new Date('2026-11-09T12:00:00Z'),
    updated_at: new Date('2026-11-09T12:00:00Z'),
  };
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const client = { query } as unknown as PoolClient;
  const transaction = jest.fn<
    Promise<SyncDefinition>,
    [(client: PoolClient) => Promise<SyncDefinition>]
  >();
  let service: DefinitionsService;

  function input(): CreateDefinitionDto {
    return Object.assign(new CreateDefinitionDto(), {
      name: definition.name,
      source_connection_id: connectionId,
      connector: 'academic.assignments',
    });
  }

  beforeEach(() => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [connection] })
      .mockResolvedValue({ rows: [definition] });
    transaction
      .mockReset()
      .mockImplementation((operation) => operation(client));
    service = new DefinitionsService({
      transaction,
    } as unknown as DatabaseService);
  });

  it('creates the definition inside a transaction using only the verified owner and fixed collection', async () => {
    const body = Object.assign(input(), {
      tenant_id: 'untrusted-owner',
      source_collection: 'untrusted-collection',
    });
    await expect(service.create(owner, body)).resolves.toEqual(definition);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([owner, connectionId]);
    expect(query.mock.calls[0][0]).toContain('FOR SHARE');
    expect(query.mock.calls[1][1]).toEqual([
      owner,
      connectionId,
      definition.name,
      'academic.assignments',
      true,
    ]);
    expect(query.mock.calls[1][0]).not.toContain(definition.name);
    expect(query.mock.calls[1][0]).toContain("'assignments'");
  });

  it('preserves an explicitly disabled definition', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [connection] })
      .mockResolvedValueOnce({ rows: [{ ...definition, enabled: false }] });
    await expect(
      service.create(owner, { ...input(), enabled: false }),
    ).resolves.toEqual({ ...definition, enabled: false });
    expect(query.mock.calls[1][1]?.[4]).toBe(false);
  });

  it('rejects a missing or foreign connection without attempting an insert', async () => {
    query.mockReset().mockResolvedValueOnce({ rows: [] });
    await expect(service.create(owner, input())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects a disabled connection even when the requested definition is disabled', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ ...connection, enabled: false }] });
    await expect(
      service.create(owner, { ...input(), enabled: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { auth_type: 'none', has_credentials: false },
    { auth_type: 'bearer', has_credentials: false },
  ])('rejects an incompatible source configuration: %j', async (changes) => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ ...connection, ...changes }] });
    await expect(service.create(owner, input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('translates only the known active-definition uniqueness conflict into HTTP 409', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [connection] })
      .mockRejectedValueOnce({
        code: '23505',
        constraint: 'definitions_active_source_unique',
        detail: 'private database details',
      });
    await expect(service.create(owner, input())).rejects.toThrow(
      'Ya existe una definición activa para esta conexión y colección',
    );
  });

  it.each([
    new Error('Database unavailable'),
    { code: '23505', constraint: 'another_unique_constraint' },
    { code: '23514', constraint: 'definitions_connector_valid' },
  ])(
    'propagates unexpected database errors without disguising them as duplicate definitions',
    async (error) => {
      query
        .mockReset()
        .mockResolvedValueOnce({ rows: [connection] })
        .mockRejectedValueOnce(error);
      await expect(service.create(owner, input())).rejects.toBe(error);
    },
  );

  it('propagates a failed connection lookup without attempting an insert', async () => {
    const error = new Error('Lookup failed');
    query.mockReset().mockRejectedValueOnce(error);
    await expect(service.create(owner, input())).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not return a definition when its transaction fails to commit', async () => {
    const error = new Error('Commit failed');
    transaction.mockRejectedValueOnce(error);
    await expect(service.create(owner, input())).rejects.toBe(error);
  });
});
