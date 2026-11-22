import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ListConnectionsDto } from './dto/list-connections.dto';
import type { ConnectionProbeResult } from './connection-probe.service';
import {
  ConnectionsService,
  type ConnectionSummary,
} from './connections.service';

@Controller('api/v1/connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListConnectionsDto,
  ): Promise<ConnectionSummary[]> {
    return this.connections.list(request.tenantId, query.limit, query.offset);
  }

  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateConnectionDto,
  ): Promise<ConnectionSummary> {
    if (body.auth.type === 'bearer') {
      return this.connections.createWithBearer(request.tenantId, {
        name: body.name,
        base_url: body.base_url,
        token: body.auth.token,
        enabled: body.enabled,
      });
    }

    return this.connections.createWithoutAuth(request.tenantId, body);
  }

  @Post(':id/test')
  @HttpCode(200)
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  testConnection(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
  ): Promise<ConnectionProbeResult> {
    return this.connections.testConnection(request.tenantId, id);
  }
}
