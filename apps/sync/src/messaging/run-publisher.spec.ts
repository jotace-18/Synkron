import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel, Options, Replies } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { openRunPublisher, publishRunMessage } from './run-publisher';
import { SYNC_RUN_QUEUE, type SyncRunMessage } from './sync-run-message';

jest.mock('./rabbitmq-connection', () => ({ connectRabbitmq: jest.fn() }));

function confirmation() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const message: SyncRunMessage = {
  schema_version: 1,
  run_id: 'abcdef12-3456-4789-8abc-123456789abc',
  tenant_id: 'fedcba98-7654-4321-9abc-abcdef123456',
};

describe('Confirmed run publication', () => {
  const connectMock = jest.mocked(connectRabbitmq);
  const assertQueue = jest.fn<
    Promise<Replies.AssertQueue>,
    [string, Options.AssertQueue?]
  >();
  const createConfirmChannel = jest.fn<Promise<ConfirmChannel>, []>();
  const connectionClose = jest.fn<Promise<void>, []>();
  const channelClose = jest.fn<Promise<void>, []>();
  const sendToQueue = jest.fn<boolean, [string, Buffer, Options.Publish?]>();
  const waitForConfirms = jest.fn<Promise<void>, []>();
  let channel: ConfirmChannel;
  let connection: ChannelModel;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    channel = Object.assign(new EventEmitter(), {
      assertQueue,
      close: channelClose,
      sendToQueue,
      waitForConfirms,
    }) as unknown as ConfirmChannel;
    connection = {
      createConfirmChannel,
      close: connectionClose,
    } as unknown as ChannelModel;
    connectMock.mockReset().mockResolvedValue(connection);
    createConfirmChannel.mockReset().mockResolvedValue(channel);
    connectionClose.mockReset().mockResolvedValue(undefined);
    channelClose.mockReset().mockResolvedValue(undefined);
    assertQueue.mockReset().mockResolvedValue({
      queue: SYNC_RUN_QUEUE,
      messageCount: 0,
      consumerCount: 0,
    });
    sendToQueue.mockReset().mockReturnValue(true);
    waitForConfirms.mockReset().mockResolvedValue(undefined);
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logError.mockRestore();
    jest.useRealTimers();
  });

  it('opens a confirm channel, ensures the queue and leaves resources open for the publishing loop', async () => {
    await expect(openRunPublisher()).resolves.toEqual({ connection, channel });
    expect(createConfirmChannel).toHaveBeenCalledTimes(1);
    expect(assertQueue.mock.calls[0][0]).toBe(SYNC_RUN_QUEUE);
    expect(connectionClose).not.toHaveBeenCalled();
    expect(channelClose).not.toHaveBeenCalled();
  });

  it('propagates a connection failure without trying to prepare a channel', async () => {
    const error = new Error('Cannot connect');
    connectMock.mockRejectedValueOnce(error);
    await expect(openRunPublisher()).rejects.toBe(error);
    expect(createConfirmChannel).not.toHaveBeenCalled();
    expect(connectionClose).not.toHaveBeenCalled();
  });

  it('closes the connection if creating the confirm channel fails', async () => {
    createConfirmChannel.mockRejectedValueOnce(
      new Error('private-channel-error'),
    );
    await expect(openRunPublisher()).rejects.toThrow(
      new Error('No se pudo preparar el publicador de ejecuciones'),
    );
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(assertQueue).not.toHaveBeenCalled();
  });

  it('handles queue declaration errors and their channel events without leaking their contents', async () => {
    const error = new Error('private-declaration-error');
    assertQueue.mockImplementationOnce(() => {
      channel.emit('error', error);
      return Promise.reject(error);
    });
    await expect(openRunPublisher()).rejects.toThrow(
      new Error('No se pudo preparar el publicador de ejecuciones'),
    );
    expect(connectionClose).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls).toEqual([
      ['Error en el canal de publicación de ejecuciones'],
    ]);
  });

  it('preserves the safe preparation error when closing the connection also fails', async () => {
    createConfirmChannel.mockRejectedValueOnce(new Error('private-init-error'));
    connectionClose.mockRejectedValueOnce(new Error('private-close-error'));
    await expect(openRunPublisher()).rejects.toThrow(
      new Error('No se pudo preparar el publicador de ejecuciones'),
    );
  });

  it('sends only validated JSON with persistence, mandatory routing and stable message identity', async () => {
    await expect(
      publishRunMessage(channel, {
        ...message,
        run_id: message.run_id.toUpperCase(),
        tenant_id: message.tenant_id.toUpperCase(),
      }),
    ).resolves.toBeUndefined();
    const [queue, content, options] = sendToQueue.mock.calls[0];
    const decoded: unknown = JSON.parse(content.toString('utf8'));
    expect(decoded).toEqual(message);
    expect(queue).toBe(SYNC_RUN_QUEUE);
    expect(options).toEqual({
      persistent: true,
      mandatory: true,
      contentType: 'application/json',
      messageId: message.run_id,
    });
    expect(waitForConfirms).toHaveBeenCalledTimes(1);
    expect(channelClose).not.toHaveBeenCalled();
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([true, false])(
    'waits for confirmation regardless of the local send buffer result: %s',
    async (writable) => {
      const broker = confirmation();
      sendToQueue.mockReturnValueOnce(writable);
      waitForConfirms.mockReturnValueOnce(broker.promise);
      let finished = false;
      const pending = publishRunMessage(channel, message).then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(channel.listenerCount('return')).toBe(1);
      broker.resolve();
      await pending;
      expect(finished).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('rejects an unroutable message even when the broker subsequently acknowledges the publication', async () => {
    sendToQueue.mockImplementationOnce(() => {
      channel.emit('return', { content: Buffer.from('private-payload') });
      return true;
    });
    await expect(publishRunMessage(channel, message)).rejects.toThrow(
      new Error('No se pudo confirmar la publicación de la ejecución'),
    );
    expect(channelClose).toHaveBeenCalledTimes(1);
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects broker nack or channel failure without exposing the client error', async () => {
    waitForConfirms.mockRejectedValueOnce(
      new Error('private-confirmation-error'),
    );
    channelClose.mockRejectedValueOnce(new Error('Already closed'));
    await expect(publishRunMessage(channel, message)).rejects.toThrow(
      new Error('No se pudo confirmar la publicación de la ejecución'),
    );
    expect(channelClose).toHaveBeenCalledTimes(1);
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects a synchronous send failure and removes its listener', async () => {
    sendToQueue.mockImplementationOnce(() => {
      throw new Error('private-send-error');
    });
    await expect(publishRunMessage(channel, message)).rejects.toThrow(
      new Error('No se pudo confirmar la publicación de la ejecución'),
    );
    expect(waitForConfirms).not.toHaveBeenCalled();
    expect(channelClose).toHaveBeenCalledTimes(1);
    expect(channel.listenerCount('return')).toBe(0);
  });

  it('times out without waiting indefinitely for a broken channel to close', async () => {
    const broker = confirmation();
    const closing = confirmation();
    waitForConfirms.mockReturnValueOnce(broker.promise);
    channelClose.mockReturnValueOnce(closing.promise);
    const pending = publishRunMessage(channel, message);
    const rejected = expect(pending).rejects.toThrow(
      new Error('No se pudo confirmar la publicación de la ejecución'),
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(channelClose).toHaveBeenCalledTimes(1);
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    // A late broker response must not turn a rejected send into success.
    broker.resolve();
    closing.resolve();
    await Promise.resolve();
    await expect(pending).rejects.toThrow('No se pudo confirmar');
  });

  it('rejects malformed outgoing identities before touching the channel', async () => {
    await expect(
      publishRunMessage(channel, { ...message, run_id: 'invalid' }),
    ).rejects.toThrow('Mensaje de ejecución no válido');
    expect(sendToQueue).not.toHaveBeenCalled();
    expect(waitForConfirms).not.toHaveBeenCalled();
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('supports sequential confirmed sends without accumulating timers or return listeners', async () => {
    await publishRunMessage(channel, message);
    await publishRunMessage(channel, message);
    expect(sendToQueue).toHaveBeenCalledTimes(2);
    expect(waitForConfirms).toHaveBeenCalledTimes(2);
    expect(channel.listenerCount('return')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('removes only its own return handler, leaving pre-existing listeners intact', async () => {
    const existing = jest.fn<void, []>();
    channel.on('return', existing);
    await publishRunMessage(channel, message);
    expect(channel.listeners('return')).toEqual([existing]);
  });
});
