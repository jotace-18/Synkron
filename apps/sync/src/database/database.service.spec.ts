import { Pool, type PoolClient } from 'pg';
import { DatabaseService } from './database.service';

jest.mock('pg', () => ({ Pool: jest.fn() }));

describe('DatabaseService.transaction', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const release = jest.fn<void, [boolean?]>();
  const client = { query, release } as unknown as PoolClient;
  const connect = jest.fn<Promise<PoolClient>, []>();
  const poolQuery = jest.fn();
  let service: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset().mockResolvedValue({ rows: [] });
    connect.mockReset().mockResolvedValue(client);
    jest.mocked(Pool).mockImplementation(
      () =>
        ({
          on: jest.fn(),
          connect,
          query: poolQuery,
          end: jest.fn(),
        }) as unknown as Pool,
    );
    service = new DatabaseService();
  });

  it('runs all statements on one checked-out connection, commits and returns the operation result', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ value: 42 }] });

    await expect(
      service.transaction(async (connection) => {
        expect(connection).toBe(client);
        const result = await connection.query<{ value: number }>(
          'SELECT $1::integer AS value',
          [42],
        );
        return result.rows[0].value;
      }),
    ).resolves.toBe(42);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls).toEqual([
      ['BEGIN'],
      ['SELECT $1::integer AS value', [42]],
      ['COMMIT'],
    ]);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('rolls back an operation failure, releases the connection and propagates the original error', async () => {
    const error = new Error('Operation failed');
    await expect(
      service.transaction(async () => {
        await Promise.resolve();
        throw error;
      }),
    ).rejects.toBe(error);

    expect(query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('rolls back when a statement inside the operation fails', async () => {
    const error = new Error('Statement failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(error);

    await expect(
      service.transaction(async (connection) => {
        await connection.query('UPDATE test SET value = $1', [42]);
      }),
    ).rejects.toBe(error);

    expect(query.mock.calls).toEqual([
      ['BEGIN'],
      ['UPDATE test SET value = $1', [42]],
      ['ROLLBACK'],
    ]);
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('discards a connection if rollback fails while preserving the operation error', async () => {
    const original = new Error('Original failure');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('Rollback failed'));

    await expect(
      service.transaction(() => Promise.reject(original)),
    ).rejects.toBe(original);

    expect(query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(release.mock.calls).toEqual([[true]]);
  });

  it('does not run the operation or report success if commit fails', async () => {
    const error = new Error('Commit failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(error);
    const operation = jest.fn().mockResolvedValue('pending result');

    await expect(service.transaction(operation)).rejects.toBe(error);

    expect(operation.mock.calls).toEqual([[client]]);
    expect(query.mock.calls).toEqual([['BEGIN'], ['COMMIT'], ['ROLLBACK']]);
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('does not invoke the operation if beginning the transaction fails', async () => {
    const error = new Error('Begin failed');
    query.mockRejectedValueOnce(error);
    const operation = jest.fn().mockResolvedValue('unused');

    await expect(service.transaction(operation)).rejects.toBe(error);

    expect(operation).not.toHaveBeenCalled();
    expect(query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('propagates an acquisition failure without invoking the operation or releasing an unacquired client', async () => {
    const error = new Error('Pool unavailable');
    connect.mockRejectedValueOnce(error);
    const operation = jest.fn().mockResolvedValue('unused');

    await expect(service.transaction(operation)).rejects.toBe(error);

    expect(operation).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('waits for the asynchronous operation before committing or releasing its connection', async () => {
    let finish!: (value: number) => void;
    let started!: () => void;
    const operationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = service.transaction(() => {
      started();
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    });
    await operationStarted;

    expect(query.mock.calls).toEqual([['BEGIN']]);
    expect(release).not.toHaveBeenCalled();

    finish(42);
    await expect(pending).resolves.toBe(42);
    expect(query.mock.calls).toEqual([['BEGIN'], ['COMMIT']]);
    expect(release.mock.calls).toEqual([[false]]);
  });
});
