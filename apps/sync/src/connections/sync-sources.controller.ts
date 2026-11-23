import { Body, Controller, Header, Post, Req, UseGuards } from '@nestjs/common';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import type { AuthenticatedRequest } from '../session-client/session.guard';
import { CreateSyncSourceDto } from './dto/create-sync-source.dto';
import {
  SyncSourcesService,
  type SyncSourceResult,
} from './sync-sources.service';

@Controller('api/v1/sync-sources')
export class SyncSourcesController {
  constructor(private readonly sources: SyncSourcesService) {}
  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateSyncSourceDto,
  ): Promise<SyncSourceResult> {
    return this.sources.create(request.tenantId, body);
  }
}
