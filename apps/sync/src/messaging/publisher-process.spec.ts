import { setImmediate as nextTurn } from 'node:timers/promises';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { runPublisherProcess } from './publisher-process';
import { openRunPublisher, publishRunMessage } from './run-publisher';

jest.mock('../database/database.service', () => ({
  DatabaseService: jest.fn(),
}));
jest.mock('./run-publisher', () => ({
  openRunPublisher: jest.fn(),
  publishRunMessage: jest.fn(),
}));

// Run the real loop and job service; simulate only PostgreSQL and Rabbit I/O.
describe('Continuous publisher process lifecycle', () => {
  const job = {
    run_id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '22222222-2222-4222-8222-222222222222',
  };
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const client = { query } as unknown as PoolClient;
  const transaction = jest.fn<
    Promise<boolean>,
    [(client: PoolClient) => Promise<boolean>]
  >();
  const destroy = jest.fn<Promise<void>, []>();
  const connectionClose = jest.fn<Promise<void>, []>();
  const channel = {} as ConfirmChannel;
  const connection = { close: connectionClose } as unknown as ChannelModel;
  const openMock = jest.mocked(openRunPublisher);
  const sendMock = jest.mocked(publishRunMessage);
  let controller: AbortController;
  let log: jest.SpyInstance;

  beforeEach(() => {
    controller = new AbortController();
    query.mockReset().mockResolvedValue({ rows: [] });
    transaction
      .mockReset()
      .mockImplementation((operation) => operation(client));
    destroy.mockReset().mockResolvedValue(undefined);
    connectionClose.mockReset().mockResolvedValue(undefined);
    jest
      .mocked(DatabaseService)
      .mockReset()
      .mockImplementation(
        () =>
          ({
            transaction,
            onModuleDestroy: destroy,
          }) as unknown as DatabaseService,
      );
    openMock.mockReset().mockResolvedValue({ connection, channel });
    sendMock.mockReset().mockResolvedValue(undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.abort();
    log.mockRestore();
  });

  function stopAfterEmptyLookup() {
    query.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ rows: [] });
    });
  }

  it('reuses one database pool, Rabbit connection and confirm channel across several jobs', async () => {
    const second = { ...job, run_id: '33333333-3333-4333-8333-333333333333' };
    query
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [second] })
      .mockResolvedValueOnce({ rows: [] });
    stopAfterEmptyLookup();
    await expect(
      runPublisherProcess(controller.signal),
    ).resolves.toBeUndefined();
    expect(jest.mocked(DatabaseService)).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls).toEqual([
      [channel, { schema_version: 1, ...job }],
      [channel, { schema_version: 1, ...second }],
    ]);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([['Publicador de ejecuciones activo']]);
  });

  it('cancels idle waiting and closes both resources when stopped', async () => {
    const pending = runPublisherProcess(controller.signal);
    await nextTurn();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(connectionClose).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('finishes the current confirmation and database update before closing on stop', async () => {
    let entered!: () => void;
    let confirm!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const confirmation = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    query.mockResolvedValueOnce({ rows: [job] });
    sendMock.mockImplementationOnce(() => {
      entered();
      return confirmation;
    });
    const pending = runPublisherProcess(controller.signal);
    await started;
    controller.abort();
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    expect(connectionClose).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    confirm();
    await pending;
    expect(query.mock.calls[1][1]).toEqual([job.tenant_id, job.run_id]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('closes the database if Rabbit cannot be prepared, without starting the loop', async () => {
    const error = new Error('Publisher preparation failed');
    openMock.mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(transaction).not.toHaveBeenCalled();
    expect(connectionClose).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('stops and closes both connections if PostgreSQL selection fails', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(sendMock).not.toHaveBeenCalled();
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('stops after a send failure instead of reusing the damaged publisher', async () => {
    const error = new Error('Confirmation failed');
    query.mockResolvedValueOnce({ rows: [job] });
    sendMock.mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('closes both connections when recording an already confirmed publication fails', async () => {
    const error = new Error('Publication update failed');
    query.mockResolvedValueOnce({ rows: [job] }).mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still closes PostgreSQL when closing Rabbit fails during shutdown', async () => {
    const error = new Error('Connection close failed');
    stopAfterEmptyLookup();
    connectionClose.mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('propagates database cleanup errors after closing Rabbit', async () => {
    const error = new Error('Database close failed');
    stopAfterEmptyLookup();
    destroy.mockRejectedValueOnce(error);
    await expect(runPublisherProcess(controller.signal)).rejects.toBe(error);
    expect(connectionClose).toHaveBeenCalledTimes(1);
  });
});
