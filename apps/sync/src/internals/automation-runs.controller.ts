import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RunsService } from '../runs/runs.service';
import { validateRunRequestKey } from '../runs/validate-run-request-key';
import { AutomationServiceGuard } from './automation-service.guard';
import { AutomationRunRequestDto } from './dto/automation-run-request.dto';

@Controller('internal/automation')
@UseGuards(AutomationServiceGuard)
export class AutomationRunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('sync-definitions/:id/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  async create(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    definitionId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: AutomationRunRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    validateRunRequestKey(key);

    const run = await this.runs.createQueued(body.tenant_id, definitionId, key);

    response.location(`/api/v1/sync-runs/${run.id}`);

    return {
      id: run.id,
      status: run.status,
    };
  }
}
