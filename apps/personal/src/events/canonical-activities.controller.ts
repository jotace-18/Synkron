import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { BearerGuard, type AuthenticatedRequest } from '../auth/bearer.guard';
import { EventsService } from './events.service';
import { ListEventsDto } from './dto/list-events.dto';
import type { EventView } from './event.types';
export function canonicalEvent(event: EventView) {
  const identity = {
    schema_version: 1,
    external_id: `events:${event.id}`,
    source_updated_at: event.updated_at,
  };
  if (event.deleted_at)
    return {
      ...identity,
      action: 'retire',
      source_deleted_at: event.deleted_at,
    };
  const schedule =
    event.on_date !== null
      ? {
          kind: 'date',
          role: 'start',
          date: event.on_date,
          at: null,
          end_at: null,
        }
      : {
          kind: event.end_at === null ? 'instant' : 'interval',
          role: 'start',
          date: null,
          at: event.started_at,
          end_at: event.end_at,
        };
  return {
    ...identity,
    action: 'upsert',
    activity: {
      type: 'personal.event',
      title: event.title,
      status: event.status,
      schedule,
      details: { people: event.people },
    },
  };
}
@Controller('api/v1/activities/export')
@UseGuards(BearerGuard)
export class CanonicalActivitiesController {
  constructor(private readonly events: EventsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListEventsDto,
  ) {
    return (
      await this.events.list(request.accountId, query.limit, query.offset, true)
    ).map(canonicalEvent);
  }
}
