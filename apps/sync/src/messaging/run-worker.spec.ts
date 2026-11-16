import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
  Options,
  Replies,
} from 'amqplib';
import type { ClaimedSyncRun, SyncRun } from '../runs/run.types';
import type { RunsService } from '../runs/runs.service';
import { connectRabbitmq } from './rabbitmq-connection';
import {
  claimRunDelivery,
  handleRunDelivery,
  InvalidRunDeliveryError,
  openRunWorker,
  registerRunConsumer,
} from './run-worker';
import { SYNC_RUN_QUEUE } from './sync-run-message';

jest.mock('./rabbitmq-connection', () => ({ connectRabbitmq: jest.fn() }));

const message = {
  schema_version: 1,
  run_id: 'abcdef12-3456-4789-8abc-123456789abc',
  tenant_id: 'fedcba98-7654-4321-9abc-abcdef123456',
};

function runningRun(): ClaimedSyncRun {
  return {
    id: message.run_id,
    tenant_id: message.tenant_id,
    definition_id: '11111111-1111-4111-8111-111111111111',
    source_connection_id: '22222222-2222-4222-8222-222222222222',
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
}

function delivery(
  properties: Record<string, unknown> = {},
  content = Buffer.from(JSON.stringify(message)),
): ConsumeMessage {
  return {
    content,
    properties: {
      contentType: 'application/json',
      messageId: message.run_id,
      ...properties,
    },
  } as unknown as ConsumeMessage;
}

describe('Worker delivery boundary', () => {
  const claim = jest.fn<Promise<ClaimedSyncRun | null>, [string, string]>();
  const runs = { claimQueued: claim } as unknown as RunsService;

  beforeEach(() => {
    claim.mockReset().mockResolvedValue(null);
  });

  it('validates the received identity and returns the execution claimed for that exact account and run', async () => {
    const claimed = runningRun();
    claim.mockResolvedValueOnce(claimed);
    await expect(
      claimRunDelivery(
        delivery({ messageId: message.run_id.toUpperCase() }),
        runs,
      ),
    ).resolves.toBe(claimed);
    expect(claim.mock.calls).toEqual([[message.tenant_id, message.run_id]]);
  });

  it('rejects malformed content and inconsistent metadata before accessing PostgreSQL', async () => {
    const invalid = [
      delivery({}, Buffer.from('{private-invalid-json')),
      delivery({ contentType: undefined }),
      delivery({ contentType: 'text/plain' }),
      delivery({ messageId: undefined }),
      delivery({ messageId: 42 }),
      delivery({ messageId: '11111111-1111-4111-8111-111111111111' }),
    ];
    for (const input of invalid) {
      await expect(claimRunDelivery(input, runs)).rejects.toBeInstanceOf(
        InvalidRunDeliveryError,
      );
    }
    expect(claim).not.toHaveBeenCalled();
  });

  it('preserves the unavailable claim result instead of treating it as successful processing', async () => {
    await expect(claimRunDelivery(delivery(), runs)).resolves.toBeNull();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('propagates database failures without misclassifying them as invalid messages', async () => {
    const failure = new Error('Database unavailable');
    claim.mockRejectedValueOnce(failure);
    await expect(claimRunDelivery(delivery(), runs)).rejects.toBe(failure);
    expect(failure).not.toBeInstanceOf(InvalidRunDeliveryError);
  });
});

describe('Worker channel preparation', () => {
  const connectMock = jest.mocked(connectRabbitmq);
  const assertQueue = jest.fn<Promise<Replies.AssertQueue>, []>();
  const prefetch = jest.fn<Promise<Replies.Empty>, [number, boolean?]>();
  const close = jest.fn<Promise<void>, []>();
  let channel: Channel;
  let connection: ChannelModel;

  beforeEach(() => {
    channel = Object.assign(new EventEmitter(), {
      assertQueue,
      prefetch,
    }) as unknown as Channel;
    connection = {
      createChannel: () => Promise.resolve(channel),
      close,
    } as unknown as ChannelModel;
    connectMock.mockReset().mockResolvedValue(connection);
    assertQueue.mockReset().mockResolvedValue({
      queue: SYNC_RUN_QUEUE,
      messageCount: 0,
      consumerCount: 0,
    });
    prefetch.mockReset().mockResolvedValue({});
    close.mockReset().mockResolvedValue(undefined);
  });

  it('prepares the shared queue and a per-consumer limit of one unacknowledged message', async () => {
    await expect(openRunWorker()).resolves.toEqual({ connection, channel });
    expect(assertQueue).toHaveBeenCalledWith(SYNC_RUN_QUEUE, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: { 'x-queue-type': 'classic' },
    });
    expect(prefetch.mock.calls).toEqual([[1, false]]);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the connection if the required prefetch cannot be configured', async () => {
    prefetch.mockRejectedValueOnce(new Error('private-channel-error'));
    await expect(openRunWorker()).rejects.toThrow(
      new Error('No se pudo preparar el worker de ejecuciones'),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('Manual-ack consumer registration', () => {
  const consume = jest.fn<
    Promise<Replies.Consume>,
    [string, (value: ConsumeMessage | null) => void, Options.Consume?]
  >();
  const handle = jest.fn<Promise<void>, [ConsumeMessage]>();
  const failed = jest.fn<void, [unknown]>();
  const ack = jest.fn<void, [ConsumeMessage]>();
  const nack = jest.fn<void, [ConsumeMessage]>();
  const channel = { consume, ack, nack } as unknown as Channel;
  let receive: (value: ConsumeMessage | null) => void;

  beforeEach(() => {
    consume.mockReset().mockImplementation((_queue, callback) => {
      receive = callback;
      return Promise.resolve({ consumerTag: 'worker-test-consumer' });
    });
    handle.mockReset().mockResolvedValue(undefined);
    failed.mockReset();
    ack.mockReset();
    nack.mockReset();
  });

  it('registers manual acknowledgement and forwards the original delivery without acknowledging it, even after the handler resolves', async () => {
    await expect(registerRunConsumer(channel, handle, failed)).resolves.toBe(
      'worker-test-consumer',
    );
    expect(consume.mock.calls[0][0]).toBe(SYNC_RUN_QUEUE);
    expect(consume.mock.calls[0][2]).toEqual({ noAck: false });
    const input = delivery();
    receive(input);
    await nextTurn();
    expect(handle.mock.calls).toEqual([[input]]);
    expect(failed).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });

  it('reports synchronous and asynchronous handler failures without acknowledging the failed delivery', async () => {
    await registerRunConsumer(channel, handle, failed);
    const errors = [
      new Error('Synchronous failure'),
      new Error('Asynchronous failure'),
    ];
    handle
      .mockImplementationOnce(() => {
        throw errors[0];
      })
      .mockRejectedValueOnce(errors[1]);
    for (const error of errors) {
      failed.mockClear();
      expect(() => receive(delivery())).not.toThrow();
      await nextTurn();
      expect(failed.mock.calls).toEqual([[error]]);
    }
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });

  it('reports broker cancellation without passing null to the delivery handler', async () => {
    await registerRunConsumer(channel, handle, failed);
    receive(null);
    expect(handle).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(
      new Error('RabbitMQ canceló el consumidor'),
    );
    expect(ack).not.toHaveBeenCalled();
  });

  it('propagates a failed registration instead of returning a usable consumer tag', async () => {
    const error = new Error('Consumer registration failed');
    consume.mockRejectedValueOnce(error);
    await expect(registerRunConsumer(channel, handle, failed)).rejects.toBe(
      error,
    );
    expect(handle).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
});

describe('Acknowledgement after persisted run result', () => {
  const claim = jest.fn<Promise<ClaimedSyncRun | null>, [string, string]>();
  const get = jest.fn<Promise<SyncRun>, [string, string]>();
  const processRun = jest.fn<Promise<void>, [ClaimedSyncRun]>();
  const ack = jest.fn<void, [ConsumeMessage]>();
  const channel = { ack } as unknown as Channel;
  const runs = { claimQueued: claim, get } as unknown as RunsService;

  function arrange() {
    claim.mockReset().mockResolvedValue(runningRun());
    get.mockReset().mockResolvedValue({
      ...runningRun(),
      status: 'completed',
      finished_at: new Date('2026-11-13T10:00:02Z'),
    });
    processRun.mockReset().mockResolvedValue(undefined);
    ack.mockReset();
  }
  beforeEach(arrange);

  it('waits for processing and the persisted terminal result before acknowledging the exact delivery', async () => {
    let started!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const processed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    processRun.mockImplementationOnce(() => {
      started();
      return processed;
    });
    const input = delivery();
    const pending = handleRunDelivery(channel, input, runs, processRun);
    await entered;
    expect(get).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(processRun).toHaveBeenCalledWith(runningRun());
    expect(get.mock.calls).toEqual([[message.tenant_id, message.run_id]]);
    expect(ack.mock.calls).toEqual([[input]]);
  });

  it('does not acknowledge merely because processing returned if no terminal result is stored', async () => {
    for (const status of ['queued', 'running'] as const) {
      get.mockResolvedValueOnce({ ...runningRun(), status });
      await expect(
        handleRunDelivery(channel, delivery(), runs, processRun),
      ).rejects.toThrow('La ejecución todavía no tiene un resultado guardado');
    }
    expect(ack).not.toHaveBeenCalled();
  });

  it('acknowledges duplicates of completed or failed runs without executing them again', async () => {
    claim.mockResolvedValue(null);
    for (const status of ['completed', 'failed'] as const) {
      ack.mockClear();
      get.mockResolvedValueOnce({
        ...runningRun(),
        status,
        finished_at: new Date('2026-11-13T10:00:02Z'),
        error_code: status === 'failed' ? 'unknown_error' : null,
        error_message: status === 'failed' ? 'Error seguro' : null,
      });
      const input = delivery();
      await handleRunDelivery(channel, input, runs, processRun);
      expect(ack.mock.calls).toEqual([[input]]);
    }
    expect(processRun).not.toHaveBeenCalled();
    expect(get.mock.calls).toEqual([
      [message.tenant_id, message.run_id],
      [message.tenant_id, message.run_id],
    ]);
  });

  it('preserves an unavailable running delivery instead of treating it as a completed duplicate', async () => {
    claim.mockResolvedValueOnce(null);
    get.mockResolvedValueOnce(runningRun());
    await expect(
      handleRunDelivery(channel, delivery(), runs, processRun),
    ).rejects.toThrow('La ejecución todavía no tiene un resultado guardado');
    expect(processRun).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('never acknowledges failures in claiming, processing or reading the stored result', async () => {
    const failure = new Error('Operation unavailable');
    for (const failingStage of [claim, processRun, get]) {
      arrange();
      failingStage.mockRejectedValueOnce(failure);
      await expect(
        handleRunDelivery(channel, delivery(), runs, processRun),
      ).rejects.toBe(failure);
      expect(ack).not.toHaveBeenCalled();
    }
  });
});
