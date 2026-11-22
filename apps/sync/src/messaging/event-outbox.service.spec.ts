import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { createSyncCompletedEvent } from '../events/create-sync-result-event';
import type { SyncEvent } from '../events/sync-event.types';
import { EventOutboxService } from './event-outbox.service';

describe('Pending event publication', () => {
  const event = createSyncCompletedEvent(
    '11111111-1111-4111-8111-111111111111',
    {
      sync_run_id: '22222222-2222-4222-8222-222222222222',
      definition_id: '33333333-3333-4333-8333-333333333333',
      counts: {
        read: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        retired: 0,
        ignored: 0,
      },
    },
  );
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const transaction = jest.fn<
    Promise<boolean>,
    [(client: PoolClient) => Promise<boolean>]
  >();
  const publish = jest.fn<Promise<void>, [SyncEvent]>();
  let service: EventOutboxService;

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{ ...event, occurred_at: new Date(event.occurred_at) }],
    });
    transaction
      .mockReset()
      .mockImplementation((operation) =>
        operation({ query } as unknown as PoolClient),
      );
    publish.mockReset().mockResolvedValue(undefined);
    service = new EventOutboxService({
      transaction,
    } as unknown as DatabaseService);
  });

  it('marks only the selected event using the same transaction after the send is confirmed', async () => {
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
    expect(publish).toHaveBeenCalledWith(event);
    confirm();
    await expect(pending).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[1][1]).toEqual([event.tenant_id, event.event_id]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('preserves automation origin in publication and omits it for root events', async () => {
    const actionId = '44444444-4444-4444-8444-444444444444';
    query.mockReset().mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [
        {
          ...event,
          occurred_at: new Date(event.occurred_at),
          automation_action_id: actionId,
        },
      ],
    });

    await expect(service.publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls[0][0]).toEqual({
      ...event,
      automation_action_id: actionId,
    });

    query.mockResolvedValueOnce({
      rows: [
        {
          ...event,
          occurred_at: new Date(event.occurred_at),
          automation_action_id: null,
        },
      ],
    });

    await expect(service.publishNext(publish)).resolves.toBe(true);
    expect(publish.mock.calls[1][0]).toEqual(event);
    expect(publish.mock.calls[1][0]).not.toHaveProperty('automation_action_id');
  });

  it('propagates a send failure without marking the event as published', async () => {
    const error = new Error('Broker did not confirm');
    publish.mockRejectedValueOnce(error);
    await expect(service.publishNext(publish)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not publish when no pending event exists', async () => {
    query.mockReset().mockResolvedValueOnce({ rows: [] });
    await expect(service.publishNext(publish)).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
