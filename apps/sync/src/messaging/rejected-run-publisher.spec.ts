import { EventEmitter } from 'node:events';
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import { publishRejectedRun } from './rejected-run-publisher';
import { SYNC_RUN_QUEUE, SYNC_RUN_REJECTED_QUEUE } from './sync-run-message';

function confirmation() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('Confirmed rejected-run publication', () => {
  const send = jest.fn<boolean, [string, Buffer, Options.Publish?]>();
  const confirms = jest.fn<Promise<void>, []>();
  const close = jest.fn<Promise<void>, []>();
  const ack = jest.fn<void, [ConsumeMessage]>();
  const delivery = {
    content: Buffer.from([0xff, 0x00, 0x7b]),
    properties: { headers: { untrusted: 'do-not-copy' } },
  } as unknown as ConsumeMessage;
  let channel: ConfirmChannel;

  beforeEach(() => {
    jest.useFakeTimers();
    send.mockReset().mockReturnValue(true);
    confirms.mockReset().mockResolvedValue(undefined);
    close.mockReset().mockResolvedValue(undefined);
    ack.mockReset();
    channel = Object.assign(new EventEmitter(), {
      sendToQueue: send,
      waitForConfirms: confirms,
      close,
      ack,
    }) as unknown as ConfirmChannel;
  });

  afterEach(() => jest.useRealTimers());

  it('preserves raw bytes and safe rejection metadata, waits for confirmation despite buffer backpressure and leaves the original unacknowledged', async () => {
    const broker = confirmation();
    confirms.mockReturnValueOnce(broker.promise);
    send.mockReturnValueOnce(false);
    const existing = jest.fn<void, []>();
    channel.on('return', existing);
    let finished = false;
    const pending = publishRejectedRun(
      channel,
      delivery,
      'invalid_message',
    ).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(send.mock.calls).toEqual([
      [
        SYNC_RUN_REJECTED_QUEUE,
        delivery.content,
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/octet-stream',
          headers: {
            'x-synkron-rejection-reason': 'invalid_message',
            'x-synkron-original-queue': SYNC_RUN_QUEUE,
          },
        },
      ],
    ]);
    expect(ack).not.toHaveBeenCalled();
    broker.resolve();
    await pending;
    expect(finished).toBe(true);
    expect(ack).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(channel.listeners('return')).toEqual([existing]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects a returned message even if RabbitMQ confirms the publication', async () => {
    send.mockImplementationOnce(() => {
      channel.emit('return', { content: Buffer.from('private payload') });
      return true;
    });
    await expect(
      publishRejectedRun(channel, delivery, 'run_not_found'),
    ).rejects.toThrow('No se pudo confirmar el mensaje rechazado');
    expect(close).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['send', 'confirm'] as const)(
    'reports a safe error on %s failure and preserves the original delivery',
    async (step) => {
      const error = new Error('private broker details');
      if (step === 'send')
        send.mockImplementationOnce(() => {
          throw error;
        });
      else confirms.mockRejectedValueOnce(error);
      close.mockRejectedValueOnce(new Error('Already closed'));
      await expect(
        publishRejectedRun(channel, delivery, 'run_not_recoverable'),
      ).rejects.toThrow(new Error('No se pudo confirmar el mensaje rechazado'));
      expect(close).toHaveBeenCalledTimes(1);
      expect(ack).not.toHaveBeenCalled();
      expect(channel.listenerCount('return')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('times out even if closing the channel stalls, and a late confirmation cannot change the outcome', async () => {
    const broker = confirmation();
    const closing = confirmation();
    confirms.mockReturnValueOnce(broker.promise);
    close.mockReturnValueOnce(closing.promise);
    const pending = publishRejectedRun(channel, delivery, 'invalid_message');
    const rejected = expect(pending).rejects.toThrow(
      'No se pudo confirmar el mensaje rechazado',
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(close).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    broker.resolve();
    closing.resolve();
    await expect(pending).rejects.toThrow(
      'No se pudo confirmar el mensaje rechazado',
    );
  });
});
