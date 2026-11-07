import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { CreateConnectionDto } from './dto/create-connection.dto';
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
  list(@Req() request: AuthenticatedRequest): Promise<ConnectionSummary[]> {
    return this.connections.list(request.tenantId);
  }

  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateConnectionDto,
  ): Promise<ConnectionSummary> {
    return this.connections.createWithoutAuth(request.tenantId, body);
  }
}
