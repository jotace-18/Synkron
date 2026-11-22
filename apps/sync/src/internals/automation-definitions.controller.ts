import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DefinitionsService } from '../definitions/definitions.service';
import { AutomationServiceGuard } from './automation-service.guard';
import { AutomationAccountDto } from './dto/automation-run-request.dto';

@Controller('internal/automation/sync-definitions')
@UseGuards(AutomationServiceGuard)
export class AutomationDefinitionsController {
  constructor(private readonly definitions: DefinitionsService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    definitionId: string,
    @Query() query: AutomationAccountDto,
  ) {
    const definition = await this.definitions.get(
      query.tenant_id,
      definitionId,
    );

    return {
      id: definition.id,
      name: definition.name,
      enabled: definition.enabled,
    };
  }
}
