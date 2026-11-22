import type { SyncEvent } from '../events/sync-event.types';
import type { RuleCondition, RuleInput } from './rule.types';

function readField(
  field: RuleCondition['field'],
  event: SyncEvent,
): string | string[] | undefined {
  switch (field) {
    case 'payload.change_type':
      return event.event_type === 'data.changed'
        ? event.payload.change_type
        : undefined;

    case 'payload.activity_type':
      return event.event_type === 'data.changed'
        ? event.payload.activity_type
        : undefined;

    case 'payload.source_connection_id':
      return event.event_type === 'data.changed'
        ? event.payload.source_connection_id
        : undefined;

    case 'payload.changed_fields':
      return event.event_type === 'data.changed'
        ? event.payload.changed_fields
        : undefined;

    case 'payload.definition_id':
      return event.event_type !== 'data.changed'
        ? event.payload.definition_id
        : undefined;

    case 'payload.error.code':
      return event.event_type === 'sync.failed'
        ? event.payload.error.code
        : undefined;
  }
}

function matchesCondition(condition: RuleCondition, event: SyncEvent): boolean {
  const value = readField(condition.field, event);

  if (value === undefined) {
    return false;
  }

  if (condition.operator === 'contains') {
    return Array.isArray(value) && value.includes(condition.value);
  }

  if (typeof value !== 'string') {
    return false;
  }

  if (
    condition.field === 'payload.source_connection_id' ||
    condition.field === 'payload.definition_id'
  ) {
    return value.toLowerCase() === condition.value.toLowerCase();
  }

  return value === condition.value;
}

export function evaluateRule(rule: RuleInput, event: SyncEvent): boolean {
  if (!rule.enabled || rule.trigger.event_type !== event.event_type) {
    return false;
  }

  const { mode, conditions } = rule.condition;

  if (conditions.length === 0) {
    return true;
  }

  if (mode === 'all') {
    return conditions.every((condition) => matchesCondition(condition, event));
  }

  return conditions.some((condition) => matchesCondition(condition, event));
}
