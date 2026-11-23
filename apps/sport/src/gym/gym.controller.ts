import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { CreateGymSessionDto } from './dto/create-gym-session.dto';
import { UpdateGymSessionDto } from './dto/update-gym-session.dto';
import { ListGymSessionsDto } from './dto/list-gym-sessions.dto';
import { GymService } from './gym.service';

const uuid = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 422 });

@Controller('api/v1/gym-sessions')
@UseGuards(BearerGuard)
export class GymController {
  constructor(private readonly gym: GymService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateGymSessionDto,
  ) {
    return this.gym.create(request.accountId, body);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListGymSessionsDto,
  ) {
    return this.gym.list(request.accountId, query.limit, query.offset);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListGymSessionsDto,
  ) {
    return this.gym.list(request.accountId, query.limit, query.offset, true);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedRequest, @Param('id', uuid) id: string) {
    return this.gym.get(request.accountId, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() body: UpdateGymSessionDto,
  ) {
    return this.gym.update(request.accountId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    await this.gym.remove(request.accountId, id);
  }
}
