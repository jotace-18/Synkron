import type { AcademicImportService } from '../imports/academic-import.service';
import type { AcademicImportResult } from '../imports/academic-import.types';
import type { ClaimedSyncRun } from './run.types';
import { RunProcessorService } from './run-processor.service';
import type { RunsService } from './runs.service';

const run: ClaimedSyncRun = {
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
const result: AcademicImportResult = {
  connection_id: run.source_connection_id,
  read: 2,
  created: 1,
  updated: 0,
  unchanged: 1,
  retired: 0,
  ignored: 0,
};

describe('RunProcessorService', () => {
  const importRun = jest.fn<
    ReturnType<AcademicImportService['run']>,
    Parameters<AcademicImportService['run']>
  >();
  const complete = jest.fn<
    ReturnType<RunsService['complete']>,
    Parameters<RunsService['complete']>
  >();
  const fail = jest.fn<
    ReturnType<RunsService['fail']>,
    Parameters<RunsService['fail']>
  >();
  let processor: RunProcessorService;

  beforeEach(() => {
    importRun.mockReset().mockResolvedValue(result);
    complete.mockReset().mockResolvedValue({
      ...run,
      status: 'completed',
      finished_at: new Date('2026-11-13T10:00:02Z'),
    });
    fail.mockReset().mockResolvedValue({
      ...run,
      status: 'failed',
      finished_at: new Date('2026-11-13T10:00:02Z'),
      error_code: 'unknown_error',
      error_message: 'Error seguro',
    });
    processor = new RunProcessorService(
      { complete, fail } as unknown as RunsService,
      { run: importRun } as unknown as AcademicImportService,
    );
  });

  it('imports using the captured owner and connection and completes with the final returned summary', async () => {
    // The final return value must replace an earlier partial progress update.
    importRun.mockImplementationOnce((_owner, _connection, progress) => {
      progress?.({ ...result, unchanged: 0 });
      return Promise.resolve(result);
    });
    await expect(processor.process(run)).resolves.toBeUndefined();
    expect(importRun.mock.calls[0].slice(0, 2)).toEqual([
      run.tenant_id,
      run.source_connection_id,
    ]);
    expect(complete.mock.calls).toEqual([[run.tenant_id, run.id, result]]);
    expect(fail).not.toHaveBeenCalled();
  });

  it('persists the last known partial progress and original error if importing fails', async () => {
    const error = new Error('Second activity could not be saved');
    const partial = { ...result, unchanged: 0 };
    importRun.mockImplementationOnce((_owner, _connection, progress) => {
      if (!progress) throw new Error('Missing progress observer');
      progress(partial);
      return Promise.reject(error);
    });
    await expect(processor.process(run)).resolves.toBeUndefined();
    expect(fail.mock.calls).toEqual([[run.tenant_id, run.id, partial, error]]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('records zero known progress when the importer fails before reporting any progress', async () => {
    const error = new Error('Source unavailable before import');
    importRun.mockRejectedValueOnce(error);
    await expect(processor.process(run)).resolves.toBeUndefined();
    expect(fail.mock.calls).toEqual([
      [
        run.tenant_id,
        run.id,
        {
          read: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          retired: 0,
          ignored: 0,
        },
        error,
      ],
    ]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('propagates completion storage errors instead of turning them into an import failure', async () => {
    const error = new Error('Completion could not be committed');
    complete.mockRejectedValueOnce(error);
    await expect(processor.process(run)).rejects.toBe(error);
    expect(fail).not.toHaveBeenCalled();
  });

  it('propagates errors storing the failed result so the delivery remains unacknowledged', async () => {
    importRun.mockRejectedValueOnce(new Error('Import failed'));
    const error = new Error('Failed result could not be saved');
    fail.mockRejectedValueOnce(error);
    await expect(processor.process(run)).rejects.toBe(error);
    expect(complete).not.toHaveBeenCalled();
  });
});
