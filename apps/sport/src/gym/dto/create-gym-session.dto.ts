import { IsBoolean, IsIn, IsInt, Max, Min, Validate } from 'class-validator';
import {
  GYM_STATUSES,
  TRAINING_MODES,
  type GymStatus,
  type TrainingMode,
} from '../gym.types';
import { GymInstantValidator } from './gym-instant.validator';

export class CreateGymSessionDto {
  @Validate(GymInstantValidator)
  started_at!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  duration_minutes!: number;

  @IsIn(TRAINING_MODES)
  training_mode!: TrainingMode;

  @IsBoolean()
  accompanied!: boolean;

  @IsIn(GYM_STATUSES)
  status: GymStatus = 'scheduled';
}
