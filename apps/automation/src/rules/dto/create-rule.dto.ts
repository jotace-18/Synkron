import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  isRuleActions,
  isRuleConditionGroup,
} from '../rule-configuration.validation';
import {
  RULE_EVENT_TYPES,
  type RuleAction,
  type RuleConditionGroup,
  type RuleEventType,
} from '../rule.types';

@ValidatorConstraint({ name: 'ruleConditionGroup', async: false })
class RuleConditionGroupConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRuleConditionGroup(value);
  }

  defaultMessage(): string {
    return 'condition debe indicar all o any y hasta 10 condiciones válidas';
  }
}

@ValidatorConstraint({ name: 'ruleActions', async: false })
class RuleActionsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRuleActions(value);
  }

  defaultMessage(): string {
    return 'actions debe contener entre 1 y 5 acciones válidas';
  }
}

export class RuleTriggerDto {
  @IsIn(RULE_EVENT_TYPES)
  event_type!: RuleEventType;
}

export class CreateRuleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsBoolean()
  enabled: boolean = true;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => RuleTriggerDto)
  trigger!: RuleTriggerDto;

  @IsDefined()
  @Validate(RuleConditionGroupConstraint)
  condition!: RuleConditionGroup;

  @IsDefined()
  @Validate(RuleActionsConstraint)
  actions!: RuleAction[];
}
