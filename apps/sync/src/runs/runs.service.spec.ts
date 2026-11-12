import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { SyncRun } from './run.types';
import { RunsService } from './runs.service';

describe('RunsService.createQueued', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const definitionId = '22222222-2222-4222-8222-222222222222';
  const definition = {
    id: definitionId,
    source_connection_id: '44444444-4444-4444-8444-444444444444',
    connector: 'academic.assignments',
    source_collection: 'assignments',
    enabled: true,
    connection_enabled: true,
    auth_type: 'bearer',
    has_credentials: true,
  };
  const run: SyncRun = {
    id: '33333333-3333-4333-8333-333333333333',
    definition_id: definitionId,
    status: 'queued',
    created_at: new Date('2026-11-10T15:00:00Z'),
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
  };
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const client = { query } as unknown as PoolClient;
  const transaction = jest.fn<
    Promise<SyncRun>,
    [(client: PoolClient) => Promise<SyncRun>]
  >();
  const readQuery = jest.fn<
    Promise<{ rows: unknown[] }>,
    [string, unknown[]?]
  >();
  const key = 'run-request-001';
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  let service: RunsService;

  function arrangeDefinition(rows: unknown[]) {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] }) // Transaction-scoped key lock.
      .mockResolvedValueOnce({ rows: [] }) // No previous accepted request.
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [run] })
      .mockResolvedValue({ rows: [] });
  }

  beforeEach(() => {
    arrangeDefinition([definition]);
    readQuery.mockReset();
    transaction
      .mockReset()
      .mockImplementation((operation) => operation(client));
    service = new RunsService({
      transaction,
      query: readQuery,
    } as unknown as DatabaseService);
  });

  it('returns a queued run after checking the owner definition and storing it in one transaction', async () => {
    await expect(service.createQueued(owner, definitionId)).resolves.toEqual(
      run,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[2][1]).toEqual([owner, definitionId]);
    expect(query.mock.calls[3][1]?.slice(0, 2)).toEqual([owner, definition.id]);
    expect(query.mock.calls[3][1]?.slice(4)).toEqual([
      definition.source_connection_id,
      definition.connector,
      definition.source_collection,
    ]);
    expect(query.mock.calls[4][1]).toEqual([owner, run.id]);
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('returns the same not-found error for a missing or foreign definition without writing a run', async () => {
    arrangeDefinition([]);
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects a disabled definition before recording a pending execution', async () => {
    arrangeDefinition([{ ...definition, enabled: false }]);
    await expect(service.createQueued(owner, definitionId)).rejects.toThrow(
      'La definición está deshabilitada',
    );
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects a disabled source connection even if the definition remains enabled', async () => {
    arrangeDefinition([{ ...definition, connection_enabled: false }]);
    await expect(
      service.createQueued(owner, definitionId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it.each([
    { auth_type: 'none', has_credentials: false },
    { auth_type: 'bearer', has_credentials: false },
  ])(
    'rejects source authentication that cannot support Academic: %j',
    async (change) => {
      arrangeDefinition([{ ...definition, ...change }]);
      await expect(
        service.createQueued(owner, definitionId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it('propagates a failed definition lookup without inserting a run', async () => {
    const error = new Error('Lookup failed');
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(error);
    await expect(service.createQueued(owner, definitionId)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('propagates a failed insert instead of returning a successful request', async () => {
    const error = new Error('Insert failed');
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [definition] })
      .mockRejectedValueOnce(error);
    await expect(service.createQueued(owner, definitionId)).rejects.toBe(error);
  });

  it('does not return the run when its transaction fails to commit', async () => {
    const error = new Error('Commit failed');
    transaction.mockRejectedValueOnce(error);
    await expect(service.createQueued(owner, definitionId)).rejects.toBe(error);
  });
  it('stores hashes instead of the raw request key and uses the same transactional client for the job', async () => {
    await service.createQueued(owner, definitionId, key);
    expect(query.mock.calls[3][1]?.slice(2, 4)).toEqual([
      digest(key),
      digest(`create-sync-run:${definitionId}:{}`),
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(key);
    expect(readQuery).not.toHaveBeenCalled();
  });

  it('returns the original public run on replay without inspecting current configuration or adding another job', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...run,
            request_fingerprint: digest(`create-sync-run:${definitionId}:{}`),
          },
        ],
      });
    await expect(
      service.createQueued(owner, definitionId.toUpperCase(), key),
    ).resolves.toEqual(run);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects reusing a key with another request without exposing its original run', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...run, request_fingerprint: 'different-fingerprint' }],
      });
    await expect(
      service.createQueued(owner, definitionId, key),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid key before starting a database transaction', async () => {
    await expect(
      service.createQueued(owner, definitionId, ' key '),
    ).rejects.toThrow('Idempotency-Key');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not acknowledge a request if its pending job could not be stored', async () => {
    const failure = new Error('Job insert failed');
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [definition] })
      .mockResolvedValueOnce({ rows: [run] })
      .mockRejectedValueOnce(failure);
    await expect(service.createQueued(owner, definitionId, key)).rejects.toBe(
      failure,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('looks up a run using both its ID and the verified account', async () => {
    readQuery.mockResolvedValueOnce({ rows: [run] });
    await expect(service.get(owner, run.id)).resolves.toEqual(run);
    expect(readQuery.mock.calls[0][1]).toEqual([owner, run.id]);
    expect(readQuery.mock.calls[0][0]).not.toContain('request_key_hash');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('uses the same public 404 for a missing or foreign run', async () => {
    readQuery.mockResolvedValueOnce({ rows: [] });
    await expect(service.get(owner, run.id)).rejects.toThrow(
      'Ejecución no encontrada',
    );
  });
});
