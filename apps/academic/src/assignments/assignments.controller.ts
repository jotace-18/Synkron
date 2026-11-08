import { Body, Controller, Header, Post, Req, UseGuards } from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { AssignmentsService } from './assignments.service';
import type { Assignment } from './assignment.types';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

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
}
