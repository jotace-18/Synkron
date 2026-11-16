import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
  Options,
  Replies,
} from 'amqplib';
import type { ClaimedSyncRun } from '../runs/run.types';
import { RunsService } from '../runs/runs.service';
import { RunProcessorService } from '../runs/run-processor.service';
import { openRunWorker } from './run-worker';
import { runWorkerProcess } from './worker-process';

jest.mock('./run-worker', () => {
  const actual =
    jest.requireActual<typeof import('./run-worker')>('./run-worker');
  return { ...actual, openRunWorker: jest.fn() };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const claimed: ClaimedSyncRun = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  definition_id: '33333333-3333-4333-8333-333333333333',
  source_connection_id: '44444444-4444-4444-8444-444444444444',
  connector: 'academic.assignments',
  source_collection: 'assignments',
  status: 'running',
  created_at: new Date('2026-11-13T10:00:00Z'),
  started_at: new Date('2026-11-13T10:00:01Z'),
  finished_at: null,
  read_count: 0,
  created_count: 0,
  updated_count: 0,
  unchanged_count: 0,
  retired_count: 0,
  ignored_count: 0,
  error_code: null,
  error_message: null,
};

// Real consumer registration, decoding, claim dispatch and ACK decisions. Only
// the application context and remote PostgreSQL/Rabbit operations are simulated.
describe('Worker process lifecycle', () => {
  const consume = jest.fn<
    Promise<Replies.Consume>,
    [string, (input: ConsumeMessage | null) => void, Options.Consume?]
  >();
  const cancel = jest.fn<Promise<Replies.Cancel>, [string]>();
  const ack = jest.fn<void, [ConsumeMessage]>();
  const claim = jest.fn<
    ReturnType<RunsService['claimQueued']>,
    Parameters<RunsService['claimQueued']>
  >();
  const get = jest.fn<
    ReturnType<RunsService['get']>,
    Parameters<RunsService['get']>
  >();
  const processRun = jest.fn<Promise<void>, [ClaimedSyncRun]>();
  const closeConnection = jest.fn<Promise<void>, []>();
  const closeApp = jest.fn<Promise<void>, []>();
  const openMock = jest.mocked(openRunWorker);
  let channel: Channel;
  let controller: AbortController;
  let registered: ReturnType<typeof deferred>;
  let receive: (input: ConsumeMessage | null) => void;
  let factory: jest.SpyInstance;
  let log: jest.SpyInstance;

  function delivery(): ConsumeMessage {
    return {
      content: Buffer.from(
        JSON.stringify({
          schema_version: 1,
          run_id: claimed.id,
          tenant_id: claimed.tenant_id,
        }),
      ),
      properties: { contentType: 'application/json', messageId: claimed.id },
    } as unknown as ConsumeMessage;
  }

  beforeEach(() => {
    controller = new AbortController();
    registered = deferred();
    channel = Object.assign(new EventEmitter(), {
      consume,
      cancel,
      ack,
    }) as unknown as Channel;
    const connection = { close: closeConnection } as unknown as ChannelModel;
    consume.mockReset().mockImplementation((_queue, callback) => {
      receive = callback;
      registered.resolve();
      return Promise.resolve({ consumerTag: 'worker-fixture' });
    });
    cancel.mockReset().mockResolvedValue({ consumerTag: 'worker-fixture' });
    ack.mockReset();
    claim.mockReset().mockResolvedValue(claimed);
    get.mockReset().mockResolvedValue({
      ...claimed,
      status: 'completed',
      finished_at: new Date('2026-11-13T10:00:02Z'),
    });
    processRun.mockReset().mockResolvedValue(undefined);
    closeConnection.mockReset().mockImplementation(() => {
      channel.emit('close');
      return Promise.resolve();
    });
    closeApp.mockReset().mockResolvedValue(undefined);
    openMock.mockReset().mockResolvedValue({ connection, channel });
    const runs = { claimQueued: claim, get };
    const processor = { process: processRun };
    const app = {
      get: (token: unknown) => {
        if (token === RunsService) return runs;
        if (token === RunProcessorService) return processor;
        throw new Error('Unexpected provider');
      },
      close: closeApp,
    } as unknown as INestApplicationContext;
    factory = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue(app);
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.abort();
    factory.mockRestore();
    log.mockRestore();
  });

  it('stops an idle consumer, ignores late deliveries and closes resources without reporting intentional close as failure', async () => {
    const pending = runWorkerProcess(controller.signal);
    await registered.promise;
    await nextTurn();
    controller.abort();
    receive(delivery());
    await expect(pending).resolves.toBeUndefined();
    expect(cancel.mock.calls).toEqual([['worker-fixture']]);
    expect(claim).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('cancels reception but waits for the active processing and terminal ACK before closing connections', async () => {
    const entered = deferred();
    const completed = deferred();
    processRun.mockImplementationOnce(() => {
      entered.resolve();
      return completed.promise;
    });
    const pending = runWorkerProcess(controller.signal);
    await registered.promise;
    const input = delivery();
    receive(input);
    await entered.promise;
    controller.abort();
    await nextTurn();
    expect(cancel).toHaveBeenCalledWith('worker-fixture');
    expect(ack).not.toHaveBeenCalled();
    expect(closeConnection).not.toHaveBeenCalled();
    expect(closeApp).not.toHaveBeenCalled();
    receive(delivery());
    completed.resolve();
    await pending;
    expect(processRun).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls).toEqual([[input]]);
    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('stops and closes resources without ACK when the delivery handler fails', async () => {
    const error = new Error('Result could not be stored');
    processRun.mockRejectedValueOnce(error);
    const pending = runWorkerProcess(controller.signal);
    const rejected = expect(pending).rejects.toBe(error);
    await registered.promise;
    receive(delivery());
    await rejected;
    expect(ack).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('treats broker cancellation as a process failure and cleans up', async () => {
    const pending = runWorkerProcess(controller.signal);
    const rejected = expect(pending).rejects.toThrow(
      'El worker se detuvo inesperadamente',
    );
    await registered.promise;
    receive(null);
    await rejected;
    expect(processRun).not.toHaveBeenCalled();
    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('does not remain apparently running after an unexpected channel closure', async () => {
    const pending = runWorkerProcess(controller.signal);
    const rejected = expect(pending).rejects.toThrow(
      'El worker se detuvo inesperadamente',
    );
    await registered.promise;
    channel.emit('close');
    await rejected;
    expect(ack).not.toHaveBeenCalled();
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('closes the Nest context if preparing the Rabbit worker fails', async () => {
    const error = new Error('Rabbit unavailable');
    openMock.mockRejectedValueOnce(error);
    await expect(runWorkerProcess(controller.signal)).rejects.toBe(error);
    expect(consume).not.toHaveBeenCalled();
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it('still closes the Nest context if Rabbit cleanup fails', async () => {
    const error = new Error('Connection close failed');
    closeConnection.mockRejectedValueOnce(error);
    const pending = runWorkerProcess(controller.signal);
    const rejected = expect(pending).rejects.toBe(error);
    await registered.promise;
    controller.abort();
    await rejected;
    expect(closeApp).toHaveBeenCalledTimes(1);
  });
});
