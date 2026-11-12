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
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../session-client/session.guard';
import type { AuthenticatedRequest } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { RunsService } from './runs.service';
import { validateRunRequestKey } from './validate-run-request-key';

const uuid = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

@Controller('api/v1')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('sync-definitions/:id/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) definitionId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    validateRunRequestKey(key);
    // The request currently has no options. Reject fields instead of silently
    // accepting content that is not represented by the request fingerprint.
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    ) {
      throw new UnprocessableEntityException(
        'El cuerpo debe ser un objeto vacío',
      );
    }
    const run = await this.runs.createQueued(
      request.tenantId,
      definitionId,
      key,
    );
    response.location(`/api/v1/sync-runs/${run.id}`);
    return { id: run.id, status: run.status };
  }

  @Get('sync-runs/:id')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedRequest, @Param('id', uuid) id: string) {
    return this.runs.get(request.tenantId, id);
  }
}
