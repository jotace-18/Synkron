import { UnprocessableEntityException } from '@nestjs/common';
import {
  normalizeIngestionEnvelope,
  parseIngestionRequest,
} from './parse-ingestion-request';
import {
  ActivityValidationError,
  type ActivityImportContext,
} from '../imports/activity-import.validation';
import {
  getEnabledActivityTypes,
  getActivitySchema,
} from '../activities/activity-schema';
const context: ActivityImportContext = {
  tenant_id: 'verified-owner',
  source_connection_id: 'verified-connection',
  source_collection: 'activities',
  allowed_types: ['personal.event'],
};
const envelope = {
  schema_version: 1,
  action: 'upsert',
  external_id: 'events:CaseSensitive-ID',
  source_updated_at: null,
  activity: {
    type: 'personal.event',
    title: 'Peluquería',
    status: 'pending',
    schedule: {
      kind: 'date',
      role: 'start',
      date: '2026-11-25',
      at: null,
      end_at: null,
    },
    details: { people: [] as string[] },
  },
};
describe('Personal canonical ingestion', () => {
  it('shares the HTTP and pull contract for a day, instant and whole-minute interval without inventing a time', () => {
    for (const schedule of [
      envelope.activity.schedule,
      {
        kind: 'instant',
        role: 'start',
        date: null,
        at: '2026-11-25T10:00:00+01:00',
        end_at: null,
      },
      {
        kind: 'interval',
        role: 'start',
        date: null,
        at: '2026-11-25T10:00:00+01:00',
        end_at: '2026-11-25T10:30:00+01:00',
      },
    ]) {
      const input = {
        ...envelope,
        activity: {
          ...envelope.activity,
          schedule,
          details: { people: ['Ana'] },
        },
      };
      const result = normalizeIngestionEnvelope(input, context);
      expect(parseIngestionRequest(input, context)).toEqual(result);
      expect(result).toMatchObject({
        action: 'upsert',
        activity: {
          source_connection_id: 'verified-connection',
          source_collection: 'activities',
          external_id: 'events:CaseSensitive-ID',
          type: 'personal.event',
          schedule:
            schedule.kind === 'date'
              ? { date: '2026-11-25', at: null, end_at: null }
              : { at: '2026-11-25T09:00:00.000Z' },
          details: { people: ['Ana'] },
        },
      });
    }
    expect(
      parseIngestionRequest(
        {
          schema_version: 1,
          action: 'retire',
          external_id: envelope.external_id,
          source_updated_at: null,
          source_deleted_at: '2026-11-25T12:00:00Z',
        },
        context,
      ),
    ).toMatchObject({ action: 'retire', external_id: envelope.external_id });
  });
  it('rejects malformed people, unsupported states, contradictory schedules and fractional minute durations', () => {
    for (const changed of [
      { details: { people: null } },
      { details: { people: [' '] } },
      { details: { people: [' Ana'] } },
      { details: { people: ['x'.repeat(101)] } },
      { details: { people: Array<string>(51).fill('Ana') } },
      { details: { people: [], duration_minutes: 30 } },
      { status: 'scheduled' },
      { status: null },
      { schedule: { ...envelope.activity.schedule, role: 'deadline' } },
      {
        schedule: {
          kind: 'interval',
          role: 'start',
          date: null,
          at: '2026-11-25T10:00:00Z',
          end_at: '2026-11-25T10:00:30Z',
        },
      },
    ]) {
      const input = {
        ...envelope,
        activity: { ...envelope.activity, ...changed },
      };
      expect(() => normalizeIngestionEnvelope(input, context)).toThrow(
        ActivityValidationError,
      );
      expect(() => parseIngestionRequest(input, context)).toThrow(
        UnprocessableEntityException,
      );
    }
    expect(() =>
      normalizeIngestionEnvelope({ ...envelope, tenant_id: 'forged' }, context),
    ).toThrow(ActivityValidationError);
  });
  it('enables Personal explicitly, respects a source type restriction and does not enable the historical social alias', () => {
    expect(getEnabledActivityTypes()).toContain('personal.event');
    expect(getActivitySchema('social.plan')).toBeNull();
    expect(() =>
      normalizeIngestionEnvelope(envelope, {
        ...context,
        allowed_types: ['sport.gym'],
      }),
    ).toThrow(ActivityValidationError);
    expect(() =>
      normalizeIngestionEnvelope(
        {
          ...envelope,
          activity: { ...envelope.activity, type: 'social.plan' },
        },
        { ...context, allowed_types: ['social.plan'] },
      ),
    ).toThrow(ActivityValidationError);
    expect(
      parseIngestionRequest(
        {
          ...envelope,
          activity: {
            ...envelope.activity,
            details: { people: Array<string>(50).fill('👩'.repeat(100)) },
          },
        },
        context,
      ).action,
    ).toBe('upsert');
  });
});
