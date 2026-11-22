import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  Query,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { ExamsService } from './exams.service';
import type { Exam } from './exam.types';
import { CreateExamDto } from './dto/create-exam.dto';
import { ListExamsDto } from './dto/list-exams.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

@Controller('api/v1/exams')
@UseGuards(BearerGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateExamDto,
  ): Promise<Exam> {
    return this.exams.create(request.accountId, body);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListExamsDto,
  ): Promise<Exam[]> {
    return this.exams.list(request.accountId, query.limit, query.offset);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  exportForSync(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListExamsDto,
  ): Promise<Exam[]> {
    return this.exams.exportForSync(
      request.accountId,
      query.limit,
      query.offset,
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  getById(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
  ): Promise<Exam> {
    return this.exams.getById(request.accountId, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
    @Body() body: UpdateExamDto,
  ): Promise<Exam> {
    return this.exams.update(request.accountId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    id: string,
  ): Promise<void> {
    return this.exams.remove(request.accountId, id);
  }
}
