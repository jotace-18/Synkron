export const RULE_EVENT_TYPES = [
  'data.changed',
  'sync.completed',
  'sync.failed',
] as const;

export type RuleEventType = (typeof RULE_EVENT_TYPES)[number];

export type RuleCondition =
  | {
      field: 'payload.change_type';
      operator: '==';
      value: 'created' | 'updated' | 'retired';
    }
  | {
      field:
        | 'payload.activity_type'
        | 'payload.source_connection_id'
        | 'payload.definition_id'
        | 'payload.error.code';
      operator: '==';
      value: string;
    }
  | {
      field: 'payload.changed_fields';
      operator: 'contains';
      value: string;
    };

export interface RuleConditionGroup {
  mode: 'all' | 'any';
  conditions: RuleCondition[];
}

export type RuleAction =
  | {
      type: 'notify';
      message: string;
    }
  | {
      type: 'start_sync';
      definition_id: string;
    };

export interface RuleInput {
  name: string;
  enabled: boolean;
  trigger: {
    event_type: RuleEventType;
  };
  condition: RuleConditionGroup;
  actions: RuleAction[];
}

export interface StoredRule {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  trigger_event_type: RuleEventType;
  condition_group: RuleConditionGroup;
  actions: RuleAction[];
  revision: number;
  created_at: Date;
  updated_at: Date;
}

export interface RuleView extends RuleInput {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
