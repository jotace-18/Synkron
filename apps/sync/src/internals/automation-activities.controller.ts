import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import type { ActivityView } from '../activities/activity-view.types';
import { AutomationServiceGuard } from './automation-service.guard';
import { AutomationActivitiesQueryDto } from './dto/automation-activities-query.dto';
import { AutomationAccountDto } from './dto/automation-run-request.dto';

@Controller('internal/automation/activities')
@UseGuards(AutomationServiceGuard)
export class AutomationActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AutomationActivitiesQueryDto): Promise<ActivityView[]> {
    return this.activities.list(query.tenant_id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
    @Query() query: AutomationAccountDto,
  ): Promise<ActivityView> {
    return this.activities.get(query.tenant_id, id);
  }
}
