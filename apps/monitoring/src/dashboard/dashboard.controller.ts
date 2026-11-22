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
import { DashboardService } from './dashboard.service';
import { ListMonitoringChangesDto } from './dto/list-monitoring-changes.dto';
import { ListMonitoringRunsDto } from './dto/list-monitoring-runs.dto';
import type {
  MonitoringRunDetailView,
  MonitoringRunView,
  MonitoringSummaryView,
} from './monitoring-view.types';

@Controller('api/v1/monitoring')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  getSummary(
    @Req() request: AuthenticatedRequest,
  ): Promise<MonitoringSummaryView> {
    return this.dashboard.getSummary(request.tenantId);
  }

  @Get('runs')
  @Header('Cache-Control', 'no-store')
  listRuns(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMonitoringRunsDto,
  ): Promise<MonitoringRunView[]> {
    return this.dashboard.listRuns(request.tenantId, query);
  }

  @Get('runs/:id')
  @Header('Cache-Control', 'no-store')
  getRun(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
    @Query() query: ListMonitoringChangesDto,
  ): Promise<MonitoringRunDetailView> {
    return this.dashboard.getRun(request.tenantId, id, query);
  }
}
