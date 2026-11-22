import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { ListHistoryDto } from './dto/list-history.dto';
import { HistoryService } from './history.service';

@Controller('api/v1/automation/history')
@UseGuards(SessionGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListHistoryDto) {
    return this.history.list(request.tenantId, query);
  }
}
