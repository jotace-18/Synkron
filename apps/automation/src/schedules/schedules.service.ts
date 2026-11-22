import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SyncClientService } from '../sync-client/sync-client.service';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import type { ListSchedulesDto } from './dto/list-schedules.dto';
import { nextScheduleRun } from './next-schedule-run';
import type {
  ScheduleTiming,
  ScheduleView,
  StoredSchedule,
} from './schedule.types';

type TimingInput = Pick<
  CreateScheduleDto,
  'schedule_kind' | 'interval_minutes' | 'daily_time'
>;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncClientService,
  ) {}

  async create(
    tenantId: string,
    input: CreateScheduleDto,
  ): Promise<ScheduleView> {
    const timing = this.toTiming(input);

    await this.sync.assertDefinition(tenantId, input.definition_id);

    const nextRun = input.enabled ? nextScheduleRun(timing, new Date()) : null;

    const result = await this.database.query<StoredSchedule>(
      `INSERT INTO automation.schedules (
         tenant_id,
         name,
         definition_id,
         enabled,
         schedule_kind,
         interval_minutes,
         daily_time,
         timezone,
         next_run_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        input.name,
        input.definition_id,
        input.enabled,
        timing.schedule_kind,
        timing.interval_minutes,
        timing.daily_time,
        timing.timezone,
        nextRun,
      ],
    );

    return this.toView(result.rows[0]);
  }

  async list(
    tenantId: string,
    query: ListSchedulesDto,
  ): Promise<ScheduleView[]> {
    const result = await this.database.query<StoredSchedule>(
      `SELECT *
       FROM automation.schedules
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, query.limit, query.offset],
    );

    return result.rows.map((schedule) => this.toView(schedule));
  }

  async get(tenantId: string, scheduleId: string): Promise<ScheduleView> {
    const result = await this.database.query<StoredSchedule>(
      `SELECT *
       FROM automation.schedules
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, scheduleId],
    );

    const schedule = result.rows[0];

    if (!schedule) {
      throw new NotFoundException('Programación no encontrada');
    }

    return this.toView(schedule);
  }

  async update(
    tenantId: string,
    scheduleId: string,
    input: CreateScheduleDto,
  ): Promise<ScheduleView> {
    const timing = this.toTiming(input);
    const previous = await this.get(tenantId, scheduleId);
    const definitionId = input.definition_id.toLowerCase();

    if (input.enabled || previous.definition_id !== definitionId) {
      await this.sync.assertDefinition(tenantId, definitionId);
    }

    return this.database.transaction(async (client) => {
      const selected = await client.query<StoredSchedule>(
        `SELECT *
         FROM automation.schedules
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, scheduleId],
      );

      const current = selected.rows[0];

      if (!current) {
        throw new NotFoundException('Programación no encontrada');
      }

      const currentTiming = this.toTiming(current);
      const sameTiming =
        currentTiming.schedule_kind === timing.schedule_kind &&
        currentTiming.interval_minutes === timing.interval_minutes &&
        currentTiming.daily_time === timing.daily_time;
      const sameDefinition = current.definition_id === definitionId;

      if (
        sameTiming &&
        sameDefinition &&
        current.name === input.name &&
        current.enabled === input.enabled
      ) {
        return this.toView(current);
      }

      const resetNextRun = !current.enabled || !sameTiming || !sameDefinition;
      const nextRun = input.enabled
        ? resetNextRun
          ? nextScheduleRun(timing, new Date())
          : current.next_run_at
        : null;

      const updated = await client.query<StoredSchedule>(
        `UPDATE automation.schedules
         SET name = $3,
             definition_id = $4,
             enabled = $5,
             schedule_kind = $6,
             interval_minutes = $7,
             daily_time = $8,
             timezone = $9,
             next_run_at = $10,
             updated_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [
          scheduleId,
          tenantId,
          input.name,
          definitionId,
          input.enabled,
          timing.schedule_kind,
          timing.interval_minutes,
          timing.daily_time,
          timing.timezone,
          nextRun,
        ],
      );

      return this.toView(updated.rows[0]);
    });
  }

  private toTiming(input: TimingInput): ScheduleTiming {
    if (
      input.schedule_kind === 'interval' &&
      input.interval_minutes !== null &&
      input.daily_time === null
    ) {
      return {
        schedule_kind: 'interval',
        interval_minutes: input.interval_minutes,
        daily_time: null,
        timezone: 'Europe/Madrid',
      };
    }

    if (
      input.schedule_kind === 'daily' &&
      input.daily_time !== null &&
      input.interval_minutes === null
    ) {
      return {
        schedule_kind: 'daily',
        interval_minutes: null,
        daily_time: input.daily_time.slice(0, 5),
        timezone: 'Europe/Madrid',
      };
    }

    throw new UnprocessableEntityException(
      'Indica un intervalo o una hora diaria, según la modalidad elegida',
    );
  }

  private toView(schedule: StoredSchedule): ScheduleView {
    const timing = this.toTiming(schedule);

    return {
      ...timing,
      id: schedule.id,
      name: schedule.name,
      definition_id: schedule.definition_id,
      enabled: schedule.enabled,
      next_run_at: schedule.next_run_at?.toISOString() ?? null,
      created_at: schedule.created_at.toISOString(),
      updated_at: schedule.updated_at.toISOString(),
    };
  }
}
