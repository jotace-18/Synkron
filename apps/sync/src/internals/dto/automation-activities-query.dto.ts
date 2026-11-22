import { IsUUID } from 'class-validator';
import { ListActivitiesDto } from '../../activities/dto/list-activities.dto';

export class AutomationActivitiesQueryDto extends ListActivitiesDto {
  @IsUUID('4')
  tenant_id!: string;
}
