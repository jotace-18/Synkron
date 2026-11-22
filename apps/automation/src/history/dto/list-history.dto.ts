import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListHistoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset = 0;

  @IsOptional()
  @IsIn(['schedule', 'rule', 'reminder'])
  kind?: 'schedule' | 'rule' | 'reminder';

  @IsOptional()
  @IsIn(['pending', 'accepted', 'failed', 'blocked', 'cancelled'])
  status?: 'pending' | 'accepted' | 'failed' | 'blocked' | 'cancelled';
}
