import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { ListSchedulesDto } from './dto/list-schedules.dto';
import { SchedulesService } from './schedules.service';
import type { ScheduleView } from './schedule.types';

const uuid = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

@Controller('api/v1/automation/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateScheduleDto,
  ): Promise<ScheduleView> {
    return this.schedules.create(request.tenantId, body);
  }

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListSchedulesDto,
  ): Promise<ScheduleView[]> {
    return this.schedules.list(request.tenantId, query);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ): Promise<ScheduleView> {
    return this.schedules.get(request.tenantId, id);
  }

  @Put(':id')
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() body: CreateScheduleDto,
  ): Promise<ScheduleView> {
    return this.schedules.update(request.tenantId, id, body);
  }
}
