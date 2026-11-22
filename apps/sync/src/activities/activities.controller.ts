import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { ActivitiesService } from './activities.service';
import type { ActivityView } from './activity-view.types';
import { ListActivitiesDto } from './dto/list-activities.dto';

@Controller('api/v1/activities')
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListActivitiesDto,
  ): Promise<ActivityView[]> {
    return this.activities.list(request.tenantId, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
  ): Promise<ActivityView> {
    return this.activities.get(request.tenantId, id);
  }
}
