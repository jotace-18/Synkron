import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { toEventView, type StoredEvent } from './event.types';
import { canonicalEvent } from './canonical-activities.controller';
const row: StoredEvent = {
  id: 'stable-id',
  title: 'Ir a comprar',
  on_date: '2026-11-25',
  started_at: null,
  duration_minutes: null,
  people: [],
  status: 'pending',
  created_at: new Date('2026-11-23T10:00:00Z'),
  updated_at: new Date('2026-11-23T10:00:00Z'),
  deleted_at: null,
};
describe('Personal event contract', () => {
  it('exports a day without inventing a time, an instant and an interval with the same stable identity', () => {
    const date = canonicalEvent(toEventView(row));
    expect(date).toMatchObject({
      schema_version: 1,
      action: 'upsert',
      external_id: 'events:stable-id',
      activity: {
        type: 'personal.event',
        schedule: {
          kind: 'date',
          role: 'start',
          date: '2026-11-25',
          at: null,
          end_at: null,
        },
        details: { people: [] },
      },
    });
    const instant = {
      ...row,
      on_date: null,
      started_at: new Date('2026-11-25T09:00:00Z'),
    };
    expect(canonicalEvent(toEventView(instant))).toMatchObject({
      external_id: 'events:stable-id',
      activity: {
        schedule: {
          kind: 'instant',
          date: null,
          at: '2026-11-25T09:00:00.000Z',
          end_at: null,
        },
      },
    });
    expect(
      canonicalEvent(
        toEventView({ ...instant, duration_minutes: 30, people: ['Ana'] }),
      ),
    ).toMatchObject({
      activity: {
        schedule: { kind: 'interval', end_at: '2026-11-25T09:30:00.000Z' },
        details: { people: ['Ana'] },
      },
    });
  });
  it('exports retirement without active content and does not leak internal ownership', () => {
    const retired = canonicalEvent(
      toEventView({ ...row, deleted_at: new Date('2026-11-23T11:00:00Z') }),
    );
    expect(retired).toEqual({
      schema_version: 1,
      action: 'retire',
      external_id: 'events:stable-id',
      source_updated_at: row.updated_at.toISOString(),
      source_deleted_at: '2026-11-23T11:00:00.000Z',
    });
    const view = toEventView({ ...row, account_id: 'private' } as StoredEvent);
    expect(view).not.toHaveProperty('account_id');
  });
  it('trims names and titles, initializes nullable options and allows explicit temporal clearing on PATCH', async () => {
    const create = plainToInstance(CreateEventDto, {
      title: '  Cita  ',
      on_date: '2026-11-25',
      people: [' Ana ', 'Luis'],
    });
    expect(
      await validate(create, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(create).toMatchObject({
      title: 'Cita',
      people: ['Ana', 'Luis'],
      status: 'pending',
      started_at: null,
      duration_minutes: null,
    });
    const patch = plainToInstance(UpdateEventDto, {
      on_date: null,
      started_at: '2026-11-25T10:00:00+01:00',
      duration_minutes: null,
      people: [],
    });
    expect(
      await validate(patch, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(patch.status).toBeUndefined();
  });
  it('rejects malformed dates, naive instants, nullable required fields, oversized names and forged provenance', async () => {
    for (const fields of [
      { title: ' ' },
      { on_date: '2026-02-29' },
      { started_at: '2026-11-25T10:00:00' },
      { started_at: '0001-01-01T00:00:00+01:00' },
      { duration_minutes: 1.5 },
      { people: null },
      { people: [' '] },
      { people: ['x'.repeat(101)] },
      { people: Array<string>(51).fill('Ana') },
      { status: null },
      { account_id: 'forged' },
      { end_at: '2026-11-25T12:00:00Z' },
    ]) {
      const create = plainToInstance(CreateEventDto, {
        title: 'Cita',
        on_date: '2026-11-25',
        ...fields,
      });
      expect(
        (
          await validate(create, {
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        ).length,
      ).toBeGreaterThan(0);
    }
    for (const fields of [{ title: null }, { people: null }, { status: null }])
      expect(
        (await validate(plainToInstance(UpdateEventDto, fields))).length,
      ).toBeGreaterThan(0);
  });
});
