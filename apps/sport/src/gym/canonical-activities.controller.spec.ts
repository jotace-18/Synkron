import {
  canonicalGymSession,
  CanonicalActivitiesController,
} from './canonical-activities.controller';
import { toGymSessionView } from './gym.types';
import type { GymService } from './gym.service';
import type { AuthenticatedRequest } from '../auth/bearer.guard';
const session = toGymSessionView({
  id: 'stable-id',
  started_at: new Date('2026-11-24T17:00:00Z'),
  duration_minutes: 60,
  training_mode: 'push',
  accompanied: false,
  status: 'scheduled',
  created_at: new Date('2026-11-23T10:00:00Z'),
  updated_at: new Date('2026-11-23T10:00:00Z'),
  deleted_at: null,
});
describe('Sport canonical export', () => {
  it('exports a complete interval and an explicit retirement with the same stable identity', () => {
    expect(canonicalGymSession(session)).toMatchObject({
      schema_version: 1,
      action: 'upsert',
      external_id: 'gym_sessions:stable-id',
      activity: {
        type: 'sport.gym',
        schedule: {
          at: '2026-11-24T17:00:00.000Z',
          end_at: '2026-11-24T18:00:00.000Z',
        },
        details: { training_mode: 'push', accompanied: false },
      },
    });
    const retired = canonicalGymSession({
      ...session,
      deleted_at: '2026-11-25T10:00:00.000Z',
    });
    expect(retired).toEqual({
      schema_version: 1,
      action: 'retire',
      external_id: 'gym_sessions:stable-id',
      source_updated_at: session.updated_at,
      source_deleted_at: '2026-11-25T10:00:00.000Z',
    });
    expect(retired).not.toHaveProperty('activity');
  });
  it('uses the authenticated sport account and includes tombstones on every page', async () => {
    const list = jest.fn().mockResolvedValue([session]);
    const controller = new CanonicalActivitiesController({
      list,
    } as unknown as GymService);
    await expect(
      controller.export(
        { accountId: 'verified-account' } as AuthenticatedRequest,
        { limit: 20, offset: 40 },
      ),
    ).resolves.toHaveLength(1);
    expect(list).toHaveBeenCalledWith('verified-account', 20, 40, true);
  });
});
