import { UnprocessableEntityException } from '@nestjs/common';
import {
  normalizeIngestionEnvelope,
  parseIngestionRequest,
} from './parse-ingestion-request';
import { ActivityValidationError } from '../imports/activity-import.validation';
import type { ActivityImportContext } from '../imports/activity-import.validation';
const context: ActivityImportContext = {
  tenant_id: 'owner',
  source_connection_id: 'connection',
  source_collection: 'activities',
  allowed_types: ['sport.gym'],
};
export const gymEnvelope = {
  schema_version: 1,
  action: 'upsert',
  external_id: 'gym_sessions:CaseSensitive-ID',
  source_updated_at: '2026-11-23T10:00:00Z',
  activity: {
    type: 'sport.gym',
    title: 'Gimnasio · Push',
    status: 'scheduled',
    schedule: {
      kind: 'interval',
      role: 'start',
      date: null,
      at: '2026-11-24T18:00:00+01:00',
      end_at: '2026-11-24T19:00:00+01:00',
    },
    details: { training_mode: 'push', accompanied: false },
  },
};
describe('Canonical gym contract', () => {
  it('uses the same schema through HTTP and pull, normalizes UTC and retains opaque identity', () => {
    const result = normalizeIngestionEnvelope(gymEnvelope, context);
    expect(parseIngestionRequest(gymEnvelope, context)).toEqual(result);
    expect(result).toMatchObject({
      action: 'upsert',
      activity: {
        external_id: gymEnvelope.external_id,
        source_connection_id: 'connection',
        schedule: {
          at: '2026-11-24T17:00:00.000Z',
          end_at: '2026-11-24T18:00:00.000Z',
        },
      },
    });
  });
  it.each([
    { ...gymEnvelope.activity, status: 'pending' },
    {
      ...gymEnvelope.activity,
      details: { training_mode: 'push', accompanied: 'false' },
    },
    {
      ...gymEnvelope.activity,
      details: {
        training_mode: 'push',
        accompanied: false,
        duration_minutes: 60,
      },
    },
    {
      ...gymEnvelope.activity,
      schedule: {
        ...gymEnvelope.activity.schedule,
        end_at: '2026-11-24T18:00:30+01:00',
      },
    },
    {
      ...gymEnvelope.activity,
      schedule: {
        ...gymEnvelope.activity.schedule,
        end_at: gymEnvelope.activity.schedule.at,
      },
    },
  ])('rejects malformed or contradictory gym records', (activity) => {
    expect(() =>
      normalizeIngestionEnvelope({ ...gymEnvelope, activity }, context),
    ).toThrow(ActivityValidationError);
    expect(() =>
      parseIngestionRequest({ ...gymEnvelope, activity }, context),
    ).toThrow(UnprocessableEntityException);
  });
  it('cannot receive a gym session through an exam-only source', () => {
    expect(() =>
      normalizeIngestionEnvelope(gymEnvelope, {
        ...context,
        allowed_types: ['academic.exam'],
      }),
    ).toThrow(ActivityValidationError);
  });
});
