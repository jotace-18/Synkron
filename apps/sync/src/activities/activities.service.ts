import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { activityContentHash } from './activity-content-hash';
import type {
  ActivityInput,
  ActivityRetirement,
  ActivityRetirementResult,
  ActivitySaveResult,
} from './activity.types';

@Injectable()
export class ActivitiesService {
  constructor(private readonly database: DatabaseService) {}

  async save(
    tenantId: string,
    activity: ActivityInput,
  ): Promise<ActivitySaveResult> {
    const hash = activityContentHash(activity);

    const values = [
      tenantId,
      activity.source_connection_id,
      activity.source_collection,
      activity.external_id,
      activity.type,
      activity.title,
      activity.schedule.kind,
      activity.schedule.role,
      activity.schedule.date,
      activity.schedule.at,
      activity.schedule.end_at,
      activity.status,
      JSON.stringify(activity.details),
      activity.source_updated_at,
      hash,
    ];

    return this.database.transaction<ActivitySaveResult>(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sync.activities (
           tenant_id, source_connection_id, source_collection, external_id,
           type, title, time_kind, time_role, on_date, at, end_at,
           status, details, source_updated_at, content_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9::date, $10::timestamptz, $11::timestamptz,
           $12, $13::jsonb, $14::timestamptz, $15
         )
         ON CONFLICT ON CONSTRAINT activities_source_identity_unique
         DO NOTHING
         RETURNING id`,
        values,
      );

      if (inserted.rows[0]) {
        return { id: inserted.rows[0].id, outcome: 'created' };
      }

      const existing = await client.query<{
        id: string;
        content_hash: string;
        deleted_at: Date | null;
      }>(
        `SELECT id, content_hash, deleted_at
         FROM sync.activities
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4
         FOR UPDATE`,
        values.slice(0, 4),
      );

      const stored = existing.rows[0];
      if (!stored) {
        throw new Error('No se pudo recuperar la actividad existente');
      }

      if (stored.content_hash === hash && stored.deleted_at === null) {
        await client.query(
          `UPDATE sync.activities
           SET source_updated_at = $3::timestamptz,
               last_synced_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
          [stored.id, tenantId, activity.source_updated_at],
        );
        return { id: stored.id, outcome: 'unchanged' };
      }

      await client.query(
        `UPDATE sync.activities
         SET type = $5,
             title = $6,
             time_kind = $7,
             time_role = $8,
             on_date = $9::date,
             at = $10::timestamptz,
             end_at = $11::timestamptz,
             status = $12,
             details = $13::jsonb,
             source_updated_at = $14::timestamptz,
             content_hash = $15,
             deleted_at = NULL,
             updated_at = clock_timestamp(),
             last_synced_at = clock_timestamp()
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4`,
        values,
      );
      return { id: stored.id, outcome: 'updated' };
    });
  }

  async retire(
    tenantId: string,
    retirement: ActivityRetirement,
  ): Promise<ActivityRetirementResult> {
    return this.database.transaction<ActivityRetirementResult>(
      async (client) => {
        const existing = await client.query<{
          id: string;
          deleted_at: Date | null;
        }>(
          `SELECT id, deleted_at
         FROM sync.activities
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4
         FOR UPDATE`,
          [
            tenantId,
            retirement.source_connection_id,
            retirement.source_collection,
            retirement.external_id,
          ],
        );

        const stored = existing.rows[0];
        if (!stored) {
          return { id: null, outcome: 'not_found' };
        }

        if (stored.deleted_at !== null) {
          await client.query(
            `UPDATE sync.activities
           SET source_updated_at = $3::timestamptz,
               last_synced_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
            [stored.id, tenantId, retirement.source_updated_at],
          );
          return { id: stored.id, outcome: 'unchanged' };
        }

        await client.query(
          `UPDATE sync.activities
         SET deleted_at = $3::timestamptz,
             source_updated_at = $4::timestamptz,
             updated_at = clock_timestamp(),
             last_synced_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
          [
            stored.id,
            tenantId,
            retirement.source_deleted_at,
            retirement.source_updated_at,
          ],
        );
        return { id: stored.id, outcome: 'retired' };
      },
    );
  }
}
