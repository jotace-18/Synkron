import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncEvent } from '../events/sync-event.types';
import { evaluateRule } from './evaluate-rule';
import type {
  RuleConditionGroup,
  RuleEventType,
  RuleInput,
} from './rule.types';

interface StoredRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger_event_type: RuleEventType;
  condition_group: RuleConditionGroup;
  actions: RuleInput['actions'];
  revision: number;
}

export interface RuleProcessingResult {
  status: 'processed' | 'duplicate';
  evaluated: number;
  matched: number;
  actions: number;
}

@Injectable()
export class RuleProcessorService {
  constructor(private readonly database: DatabaseService) {}

  async process(event: SyncEvent): Promise<RuleProcessingResult> {
    return this.database.transaction(async (client) => {
      const result: RuleProcessingResult = {
        status: 'processed',
        evaluated: 0,
        matched: 0,
        actions: 0,
      };

      const inserted = await client.query(
        `INSERT INTO automation.rule_events (
           event_id, tenant_id, event_type, schema_version,
           correlation_id, causation_id, occurred_at,
           producer, payload, automation_action_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [
          event.event_id,
          event.tenant_id,
          event.event_type,
          event.schema_version,
          event.correlation_id,
          event.causation_id,
          event.occurred_at,
          event.producer,
          JSON.stringify(event.payload),
          event.automation_action_id ?? null,
        ],
      );

      if (inserted.rowCount === 0) {
        return { ...result, status: 'duplicate' };
      }

      const rules = await client.query<StoredRule>(
        `SELECT
           id, name, enabled, trigger_event_type,
           condition_group, actions, revision
         FROM automation.rules
         WHERE tenant_id = $1
           AND trigger_event_type = $2
           AND enabled
           AND created_at <= $3
         ORDER BY id
         FOR SHARE`,
        [event.tenant_id, event.event_type, event.occurred_at],
      );

      for (const stored of rules.rows) {
        const rule: RuleInput = {
          name: stored.name,
          enabled: stored.enabled,
          trigger: { event_type: stored.trigger_event_type },
          condition: stored.condition_group,
          actions: stored.actions,
        };

        const matched = evaluateRule(rule, event);

        const evaluation = await client.query<{ id: string }>(
          `INSERT INTO automation.rule_evaluations (
             tenant_id, rule_id, event_id,
             rule_revision, rule_snapshot, matched
           )
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           RETURNING id`,
          [
            event.tenant_id,
            stored.id,
            event.event_id,
            stored.revision,
            JSON.stringify(rule),
            matched,
          ],
        );

        result.evaluated += 1;

        if (!matched) {
          continue;
        }

        result.matched += 1;

        for (const [index, action] of rule.actions.entries()) {
          const blocked =
            action.type === 'start_sync' &&
            event.automation_action_id !== undefined;

          await client.query(
            `INSERT INTO automation.rule_actions (
               tenant_id, evaluation_id,
               action_index, action_type, action,
               status, next_attempt_at,
               error_code, error_message, resolved_at
             )
             VALUES (
               $1, $2, $3, $4, $5::jsonb, $6::text,
               CASE WHEN $6::text = 'pending' THEN clock_timestamp() ELSE NULL END,
               $7, $8,
               CASE WHEN $6::text = 'blocked' THEN clock_timestamp() ELSE NULL END
             )`,
            [
              event.tenant_id,
              evaluation.rows[0].id,
              index,
              action.type,
              JSON.stringify(action),
              blocked ? 'blocked' : 'pending',
              blocked ? 'chain_limit' : null,
              blocked
                ? 'La sincronización ya fue iniciada por una regla.'
                : null,
            ],
          );

          result.actions += 1;
        }
      }

      return result;
    });
  }
}
