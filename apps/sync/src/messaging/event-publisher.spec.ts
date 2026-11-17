import { EventEmitter } from 'node:events';
import type { ConfirmChannel } from 'amqplib';
import { createSyncCompletedEvent } from '../events/create-sync-result-event';
import { publishSyncEvent } from './event-publisher';
import { SYNC_EVENT_EXCHANGE } from './sync-event-exchange';

describe('Confirmed event publication', () => {
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
  const publish = jest.fn<
    ReturnType<ConfirmChannel['publish']>,
    Parameters<ConfirmChannel['publish']>
  >();
  const waitForConfirms = jest.fn<Promise<void>, []>();
  const close = jest.fn<Promise<void>, []>();
  let channel: ConfirmChannel;

  beforeEach(() => {
    jest.useFakeTimers();
    publish.mockReset().mockReturnValue(true);
    waitForConfirms.mockReset().mockResolvedValue(undefined);
    close.mockReset().mockResolvedValue(undefined);
    channel = Object.assign(new EventEmitter(), {
      publish,
      waitForConfirms,
      close,
    }) as unknown as ConfirmChannel;
  });

  afterEach(() => {
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('waits for confirmation and preserves the complete envelope and identity on repeated publication', async () => {
    let confirm!: () => void;
    waitForConfirms.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    publish.mockReturnValueOnce(false); // Local backpressure is not a broker rejection.
    let finished = false;
    const pending = publishSyncEvent(channel, event).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    confirm();
    await pending;
    await publishSyncEvent(channel, event);
    expect(publish).toHaveBeenCalledTimes(2);
    for (const [exchange, routingKey, content, options] of publish.mock.calls) {
      expect(exchange).toBe(SYNC_EVENT_EXCHANGE);
      expect(routingKey).toBe('sync.completed');
      expect(JSON.parse(content.toString()) as unknown).toEqual(event);
      expect(options).toMatchObject({
        persistent: true,
        mandatory: true,
        contentType: 'application/json',
        messageId: event.event_id,
        correlationId: event.correlation_id,
        type: event.event_type,
        appId: 'sync',
      });
    }
    expect(close).not.toHaveBeenCalled();
  });

  it('rejects a returned event even if the broker confirms publication', async () => {
    publish.mockImplementationOnce(() => {
      channel.emit('return', {});
      return true;
    });
    await expect(publishSyncEvent(channel, event)).rejects.toThrow(
      'No se pudo confirmar',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed confirmation and closes the channel', async () => {
    waitForConfirms.mockRejectedValueOnce(new Error('private-broker-error'));
    await expect(publishSyncEvent(channel, event)).rejects.toThrow(
      'No se pudo confirmar la publicación del evento',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('times out even if closing the broken channel stalls', async () => {
    waitForConfirms.mockReturnValueOnce(new Promise<void>(() => {}));
    close.mockReturnValueOnce(new Promise<void>(() => {}));
    const rejected = expect(publishSyncEvent(channel, event)).rejects.toThrow(
      'No se pudo confirmar',
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(close).toHaveBeenCalledTimes(1);
  });
});
