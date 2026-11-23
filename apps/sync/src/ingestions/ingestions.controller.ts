import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IngestionsService } from './ingestions.service';
import { IngestionSourceGuard } from './ingestion-source.guard';
import type { IngestionAuthenticatedRequest } from './ingestion-source.guard';
@Controller('api/v1/ingestions')
@UseGuards(IngestionSourceGuard)
export class IngestionsController {
  constructor(private readonly ingestions: IngestionsService) {}
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  async accept(
    @Req() request: IngestionAuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const accepted = await this.ingestions.accept(
      request.ingestionSource,
      body,
      key,
    );
    response.location(`/api/v1/ingestions/${accepted.id}`);
    return accepted;
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() request: IngestionAuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 422 }))
    id: string,
  ) {
    return this.ingestions.get(request.ingestionSource, id);
  }
}
