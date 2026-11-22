import {
  setImmediate as nextTurn,
  setTimeout as delay,
} from 'node:timers/promises';
import { runPublisherLoop } from './publisher-loop';

jest.mock('node:timers/promises', () => {
  const actual = jest.requireActual<typeof import('node:timers/promises')>(
    'node:timers/promises',
  );
  return { ...actual, setTimeout: jest.fn(actual.setTimeout) };
});

const actualDelay = jest.requireActual<typeof import('node:timers/promises')>(
  'node:timers/promises',
).setTimeout;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('Continuous run publisher loop', () => {
  const publish = jest.fn<Promise<boolean>, []>();
  const delayMock = jest.mocked(delay);
  let controller: AbortController;

  beforeEach(() => {
    controller = new AbortController();
    publish.mockReset().mockResolvedValue(false);
    delayMock.mockReset().mockImplementation(actualDelay);
  });

  afterEach(() => {
    controller.abort();
  });

  it('does not pick up work when already stopped', async () => {
    controller.abort();
    await expect(
      runPublisherLoop(publish, controller.signal),
    ).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
    expect(delayMock).not.toHaveBeenCalled();
  });

  it('continues through available work without imposing an idle delay between confirmed publications', async () => {
    publish
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => {
        controller.abort();
        return Promise.resolve(true);
      });
    await runPublisherLoop(publish, controller.signal);
    expect(publish).toHaveBeenCalledTimes(3);
    expect(delayMock).not.toHaveBeenCalled();
  });

  it('waits one second between an empty pass and the next lookup instead of busy polling', async () => {
    const idleStarted = deferred<void>();
    const idleEnded = deferred<void>();
    publish.mockResolvedValueOnce(false).mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(true);
    });
    delayMock.mockImplementationOnce(() => {
      idleStarted.resolve();
      return idleEnded.promise;
    });
    const pending = runPublisherLoop(publish, controller.signal);
    await idleStarted.promise;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(delayMock.mock.calls).toEqual([
      [1000, undefined, { signal: controller.signal }],
    ]);
    idleEnded.resolve();
    await pending;
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('finishes the in-flight publication before stopping and never starts a parallel or subsequent job', async () => {
    const started = deferred<void>();
    const confirmed = deferred<boolean>();
    publish.mockImplementationOnce(() => {
      started.resolve();
      return confirmed.promise;
    });
    let finished = false;
    const pending = runPublisherLoop(publish, controller.signal).then(() => {
      finished = true;
    });
    await started.promise;
    controller.abort();
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    confirmed.resolve(true);
    await pending;
    expect(finished).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(delayMock).not.toHaveBeenCalled();
  });

  it('cancels a real Node idle timer cleanly when the stop signal arrives', async () => {
    const pending = runPublisherLoop(publish, controller.signal);
    await nextTurn();
    expect(delayMock).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does not start an idle timer if stopped during an empty lookup', async () => {
    publish.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(false);
    });
    await runPublisherLoop(publish, controller.signal);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(delayMock).not.toHaveBeenCalled();
  });

  it('propagates a publication failure so the owner can close the failed channel instead of reusing it', async () => {
    const error = new Error('Broker confirmation failed');
    publish.mockRejectedValueOnce(error);
    await expect(runPublisherLoop(publish, controller.signal)).rejects.toBe(
      error,
    );
    expect(publish).toHaveBeenCalledTimes(1);
    expect(delayMock).not.toHaveBeenCalled();
  });

  it('propagates an unexpected idle timer error instead of silently restarting the loop', async () => {
    const error = new Error('Idle timer failed');
    delayMock.mockRejectedValueOnce(error);
    await expect(runPublisherLoop(publish, controller.signal)).rejects.toBe(
      error,
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
