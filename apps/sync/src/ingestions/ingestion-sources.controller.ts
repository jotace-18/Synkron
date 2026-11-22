import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../session-client/session.guard';
import type { AuthenticatedRequest } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { ListDefinitionsDto } from '../definitions/dto/list-definitions.dto';
import {
  CreateIngestionSourceDto,
  SetIngestionSourceEnabledDto,
} from './dto/create-ingestion-source.dto';
import { IngestionSourcesService } from './ingestion-sources.service';
const uuid = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 422 });
@Controller('api/v1/ingestion-sources')
export class IngestionSourcesController {
  constructor(private readonly sources: IngestionSourcesService) {}
  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListDefinitionsDto,
  ) {
    return this.sources.list(request.tenantId, query.limit, query.offset);
  }
  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateIngestionSourceDto,
  ) {
    return this.sources.create(request.tenantId, body);
  }
  @Put(':id')
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  setEnabled(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() body: SetIngestionSourceEnabledDto,
  ) {
    return this.sources.setEnabled(request.tenantId, id, body.enabled);
  }
  @Post(':id/revoke')
  @HttpCode(200)
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  revoke(@Req() request: AuthenticatedRequest, @Param('id', uuid) id: string) {
    return this.sources.revoke(request.tenantId, id);
  }
  @Post(':id/rotate-token')
  @HttpCode(200)
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  rotate(@Req() request: AuthenticatedRequest, @Param('id', uuid) id: string) {
    return this.sources.rotate(request.tenantId, id);
  }
}
