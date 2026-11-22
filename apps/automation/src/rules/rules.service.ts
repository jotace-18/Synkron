import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SyncClientService } from '../sync-client/sync-client.service';
import type { CreateRuleDto } from './dto/create-rule.dto';
import type { ListRulesDto } from './dto/list-rules.dto';
import type { RuleInput, RuleView, StoredRule } from './rule.types';

@Injectable()
export class RulesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncClientService,
  ) {}

  async create(tenantId: string, input: CreateRuleDto): Promise<RuleView> {
    await this.checkTargets(tenantId, input);

    const result = await this.database.query<StoredRule>(
      `INSERT INTO automation.rules (
         tenant_id,
         name,
         enabled,
         trigger_event_type,
         condition_group,
         actions
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING *`,
      [
        tenantId,
        input.name,
        input.enabled,
        input.trigger.event_type,
        JSON.stringify(input.condition),
        JSON.stringify(input.actions),
      ],
    );

    return this.toView(result.rows[0]);
  }

  async list(tenantId: string, query: ListRulesDto): Promise<RuleView[]> {
    const result = await this.database.query<StoredRule>(
      `SELECT *
       FROM automation.rules
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, query.limit, query.offset],
    );

    return result.rows.map((rule) => this.toView(rule));
  }

  async get(tenantId: string, ruleId: string): Promise<RuleView> {
    const result = await this.database.query<StoredRule>(
      `SELECT *
       FROM automation.rules
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, ruleId],
    );

    const rule = result.rows[0];

    if (!rule) {
      throw new NotFoundException('Regla no encontrada');
    }

    return this.toView(rule);
  }

  async update(
    tenantId: string,
    ruleId: string,
    input: CreateRuleDto,
  ): Promise<RuleView> {
    const previous = await this.get(tenantId, ruleId);
    const previousDefinitions = new Set(
      previous.actions.flatMap((action) =>
        action.type === 'start_sync'
          ? [action.definition_id.toLowerCase()]
          : [],
      ),
    );
    const hasNewTarget = input.actions.some(
      (action) =>
        action.type === 'start_sync' &&
        !previousDefinitions.has(action.definition_id.toLowerCase()),
    );

    if (input.enabled || hasNewTarget) {
      await this.checkTargets(tenantId, input);
    }

    return this.database.transaction(async (client) => {
      const selected = await client.query<StoredRule>(
        `SELECT *
         FROM automation.rules
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, ruleId],
      );

      const current = selected.rows[0];

      if (!current) {
        throw new NotFoundException('Regla no encontrada');
      }

      const updated = await client.query<StoredRule>(
        `UPDATE automation.rules
         SET name = $3::text,
             enabled = $4::boolean,
             trigger_event_type = $5::text,
             condition_group = $6::jsonb,
             actions = $7::jsonb,
             revision = revision + 1,
             updated_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2
           AND ROW(name, enabled, trigger_event_type, condition_group, actions)
               IS DISTINCT FROM ROW(
                 $3::text, $4::boolean, $5::text, $6::jsonb, $7::jsonb
               )
         RETURNING *`,
        [
          ruleId,
          tenantId,
          input.name,
          input.enabled,
          input.trigger.event_type,
          JSON.stringify(input.condition),
          JSON.stringify(input.actions),
        ],
      );

      return this.toView(updated.rows[0] ?? current);
    });
  }

  private async checkTargets(
    tenantId: string,
    input: RuleInput,
  ): Promise<void> {
    const definitions = new Set(
      input.actions.flatMap((action) =>
        action.type === 'start_sync'
          ? [action.definition_id.toLowerCase()]
          : [],
      ),
    );

    await Promise.all(
      [...definitions].map((id) => this.sync.assertDefinition(tenantId, id)),
    );
  }

  private toView(rule: StoredRule): RuleView {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      trigger: {
        event_type: rule.trigger_event_type,
      },
      condition: rule.condition_group,
      actions: rule.actions,
      revision: rule.revision,
      created_at: rule.created_at.toISOString(),
      updated_at: rule.updated_at.toISOString(),
    };
  }
}
