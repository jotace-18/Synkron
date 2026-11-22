import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { nextScheduleRun } from './next-schedule-run';
import type { StoredSchedule } from './schedule.types';

type DueSchedule = StoredSchedule & {
  next_run_at: Date;
};

export interface PrepareDueResult {
  created: number;
  coalesced: number;
}

@Injectable()
export class SchedulerService {
  constructor(private readonly database: DatabaseService) {}

  async prepareDue(now: Date = new Date()): Promise<PrepareDueResult> {
    if (!Number.isFinite(now.getTime())) {
      throw new Error('La fecha del planificador no es válida');
    }

    return this.database.transaction(async (client) => {
      const due = await client.query<DueSchedule>(
        `SELECT *
         FROM automation.schedules
         WHERE enabled
           AND next_run_at <= $1
         ORDER BY next_run_at, id
         LIMIT 20
         FOR UPDATE SKIP LOCKED`,
        [now],
      );

      const result: PrepareDueResult = {
        created: 0,
        coalesced: 0,
      };

      for (const schedule of due.rows) {
        const nextRun = nextScheduleRun(schedule, now, schedule.next_run_at);

        const request = await client.query(
          `INSERT INTO automation.sync_requests (
             tenant_id,
             schedule_id,
             definition_id,
             scheduled_for
           )
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            schedule.tenant_id,
            schedule.id,
            schedule.definition_id,
            schedule.next_run_at,
          ],
        );

        await client.query(
          `UPDATE automation.schedules
           SET next_run_at = $3,
               updated_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
          [schedule.id, schedule.tenant_id, nextRun],
        );

        if (request.rowCount === 1) {
          result.created += 1;
        } else {
          result.coalesced += 1;
        }
      }

      return result;
    });
  }
}
