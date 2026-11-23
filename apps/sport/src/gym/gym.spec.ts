import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { configureApp } from '../configure-app';
import { CreateGymSessionDto } from './dto/create-gym-session.dto';
import { UpdateGymSessionDto } from './dto/update-gym-session.dto';
import { toGymSessionView } from './gym.types';

function applicationPipe(): ValidationPipe {
  const useGlobalPipes = jest.fn<void, [ValidationPipe]>();
  configureApp({ useGlobalPipes } as unknown as INestApplication);
  return useGlobalPipes.mock.calls[0][0];
}
const valid = {
  started_at: '2026-11-24T18:00:00+01:00',
  duration_minutes: 60,
  training_mode: 'push',
  accompanied: false,
};

describe('Gym contract', () => {
  it('accepts explicit company and computes a UTC interval and title across the clock change', async () => {
    expect(
      await applicationPipe().transform(valid, {
        type: 'body',
        metatype: CreateGymSessionDto,
      }),
    ).toMatchObject({ ...valid, status: 'scheduled' });
    const view = toGymSessionView({
      id: 'test-id',
      started_at: new Date('2026-10-25T02:30:00+02:00'),
      duration_minutes: 90,
      training_mode: 'other',
      accompanied: true,
      status: 'completed',
      created_at: new Date('2026-10-25T00:00:00Z'),
      updated_at: new Date('2026-10-25T00:00:00Z'),
      deleted_at: null,
    });
    expect(view).toMatchObject({
      title: 'Gimnasio · Otros',
      started_at: '2026-10-25T00:30:00.000Z',
      end_at: '2026-10-25T02:00:00.000Z',
      duration_minutes: 90,
      accompanied: true,
    });
  });

  it('rejects impossible or unzoned times, invalid durations, unknown modes and client-selected ownership or derived fields', async () => {
    const invalid = [
      { ...valid, started_at: '2026-02-30T18:00:00Z' },
      { ...valid, started_at: '2026-11-24' },
      { ...valid, started_at: '2026-11-24T18:00:00' },
      { ...valid, duration_minutes: 0 },
      { ...valid, duration_minutes: 1.5 },
      { ...valid, duration_minutes: '60' },
      { ...valid, training_mode: 'legs' },
      { ...valid, accompanied: 'false' },
      { ...valid, accompanied: undefined },
      { ...valid, status: 'done' },
      { ...valid, account_id: 'foreign' },
      { ...valid, title: 'Client title' },
      { ...valid, end_at: '2026-11-24T20:00:00Z' },
    ];
    for (const body of invalid)
      await expect(
        applicationPipe().transform(body, {
          type: 'body',
          metatype: CreateGymSessionDto,
        }),
      ).rejects.toMatchObject({ status: 422 });
  });

  it('keeps omitted update fields absent, accepts false and rejects null for required session data', async () => {
    expect(
      await applicationPipe().transform(
        { accompanied: false },
        { type: 'body', metatype: UpdateGymSessionDto },
      ),
    ).toEqual({ accompanied: false });
    for (const field of [
      'started_at',
      'duration_minutes',
      'training_mode',
      'accompanied',
      'status',
    ]) {
      await expect(
        applicationPipe().transform(
          { [field]: null },
          { type: 'body', metatype: UpdateGymSessionDto },
        ),
      ).rejects.toMatchObject({ status: 422 });
    }
  });
});
