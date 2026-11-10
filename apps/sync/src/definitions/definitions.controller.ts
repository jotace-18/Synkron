import { Body, Controller, Header, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { DefinitionsService } from './definitions.service';
import type { SyncDefinition } from './definition.types';
import { CreateDefinitionDto } from './dto/create-definition.dto';

@Controller('api/v1/sync-definitions')
export class DefinitionsController {
  constructor(private readonly definitions: DefinitionsService) {}

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
