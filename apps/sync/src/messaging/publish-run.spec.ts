import type { ChannelModel, ConfirmChannel } from 'amqplib';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { publishOneRun } from './publish-run';
import { openRunPublisher, publishRunMessage } from './run-publisher';

jest.mock('../database/database.service', () => ({
  DatabaseService: jest.fn(),
}));
jest.mock('./run-publisher', () => ({
  openRunPublisher: jest.fn(),
  publishRunMessage: jest.fn(),
}));

// Keep the real RunJobsService here: this suite checks the connection between
// transaction selection, sending, marking publication and resource cleanup.
describe('Publish one pending run command', () => {
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

  beforeEach(() => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValue({ rows: [] });
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
  });

  it('connects the selected job to the confirmed sender and closes both resources after marking publication', async () => {
    await expect(publishOneRun()).resolves.toBe(true);
    expect(sendMock.mock.calls).toEqual([
      [channel, { schema_version: 1, ...job }],
    ]);
    expect(query.mock.calls[1][1]).toEqual([job.tenant_id, job.run_id]);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('does not update or close resources prematurely while broker confirmation is pending', async () => {
    let confirm!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const confirmation = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    sendMock.mockImplementationOnce(() => {
      entered();
      return confirmation;
    });
    const pending = publishOneRun();
    await started;
    expect(query).toHaveBeenCalledTimes(1);
    expect(connectionClose).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    confirm();
    await expect(pending).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('returns false and closes both resources when no pending work is available', async () => {
    query.mockReset().mockResolvedValueOnce({ rows: [] });
    await expect(publishOneRun()).resolves.toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('closes PostgreSQL without selecting work if preparing Rabbit fails', async () => {
    const error = new Error('Publisher preparation failed');
    openMock.mockRejectedValueOnce(error);
    await expect(publishOneRun()).rejects.toBe(error);
    expect(transaction).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(connectionClose).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('closes both resources and performs no update if sending is not confirmed', async () => {
    const error = new Error('No broker confirmation');
    sendMock.mockRejectedValueOnce(error);
    await expect(publishOneRun()).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('closes Rabbit and PostgreSQL if selecting the next job fails', async () => {
    const error = new Error('Storage unavailable');
    query.mockReset().mockRejectedValueOnce(error);
    await expect(publishOneRun()).rejects.toBe(error);
    expect(sendMock).not.toHaveBeenCalled();
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('does not report success when the database transaction fails after a confirmed send', async () => {
    const error = new Error('Commit failed');
    transaction.mockImplementationOnce(async (operation) => {
      await operation(client);
      throw error;
    });
    await expect(publishOneRun()).rejects.toBe(error);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still closes PostgreSQL if closing Rabbit fails', async () => {
    const error = new Error('Rabbit close failed');
    connectionClose.mockRejectedValueOnce(error);
    await expect(publishOneRun()).rejects.toBe(error);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('propagates PostgreSQL cleanup failure after closing Rabbit', async () => {
    const error = new Error('Database cleanup failed');
    destroy.mockRejectedValueOnce(error);
    await expect(publishOneRun()).rejects.toBe(error);
    expect(connectionClose).toHaveBeenCalledTimes(1);
  });
});
