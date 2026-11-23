import {
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import {
  GYM_STATUSES,
  TRAINING_MODES,
  type GymStatus,
  type TrainingMode,
} from '../gym.types';
import { GymInstantValidator } from './gym-instant.validator';

export class UpdateGymSessionDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Validate(GymInstantValidator)
  started_at?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  duration_minutes?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(TRAINING_MODES)
  training_mode?: TrainingMode;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  accompanied?: boolean;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(GYM_STATUSES)
  status?: GymStatus;
}
