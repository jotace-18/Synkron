import { isRecord, isUuid } from '../events/event-validation';
import type { RuleCondition } from './rule.types';

export function isRuleCondition(value: unknown): value is RuleCondition {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    typeof value.field !== 'string' ||
    typeof value.operator !== 'string' ||
    typeof value.value !== 'string' ||
    value.value.trim().length === 0 ||
    value.value.length > 200
  ) {
    return false;
  }

  switch (value.field) {
    case 'payload.change_type':
      return (
        value.operator === '==' &&
        ['created', 'updated', 'retired'].includes(value.value)
      );

    case 'payload.changed_fields':
      return (
        value.operator === 'contains' && /^[a-z][a-z0-9_]*$/.test(value.value)
      );

    case 'payload.source_connection_id':
    case 'payload.definition_id':
      return value.operator === '==' && isUuid(value.value);

    case 'payload.activity_type':
      return (
        value.operator === '==' &&
        /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(value.value)
      );

    case 'payload.error.code':
      return value.operator === '==' && /^[a-z][a-z0-9_]*$/.test(value.value);

    default:
      return false;
  }
}
