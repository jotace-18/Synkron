import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListConnectionsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset: number = 0;
}
