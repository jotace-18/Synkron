import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Channel, ChannelModel, Options, Replies } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { setupRabbitmq } from './setup-rabbitmq';
import { SYNC_RUN_QUEUE, SYNC_RUN_REJECTED_QUEUE } from './sync-run-message';
import { SYNC_EVENT_EXCHANGE } from './sync-event-exchange';
import { SYNC_EVENT_INSPECTION_QUEUE } from './sync-event-queue';

jest.mock('./rabbitmq-connection', () => ({ connectRabbitmq: jest.fn() }));

describe('RabbitMQ topology setup', () => {
  const connectMock = jest.mocked(connectRabbitmq);
  const assertQueue = jest.fn<
    Promise<Replies.AssertQueue>,
    [string, Options.AssertQueue?]
  >();
  const assertExchange = jest.fn<
    ReturnType<Channel['assertExchange']>,
    Parameters<Channel['assertExchange']>
  >();
  const bindQueue = jest.fn<
    ReturnType<Channel['bindQueue']>,
    Parameters<Channel['bindQueue']>
  >();
  const createChannel = jest.fn<Promise<Channel>, []>();
  const close = jest.fn<Promise<void>, []>();
  const reply: Replies.AssertQueue = {
    queue: SYNC_RUN_QUEUE,
    messageCount: 0,
    consumerCount: 0,
  };
  let channel: Channel;
  let log: jest.SpyInstance;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    channel = Object.assign(new EventEmitter(), {
      assertQueue,
      assertExchange,
      bindQueue,
    }) as unknown as Channel;
    const connection = { createChannel, close } as unknown as ChannelModel;
    connectMock.mockReset().mockResolvedValue(connection);
    createChannel.mockReset().mockResolvedValue(channel);
    assertQueue.mockReset().mockResolvedValue(reply);
    assertExchange
      .mockReset()
      .mockResolvedValue({ exchange: SYNC_EVENT_EXCHANGE });
    bindQueue.mockReset().mockResolvedValue({});
    close.mockReset().mockResolvedValue(undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    logError.mockRestore();
  });

  it('declares durable queues, a topic exchange and the three event bindings before closing', async () => {
    await expect(setupRabbitmq()).resolves.toBeUndefined();
    expect(assertQueue.mock.calls).toEqual([
      [
        SYNC_RUN_QUEUE,
        {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: { 'x-queue-type': 'classic' },
        },
      ],
      [
        SYNC_RUN_REJECTED_QUEUE,
        {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: { 'x-queue-type': 'classic' },
        },
      ],
      [
        SYNC_EVENT_INSPECTION_QUEUE,
        {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: { 'x-queue-type': 'classic' },
        },
      ],
    ]);
    expect(assertExchange).toHaveBeenCalledWith(SYNC_EVENT_EXCHANGE, 'topic', {
      durable: true,
      autoDelete: false,
    });
    expect(bindQueue.mock.calls).toEqual(
      ['data.changed', 'sync.completed', 'sync.failed'].map((eventType) => [
        SYNC_EVENT_INSPECTION_QUEUE,
        SYNC_EVENT_EXCHANGE,
        eventType,
      ]),
    );
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([
      [`Cola disponible: ${SYNC_RUN_QUEUE}`],
      [`Exchange disponible: ${SYNC_EVENT_EXCHANGE}`],
      [`Cola disponible: ${SYNC_EVENT_INSPECTION_QUEUE}`],
    ]);
  });

  it('waits for the broker confirmation before reporting readiness or closing the connection', async () => {
    let confirm!: (value: Replies.AssertQueue) => void;
    let started!: () => void;
    const confirmation = new Promise<Replies.AssertQueue>((resolve) => {
      confirm = resolve;
    });
    const declarationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    assertQueue.mockResolvedValueOnce(reply).mockImplementationOnce(() => {
      started();
      return confirmation;
    });
    const pending = setupRabbitmq();
    await declarationStarted;
    expect(close).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    confirm(reply);
    await pending;
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('propagates a failed connection without declaring a queue or reporting success', async () => {
    const error = new Error('Connection unavailable');
    connectMock.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(createChannel).not.toHaveBeenCalled();
    expect(assertQueue).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('closes an opened connection when channel creation fails', async () => {
    const error = new Error('Channel unavailable');
    createChannel.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(assertQueue).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['work', 'rejected'] as const)(
    'closes the connection and reports no success if the %s queue cannot be declared',
    async (queue) => {
      const error = new Error('Queue configuration mismatch');
      if (queue === 'rejected') assertQueue.mockResolvedValueOnce(reply);
      assertQueue.mockRejectedValueOnce(error);
      await expect(setupRabbitmq()).rejects.toBe(error);
      expect(close).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('handles the channel error event accompanying a failed declaration without logging its contents', async () => {
    const error = new Error('private-broker-error-content');
    assertQueue.mockImplementationOnce(() => {
      channel.emit('error', error);
      return Promise.reject(error);
    });
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(logError.mock.calls).toEqual([
      ['Error en el canal de preparación de RabbitMQ'],
    ]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('closes the connection and does not report the inspection queue ready if a binding fails', async () => {
    const error = new Error('Binding unavailable');
    bindQueue.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalledWith(
      `Cola disponible: ${SYNC_EVENT_INSPECTION_QUEUE}`,
    );
  });

  it('does not return a successful command result if connection closure fails', async () => {
    const error = new Error('Connection close failed');
    close.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
