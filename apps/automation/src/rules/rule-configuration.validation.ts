import { isUUID } from 'class-validator';
import { isRecord } from '../events/event-validation';
import { isRuleCondition } from './rule-condition.validation';
import type { RuleAction, RuleConditionGroup } from './rule.types';

export function isRuleConditionGroup(
  value: unknown,
): value is RuleConditionGroup {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    (value.mode === 'all' || value.mode === 'any') &&
    Array.isArray(value.conditions) &&
    value.conditions.length <= 10 &&
    value.conditions.every(isRuleCondition)
  );
}

export function isRuleAction(value: unknown): value is RuleAction {
  if (!isRecord(value) || Object.keys(value).length !== 2) {
    return false;
  }

  if (value.type === 'notify') {
    return (
      typeof value.message === 'string' &&
      value.message.trim().length > 0 &&
      value.message.length <= 500
    );
  }

  if (value.type === 'start_sync') {
    return (
      typeof value.definition_id === 'string' &&
      isUUID(value.definition_id, '4')
    );
  }

  return false;
}

export function isRuleActions(value: unknown): value is RuleAction[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    value.every(isRuleAction)
  );
}
