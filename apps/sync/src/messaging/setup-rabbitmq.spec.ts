import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Channel, ChannelModel, Options, Replies } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { setupRabbitmq } from './setup-rabbitmq';
import { SYNC_RUN_QUEUE } from './sync-run-message';

jest.mock('./rabbitmq-connection', () => ({ connectRabbitmq: jest.fn() }));

describe('RabbitMQ queue setup', () => {
  const connectMock = jest.mocked(connectRabbitmq);
  const assertQueue = jest.fn<
    Promise<Replies.AssertQueue>,
    [string, Options.AssertQueue?]
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
    }) as unknown as Channel;
    const connection = { createChannel, close } as unknown as ChannelModel;
    connectMock.mockReset().mockResolvedValue(connection);
    createChannel.mockReset().mockResolvedValue(channel);
    assertQueue.mockReset().mockResolvedValue(reply);
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

  it('declares the shared queue with durable non-exclusive configuration and closes the connection', async () => {
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
    ]);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([['Cola disponible: synkron.sync.runs.v1']]);
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
    assertQueue.mockImplementationOnce(() => {
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
    expect(log).toHaveBeenCalledTimes(1);
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

  it('closes the connection and reports no success if the queue cannot be declared', async () => {
    const error = new Error('Queue configuration mismatch');
    assertQueue.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

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

  it('does not return a successful command result if connection closure fails', async () => {
    const error = new Error('Connection close failed');
    close.mockRejectedValueOnce(error);
    await expect(setupRabbitmq()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
