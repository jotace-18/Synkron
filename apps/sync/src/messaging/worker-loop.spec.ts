import { setTimeout as delay } from 'node:timers/promises';
import { runWorkerLoop } from './worker-loop';

jest.mock('node:timers/promises', () => ({ setTimeout: jest.fn() }));

describe('Worker reconnection loop', () => {
  const pause = jest.mocked(delay);
  const runOnce = jest.fn<Promise<void>, []>();
  let log: jest.SpyInstance;

  beforeEach(() => {
    pause.mockReset();
    runOnce.mockReset();
    log = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  it('does not open a session when already stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    await runWorkerLoop(runOnce, stop.signal);
    expect(runOnce).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('does not retry or report an error after an intentional stop', async () => {
    const stop = new AbortController();
    runOnce.mockImplementationOnce(() => {
      stop.abort();
      return Promise.resolve();
    });
    await runWorkerLoop(runOnce, stop.signal);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['error', 'unexpected return'] as const)(
    'waits five seconds before opening a fresh session after %s',
    async (outcome) => {
      const stop = new AbortController();
      let release!: () => void;
      let entered!: () => void;
      const waiting = new Promise<void>((resolve) => {
        entered = resolve;
      });
      pause.mockImplementationOnce(() => {
        entered();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      if (outcome === 'error')
        runOnce.mockRejectedValueOnce(new Error('private connection details'));
      else runOnce.mockResolvedValueOnce(undefined);
      runOnce.mockImplementationOnce(() => {
        stop.abort();
        return Promise.resolve();
      });
      const pending = runWorkerLoop(runOnce, stop.signal);
      await waiting;
      expect(runOnce).toHaveBeenCalledTimes(1);
      expect(pause.mock.calls[0]).toEqual([
        5_000,
        undefined,
        { signal: stop.signal },
      ]);
      expect(log.mock.calls).toEqual([
        ['El worker perdió la conexión o falló; reintentará en 5 segundos'],
      ]);
      release();
      await pending;
      expect(runOnce).toHaveBeenCalledTimes(2);
    },
  );

  it('interrupts a reconnection wait on shutdown without opening another session', async () => {
    const stop = new AbortController();
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    pause.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          stop.signal.addEventListener(
            'abort',
            () => reject(new Error('Wait aborted')),
            { once: true },
          );
          entered();
        }),
    );
    runOnce.mockRejectedValueOnce(new Error('Connection unavailable'));
    const pending = runWorkerLoop(runOnce, stop.signal);
    await waiting;
    stop.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});
