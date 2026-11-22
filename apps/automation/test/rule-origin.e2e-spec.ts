import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { parseSyncEvent } from '../src/events/parse-sync-event';
import type { SyncCompletedEvent } from '../src/events/sync-event.types';
import { RuleProcessorService } from '../src/rules/rule-processor.service';

describe('Rule action origin (PostgreSQL)', () => {
  const database = new DatabaseService();
  const processor = new RuleProcessorService(database);
  const tenantId = randomUUID();

  beforeAll(async () => {
    await database.checkConnection();
  });

  afterAll(async () => {
    try {
      for (const table of [
        'rule_actions',
        'rule_evaluations',
        'rule_events',
        'rules',
      ]) {
        await database.query(
          `DELETE FROM automation.${table} WHERE tenant_id = $1`,
          [tenantId],
        );
      }
    } finally {
      await database.onModuleDestroy();
    }
  });

  it('blocks chained syncs, preserves notifications and deduplicates redelivery', async () => {
    const definitionId = randomUUID();
    const runId = randomUUID();
    const derivedRunId = randomUUID();
    const originId = randomUUID();

    await database.query(
      `INSERT INTO automation.rules (
         tenant_id, name, trigger_event_type, condition_group,
         actions, created_at
       )
       VALUES ($1, 'Origin test', 'sync.completed', $2::jsonb,
               $3::jsonb, '2000-01-01T00:00:00Z')`,
      [
        tenantId,
        JSON.stringify({ mode: 'all', conditions: [] }),
        JSON.stringify([
          { type: 'start_sync', definition_id: definitionId },
          { type: 'notify', message: 'Aviso de prueba' },
        ]),
      ],
    );

    const raw: SyncCompletedEvent = {
      event_id: randomUUID(),
      tenant_id: tenantId,
      event_type: 'sync.completed',
      schema_version: 1,
      correlation_id: runId,
      causation_id: runId,
      occurred_at: '2000-01-02T00:00:00.000Z',
      producer: 'sync',
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
    };

    expect(parseSyncEvent({ ...raw, automation_action_id: null })).toBeNull();

    const root = parseSyncEvent(raw);
    const inherited = parseSyncEvent({
      ...raw,
      event_id: randomUUID(),
      correlation_id: derivedRunId,
      causation_id: derivedRunId,
      payload: { ...raw.payload, sync_run_id: derivedRunId },
      automation_action_id: originId.toUpperCase(),
    });

    if (!root || !inherited) {
      throw new Error('Los eventos de prueba deben ser válidos');
    }

    await processor.process(root);
    await expect(processor.process(inherited)).resolves.toMatchObject({
      status: 'processed',
      matched: 1,
      actions: 2,
    });
    await expect(processor.process(inherited)).resolves.toMatchObject({
      status: 'duplicate',
      actions: 0,
    });

    const stored = await database.query<{
      event_id: string;
      automation_action_id: string | null;
      action_type: string;
      status: string;
      error_code: string | null;
    }>(
      `SELECT e.event_id, source_event.automation_action_id,
              a.action_type, a.status, a.error_code
       FROM automation.rule_evaluations e
       JOIN automation.rule_events source_event
         ON source_event.event_id = e.event_id AND source_event.tenant_id = e.tenant_id
       JOIN automation.rule_actions a
         ON a.evaluation_id = e.id AND a.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1
       ORDER BY a.action_index, e.event_id`,
      [tenantId],
    );

    expect(stored.rows).toHaveLength(4);
    expect(
      stored.rows.filter((row) => row.event_id === root.event_id),
    ).toMatchObject([
      {
        action_type: 'start_sync',
        status: 'pending',
        automation_action_id: null,
      },
      { action_type: 'notify', status: 'pending', automation_action_id: null },
    ]);
    expect(
      stored.rows.filter((row) => row.event_id === inherited.event_id),
    ).toMatchObject([
      {
        action_type: 'start_sync',
        status: 'blocked',
        error_code: 'chain_limit',
        automation_action_id: originId,
      },
      {
        action_type: 'notify',
        status: 'pending',
        error_code: null,
        automation_action_id: originId,
      },
    ]);
  });
});
