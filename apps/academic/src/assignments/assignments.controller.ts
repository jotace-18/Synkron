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
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { AssignmentsService } from './assignments.service';
import type { Assignment } from './assignment.types';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { ListAssignmentsDto } from './dto/list-assignments.dto';

@Controller('api/v1/assignments')
@UseGuards(BearerGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateAssignmentDto,
  ): Promise<Assignment> {
    return this.assignments.create(request.accountId, body);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAssignmentsDto,
  ): Promise<Assignment[]> {
    return this.assignments.list(request.accountId, query.limit, query.offset);
  }
}
