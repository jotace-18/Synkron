import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { SchedulerService } from '../src/schedules/scheduler.service';

describe('Scheduler (PostgreSQL)', () => {
  const database = new DatabaseService();
  const scheduler = new SchedulerService(database);
  const tenantId = randomUUID();
  const scheduleId = randomUUID();

  beforeAll(async () => {
    await database.checkConnection();
  });

  afterAll(async () => {
    try {
      await database.query(
        'DELETE FROM automation.sync_requests WHERE tenant_id = $1',
        [tenantId],
      );
      await database.query(
        'DELETE FROM automation.schedules WHERE tenant_id = $1',
        [tenantId],
      );
    } finally {
      await database.onModuleDestroy();
    }
  });

  it('creates one request concurrently and coalesces later missed occasions', async () => {
    await database.query(
      `INSERT INTO automation.schedules (
         id, tenant_id, name, definition_id,
         schedule_kind, interval_minutes, next_run_at
       )
       VALUES ($1, $2, 'Scheduler test', $3, 'interval', 15, $4)`,
      [scheduleId, tenantId, randomUUID(), new Date('2000-01-01T11:00:00Z')],
    );

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        scheduler.prepareDue(new Date('2000-01-01T12:07:00Z')),
      ),
    );

    expect(results.reduce((total, result) => total + result.created, 0)).toBe(
      1,
    );

    await expect(
      scheduler.prepareDue(new Date('2000-01-01T13:07:00Z')),
    ).resolves.toEqual({
      created: 0,
      coalesced: 1,
    });

    const requests = await database.query<{
      status: string;
      scheduled_for: Date;
    }>(
      `SELECT status, scheduled_for
       FROM automation.sync_requests
       WHERE tenant_id = $1`,
      [tenantId],
    );

    expect(requests.rows).toHaveLength(1);
    expect(requests.rows[0].status).toBe('pending');
    expect(requests.rows[0].scheduled_for.toISOString()).toBe(
      '2000-01-01T11:00:00.000Z',
    );

    const schedules = await database.query<{
      next_run_at: Date;
    }>(
      `SELECT next_run_at
       FROM automation.schedules
       WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, tenantId],
    );

    expect(schedules.rows[0].next_run_at.toISOString()).toBe(
      '2000-01-01T13:15:00.000Z',
    );
  });
});
