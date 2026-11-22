import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ListHistoryDto } from './dto/list-history.dto';

interface HistoryRow {
  id: string;
  kind: 'schedule' | 'rule' | 'reminder';
  name: string;
  action_type: 'notify' | 'start_sync';
  status: 'pending' | 'accepted' | 'failed' | 'blocked' | 'cancelled';
  created_at: Date;
  resolved_at: Date | null;
  next_attempt_at: Date | null;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  result_id: string | null;
  sync_run_id: string | null;
  activity_id: string | null;
}

@Injectable()
export class HistoryService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string, query: ListHistoryDto) {
    const result = await this.database.query<HistoryRow>(
      `WITH history AS (
         SELECT q.id, 'schedule'::text AS kind, s.name,
           'start_sync'::text AS action_type, q.status, q.created_at,
           q.resolved_at, q.next_attempt_at, q.attempt_count,
           q.error_code, q.error_message, q.sync_run_id AS result_id,
           q.sync_run_id, NULL::uuid AS activity_id
         FROM automation.sync_requests q
         JOIN automation.schedules s
           ON s.id = q.schedule_id AND s.tenant_id = q.tenant_id
         WHERE q.tenant_id = $1
         UNION ALL
         SELECT a.id, 'rule'::text, e.rule_snapshot->>'name',
           a.action_type, a.status, a.created_at, a.resolved_at,
           a.next_attempt_at, a.attempt_count, a.error_code,
           a.error_message, a.result_id,
           CASE WHEN a.action_type = 'start_sync' THEN a.result_id
             ELSE (v.payload->>'sync_run_id')::uuid END,
           (v.payload->>'activity_id')::uuid
         FROM automation.rule_actions a
         JOIN automation.rule_evaluations e
           ON e.id = a.evaluation_id AND e.tenant_id = a.tenant_id
         JOIN automation.rule_events v
           ON v.event_id = e.event_id AND v.tenant_id = e.tenant_id
         WHERE a.tenant_id = $1
         UNION ALL
         SELECT r.id, 'reminder'::text, r.message,
           'notify'::text, r.status, r.created_at, r.resolved_at,
           r.next_attempt_at, r.attempt_count, r.error_code,
           r.error_message, r.result_id, NULL::uuid, r.activity_id
         FROM automation.reminder_requests r
         WHERE r.tenant_id = $1
       )
       SELECT * FROM history
       WHERE ($2::text IS NULL OR kind = $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY created_at DESC, kind ASC, id DESC
       LIMIT $4 OFFSET $5`,
      [
        tenantId,
        query.kind ?? null,
        query.status ?? null,
        query.limit,
        query.offset,
      ],
    );
    return result.rows.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
      resolved_at: row.resolved_at?.toISOString() ?? null,
      next_attempt_at: row.next_attempt_at?.toISOString() ?? null,
    }));
  }
}
