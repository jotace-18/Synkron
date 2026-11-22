import type { ActivitiesService } from '../activities/activities.service';
import type {
  ActivityImport,
  ActivityInput,
} from '../activities/activity.types';
import { ActivityImportPipeline } from './activity-import.pipeline';
import { ActivityValidationError } from './activity-import.validation';
import type { ActivityImportContext } from './activity-import.validation';
import type { ImportResult } from './import.types';

describe('Transport-independent activity pipeline', () => {
  const context: ActivityImportContext = {
    tenant_id: '11111111-1111-4111-8111-111111111111',
    source_connection_id: '22222222-2222-4222-8222-222222222222',
    source_collection: 'exams',
    allowed_types: ['academic.exam'],
  };
  const save = jest.fn<
    ReturnType<ActivitiesService['save']>,
    Parameters<ActivitiesService['save']>
  >();
  const retire = jest.fn<
    ReturnType<ActivitiesService['retire']>,
    Parameters<ActivitiesService['retire']>
  >();
  let pipeline: ActivityImportPipeline;

  function exam(): ActivityInput {
    return {
      source_connection_id: context.source_connection_id,
      source_collection: 'exams',
      external_id: 'exam-001',
      type: 'academic.exam',
      title: ' Parcial CC ',
      schedule: {
        kind: 'instant',
        role: 'start',
        date: null,
        at: '2026-11-26T10:00:00+01:00',
        end_at: null,
      },
      status: 'scheduled',
      source_updated_at: null,
      details: {
        course_name: 'Cloud Computing',
        course_abbreviation: 'CC',
        section: 'theory',
        topics: null,
        weight_percent: 0,
        weight_basis: 'course',
        grade: 0,
      },
    };
  }

  beforeEach(() => {
    save.mockReset().mockResolvedValue({ id: 'central', outcome: 'created' });
    retire.mockReset().mockResolvedValue({ id: 'central', outcome: 'retired' });
    pipeline = new ActivityImportPipeline({
      save,
      retire,
    } as unknown as ActivitiesService);
  });

  it('accepts normalized operations without a reader, connection lookup or credential, and snapshots owner and content', async () => {
    const source = { ...context };
    const input = exam();
    const lease = { run_id: 'run', claim_token: 'lease' };
    await pipeline.run(
      source,
      [{ action: 'upsert', activity: input }],
      () => {
        source.tenant_id = 'another-owner';
        input.details.grade = 11;
        input.title = 'Replaced after validation';
      },
      undefined,
      lease,
    );
    const [savedOwner, saved, reservation] = save.mock.calls[0];
    expect(savedOwner).toBe(context.tenant_id);
    expect(saved).toMatchObject({
      external_id: 'exam-001',
      title: 'Parcial CC',
      schedule: { at: '2026-11-26T09:00:00.000Z' },
      details: { grade: 0, weight_percent: 0 },
    });
    expect(reservation).toBe(lease);
  });

  it('rejects invalid later records before the first write, including foreign identity, unknown types and domain mistakes', async () => {
    const base = exam();
    for (const changes of [
      { source_connection_id: 'foreign' },
      { source_collection: 'assignments' },
      { type: 'sport.gym' },
      { status: 'submitted' },
      { schedule: { ...base.schedule, role: 'deadline' } },
      { details: { ...base.details, grade: 11 } },
      { details: { ...base.details, credential: 'must-not-be-persisted' } },
    ]) {
      await expect(
        pipeline.run(context, [
          { action: 'upsert', activity: base },
          { action: 'upsert', activity: { ...base, ...changes } },
        ]),
      ).rejects.toBeInstanceOf(ActivityValidationError);
    }
    expect(save).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('keeps date-only schedules and accounts for explicit retirements and unknown tombstones using the same lease', async () => {
    const input = exam();
    input.schedule = {
      kind: 'date',
      role: 'start',
      date: '2026-11-26',
      at: null,
      end_at: null,
    };
    const removal: ActivityImport = {
      action: 'retire',
      source_connection_id: context.source_connection_id,
      source_collection: 'exams',
      external_id: 'old-exam',
      source_updated_at: null,
      source_deleted_at: '2026-11-26T10:00:00+01:00',
    };
    retire
      .mockResolvedValueOnce({ id: 'old', outcome: 'retired' })
      .mockResolvedValueOnce({ id: null, outcome: 'not_found' });
    const lease = { run_id: 'run', claim_token: 'lease' };
    const result = await pipeline.run(
      context,
      [
        { action: 'upsert', activity: input },
        removal,
        { ...removal, external_id: 'unknown' },
      ],
      undefined,
      undefined,
      lease,
    );
    expect(result).toMatchObject({
      read: 3,
      created: 1,
      retired: 1,
      ignored: 1,
    });
    expect(save.mock.calls[0][1].schedule).toEqual(input.schedule);
    expect(retire.mock.calls[0]).toEqual([
      context.tenant_id,
      { ...removal, source_deleted_at: '2026-11-26T09:00:00.000Z' },
      lease,
    ]);
  });

  it('stops after cancellation and preserves independently reported confirmed counts', async () => {
    const controller = new AbortController();
    const reason = new Error('Lease lost');
    const updates: ImportResult[] = [];
    save.mockImplementationOnce(() => {
      controller.abort(reason);
      return Promise.resolve({ id: 'central', outcome: 'created' });
    });
    await expect(
      pipeline.run(
        context,
        [
          { action: 'upsert', activity: exam() },
          { action: 'upsert', activity: { ...exam(), external_id: 'second' } },
        ],
        (s) => updates.push(s),
        controller.signal,
      ),
    ).rejects.toBe(reason);
    expect(save).toHaveBeenCalledTimes(1);
    expect(updates.map((s) => s.created)).toEqual([0, 1]);
    updates[0].created = 99;
    expect(updates[1].created).toBe(1);
  });
});
