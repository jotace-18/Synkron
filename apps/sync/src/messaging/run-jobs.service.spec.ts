import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { SyncRunMessage } from './sync-run-message';
import { RunJobsService } from './run-jobs.service';

describe('Pending run publication', () => {
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
  const publish = jest.fn<Promise<void>, [SyncRunMessage]>();
  let service: RunJobsService;

  beforeEach(() => {
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValue({ rows: [] });
    transaction
      .mockReset()
      .mockImplementation((operation) => operation(client));
    publish.mockReset().mockResolvedValue(undefined);
    service = new RunJobsService({ transaction } as unknown as DatabaseService);
  });

  it('returns false without sending or updating when no work is available', async () => {
    query.mockReset().mockResolvedValueOnce({ rows: [] });
    await expect(service.publishNext(publish)).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('sends only the version and owned run identity, then updates that job in the same transaction', async () => {
    await expect(service.publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls).toEqual([[{ schema_version: 1, ...job }]]);
    expect(query.mock.calls[1][1]).toEqual([job.tenant_id, job.run_id]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not mark the work as published until the send promise is confirmed', async () => {
    let confirm!: () => void;
    let entered!: () => void;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const confirmation = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    publish.mockImplementationOnce(() => {
      entered();
      return confirmation;
    });
    const pending = service.publishNext(publish);
    await sending;
    expect(query).toHaveBeenCalledTimes(1);
    confirm();
    await expect(pending).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not call the sender if selecting work fails', async () => {
    const error = new Error('Lookup failed');
    query.mockReset().mockRejectedValueOnce(error);
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not mark a job when sending is rejected', async () => {
    const error = new Error('Broker did not confirm');
    publish.mockRejectedValueOnce(error);
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('also propagates a synchronous sender failure without updating the job', async () => {
    const error = new Error('Sender failed');
    publish.mockImplementationOnce(() => {
      throw error;
    });
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not report success when recording the broker confirmation fails', async () => {
    const error = new Error('Update failed');
    query
      .mockReset()
      .mockResolvedValueOnce({ rows: [job] })
      .mockRejectedValueOnce(error);
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does not return true if committing the transaction fails', async () => {
    const error = new Error('Commit failed');
    transaction.mockImplementationOnce(async (operation) => {
      await operation(client);
      throw error;
    });
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
