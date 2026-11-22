import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesDto } from './dto/list-rules.dto';
import { RulesService } from './rules.service';
import type { RuleView } from './rule.types';

const uuid = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

@Controller('api/v1/automation/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Post()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateRuleDto,
  ): Promise<RuleView> {
    return this.rules.create(request.tenantId, body);
  }

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListRulesDto,
  ): Promise<RuleView[]> {
    return this.rules.list(request.tenantId, query);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ): Promise<RuleView> {
    return this.rules.get(request.tenantId, id);
  }

  @Put(':id')
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() body: CreateRuleDto,
  ): Promise<RuleView> {
    return this.rules.update(request.tenantId, id, body);
  }
}
