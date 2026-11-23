import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { GymService } from './gym.service';
import { ListGymSessionsDto } from './dto/list-gym-sessions.dto';
import type { GymSessionView } from './gym.types';
export function canonicalGymSession(session: GymSessionView) {
  const identity = {
    schema_version: 1,
    external_id: `gym_sessions:${session.id}`,
    source_updated_at: session.updated_at,
  };
  if (session.deleted_at)
    return {
      ...identity,
      action: 'retire',
      source_deleted_at: session.deleted_at,
    };
  return {
    ...identity,
    action: 'upsert',
    activity: {
      type: 'sport.gym',
      title: session.title,
      status: session.status,
      schedule: {
        kind: 'interval',
        role: 'start',
        date: null,
        at: session.started_at,
        end_at: session.end_at,
      },
      details: {
        training_mode: session.training_mode,
        accompanied: session.accompanied,
      },
    },
  };
}
@Controller('api/v1/activities/export')
@UseGuards(BearerGuard)
export class CanonicalActivitiesController {
  constructor(private readonly gym: GymService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListGymSessionsDto,
  ) {
    return (
      await this.gym.list(request.accountId, query.limit, query.offset, true)
    ).map(canonicalGymSession);
  }
}
