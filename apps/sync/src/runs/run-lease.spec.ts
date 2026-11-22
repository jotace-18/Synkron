import type { ClaimedSyncRun } from './run.types';
import type { RunsService } from './runs.service';
import { maintainRunLease, RunLeaseLostError } from './run-lease';

// Jest fake timers do not replace the native timers/promises scheduler.
// Use the fake clock while preserving cancellable-wait behavior.
jest.mock('node:timers/promises', () => ({
  setTimeout: (
    milliseconds: number,
    _value: undefined,
    options: { signal: AbortSignal },
  ) =>
    new Promise<void>((resolve, reject) => {
      const { signal } = options;
      const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new Error('Wait aborted'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, milliseconds);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    }),
}));

const run: ClaimedSyncRun = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  definition_id: '33333333-3333-4333-8333-333333333333',
  source_connection_id: '44444444-4444-4444-8444-444444444444',
  connector: 'academic.assignments',
  source_collection: 'assignments',
  claim_token: '55555555-5555-4555-8555-555555555555',
  lease_expires_at: new Date('2026-11-13T10:01:01Z'),
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

describe('maintainRunLease', () => {
  const renewLease = jest.fn<
    ReturnType<RunsService['renewLease']>,
    Parameters<RunsService['renewLease']>
  >();
  const runs = { renewLease } as unknown as RunsService;

  beforeEach(() => {
    jest.useFakeTimers();
    renewLease.mockReset().mockResolvedValue(true);
  });

  afterEach(() => jest.useRealTimers());

  it('renews with the captured identity every twenty seconds and cancels the pending wait on stop', async () => {
    const stop = new AbortController();
    const work = maintainRunLease(run, runs, stop.signal);
    await jest.advanceTimersByTimeAsync(19_999);
    expect(renewLease).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(renewLease.mock.calls).toEqual([
      [run.tenant_id, run.id, run.claim_token],
    ]);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(renewLease).toHaveBeenCalledTimes(2);
    stop.abort();
    await expect(work).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(renewLease).toHaveBeenCalledTimes(2);
  });

  it('does not start a renewal when already stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    await maintainRunLease(run, runs, stop.signal);
    expect(renewLease).not.toHaveBeenCalled();
  });

  it('waits for an ongoing renewal instead of overlapping calls and drains it on stop', async () => {
    let finish!: (renewed: boolean) => void;
    renewLease.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const stop = new AbortController();
    const work = maintainRunLease(run, runs, stop.signal);
    await jest.advanceTimersByTimeAsync(100_000);
    expect(renewLease).toHaveBeenCalledTimes(1);
    stop.abort();
    finish(true);
    await expect(work).resolves.toBeUndefined();
    expect(renewLease).toHaveBeenCalledTimes(1);
  });

  it('reports lease loss and preserves storage errors instead of silently continuing', async () => {
    const storageError = new Error('Database unavailable');
    for (const failure of [false, storageError]) {
      if (failure === false) renewLease.mockResolvedValueOnce(false);
      else renewLease.mockRejectedValueOnce(failure);
      const stop = new AbortController();
      // Observe rejection immediately, before advancing the timer.
      const outcome = maintainRunLease(run, runs, stop.signal).catch(
        (error: unknown) => error,
      );
      await jest.advanceTimersByTimeAsync(20_000);
      const error = await outcome;
      if (failure === false) expect(error).toBeInstanceOf(RunLeaseLostError);
      else expect(error).toBe(storageError);
      stop.abort();
    }
  });
});
