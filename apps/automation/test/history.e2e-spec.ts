import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { HistoryService } from '../src/history/history.service';
import { RuleProcessorService } from '../src/rules/rule-processor.service';

describe('Automation history (PostgreSQL)', () => {
  const database = new DatabaseService();
  const history = new HistoryService(database);
  const tenants = [randomUUID(), randomUUID()];

  beforeAll(() => database.checkConnection());
  afterAll(async () => {
    try {
      for (const table of [
        'reminder_requests',
        'reminder_settings',
        'sync_requests',
        'schedules',
        'rule_actions',
        'rule_evaluations',
        'rule_events',
        'rules',
      ]) {
        await database.query(
          `DELETE FROM automation.${table} WHERE tenant_id IN ($1, $2)`,
          tenants,
        );
      }
    } finally {
      await database.onModuleDestroy();
    }
  });

  it('unifies all three sources, filters and paginates without returning another account', async () => {
    const processor = new RuleProcessorService(database);
    const definitionId = randomUUID();
    for (const tenant of tenants) {
      const schedule = await database.query<{ id: string }>(
        `INSERT INTO automation.schedules (tenant_id, name, definition_id, enabled, schedule_kind, interval_minutes)
         VALUES ($1, 'History schedule', $2, false, 'interval', 15) RETURNING id`,
        [tenant, definitionId],
      );
      await database.query(
        `INSERT INTO automation.sync_requests (tenant_id, schedule_id, definition_id, scheduled_for, next_attempt_at)
         VALUES ($1, $2, $3, clock_timestamp(), '2099-01-01')`,
        [tenant, schedule.rows[0].id, definitionId],
      );
      const settings = await database.query<{ id: string }>(
        'INSERT INTO automation.reminder_settings (tenant_id) VALUES ($1) RETURNING id',
        [tenant],
      );
      await database.query(
        `INSERT INTO automation.reminder_requests (tenant_id, settings_id, activity_id, deadline_key, notify_at, message, next_attempt_at)
         VALUES ($1, $2, $3, 'date:2030-01-02', clock_timestamp(), 'History reminder', '2099-01-01')`,
        [tenant, settings.rows[0].id, randomUUID()],
      );
      await database.query(
        `INSERT INTO automation.rules (tenant_id, name, trigger_event_type, condition_group, actions, created_at)
         VALUES ($1, 'History rule', 'sync.completed', $2::jsonb, $3::jsonb, '2000-01-01')`,
        [
          tenant,
          JSON.stringify({ mode: 'all', conditions: [] }),
          JSON.stringify([{ type: 'start_sync', definition_id: definitionId }]),
        ],
      );
      const runId = randomUUID();
      await processor.process({
        event_id: randomUUID(),
        tenant_id: tenant,
        event_type: 'sync.completed',
        schema_version: 1,
        correlation_id: runId,
        causation_id: runId,
        occurred_at: '2000-01-02T00:00:00.000Z',
        producer: 'sync',
        automation_action_id: randomUUID(),
        payload: {
          sync_run_id: runId,
          definition_id: definitionId,
          counts: {
            read: 0,
            created: 0,
            updated: 0,
            unchanged: 0,
            retired: 0,
            ignored: 0,
          },
        },
      });
    }

    const own = await history.list(tenants[0], { limit: 20, offset: 0 });
    const other = await history.list(tenants[1], { limit: 20, offset: 0 });
    expect(own).toHaveLength(3);
    expect(new Set(own.map((entry) => entry.kind))).toEqual(
      new Set(['schedule', 'rule', 'reminder']),
    );
    expect(
      own.every(
        (entry) =>
          entry.status === (entry.kind === 'rule' ? 'blocked' : 'pending') &&
          entry.created_at.endsWith('Z'),
      ),
    ).toBe(true);
    expect(other).toHaveLength(3);
    expect(
      own.some((entry) => other.some((foreign) => foreign.id === entry.id)),
    ).toBe(false);
    const filtered = await history.list(tenants[0], {
      limit: 20,
      offset: 0,
      kind: 'rule',
      status: 'blocked',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].error_code).toBe('chain_limit');
    await expect(
      history.list(tenants[0], { limit: 20, offset: 0, status: 'failed' }),
    ).resolves.toEqual([]);
    const first = await history.list(tenants[0], { limit: 1, offset: 0 });
    const second = await history.list(tenants[0], { limit: 1, offset: 1 });
    expect(first[0].id).not.toBe(second[0].id);
  });
});
