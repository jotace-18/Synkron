import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { EventsService } from './events.service';

const uuid = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 422 });

@Controller('api/v1/events')
@UseGuards(BearerGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateEventDto) {
    return this.events.create(request.accountId, body);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListEventsDto) {
    return this.events.list(request.accountId, query.limit, query.offset);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@Req() request: AuthenticatedRequest, @Query() query: ListEventsDto) {
    return this.events.list(request.accountId, query.limit, query.offset, true);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedRequest, @Param('id', uuid) id: string) {
    return this.events.get(request.accountId, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() body: UpdateEventDto,
  ) {
    return this.events.update(request.accountId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    await this.events.remove(request.accountId, id);
  }
}
