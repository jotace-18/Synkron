import {
  Body,
  Controller,
  Get,
  Header,
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
import { DefinitionsService } from './definitions.service';
import type { SyncDefinition } from './definition.types';
import { CreateDefinitionDto } from './dto/create-definition.dto';
import { ListDefinitionsDto } from './dto/list-definitions.dto';

@Controller('api/v1/sync-definitions')
export class DefinitionsController {
  constructor(private readonly definitions: DefinitionsService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListDefinitionsDto,
  ): Promise<SyncDefinition[]> {
    return this.definitions.list(request.tenantId, query);
  }

  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateDefinitionDto,
  ): Promise<SyncDefinition> {
    return this.definitions.create(request.tenantId, body);
  }
}
