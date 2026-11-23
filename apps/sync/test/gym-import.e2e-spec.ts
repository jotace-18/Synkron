import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { SyncSourcesService } from '../src/connections/sync-sources.service';
import { ConnectionTargetPolicyService } from '../src/connections/connection-target-policy.service';
import { ConnectorImportTransport } from '../src/imports/connector-import.transport';
import { ActivityImportPipeline } from '../src/imports/activity-import.pipeline';
import { ActivitiesService } from '../src/activities/activities.service';
import { CanonicalImportService } from '../src/imports/canonical-import.service';
import type { CanonicalReaderService } from '../src/connectors/canonical/canonical-reader.service';
import { RunsService } from '../src/runs/runs.service';
import { RunProcessorService } from '../src/runs/run-processor.service';
import { ConnectorRegistryService } from '../src/connectors/connector-registry.service';
import type { AcademicImportService } from '../src/imports/academic-import.service';
import type { AcademicExamsImportService } from '../src/imports/academic-exams-import.service';
import type { StoredIngestionImporter } from '../src/ingestions/stored-ingestion.importer';

describe('Canonical gym integration (PostgreSQL)', () => {
  const owner = randomUUID(),
    otherOwner = randomUUID();
  let db: DatabaseService;
  const previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
  beforeAll(() => {
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://sport:3000';
    db = new DatabaseService();
  });
  afterAll(async () => {
    if (previousOrigins === undefined)
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    else process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
    for (const table of [
      'event_outbox',
      'runs',
      'activities',
      'definitions',
      'connections',
    ])
      await db.query(`DELETE FROM sync.${table} WHERE tenant_id IN ($1,$2)`, [
        owner,
        otherOwner,
      ]);
    await db.onModuleDestroy();
  });
  it('connects atomically with concurrent retry deduplication and keeps owners and encrypted credentials separate', async () => {
    const credentials = new CredentialsService();
    const sources = new SyncSourcesService(
      db,
      credentials,
      new ConnectionTargetPolicyService(),
    );
    const input = {
      name: 'Gym',
      base_url: 'http://sport:3000/api/v1/activities/export',
      connector: 'standard.activities' as const,
      auth: { type: 'bearer' as const, token: 'fictional-sport-token' },
      enabled: true,
    };
    const [one, retry] = await Promise.all([
      sources.create(owner, input),
      sources.create(owner, input),
    ]);
    expect(retry.definition.id).toBe(one.definition.id);
    expect(retry.connection.id).toBe(one.connection.id);
    const other = await sources.create(otherOwner, input);
    expect(other.connection.id).not.toBe(one.connection.id);
    expect(JSON.stringify(one)).not.toContain('fictional-sport-token');
    const stored = await db.query<{ credentials_encrypted: string }>(
      'SELECT credentials_encrypted FROM sync.connections WHERE tenant_id=$1 AND id=$2',
      [owner, one.connection.id],
    );
    expect(stored.rows[0].credentials_encrypted).not.toBe(input.auth.token);
    expect(
      credentials.decrypt(
        stored.rows[0].credentials_encrypted,
        owner,
        one.connection.id,
      ),
    ).toBe(input.auth.token);
    await expect(
      sources.create(owner, {
        ...input,
        auth: { type: 'bearer', token: 'another-token' },
      }),
    ).rejects.toThrow('otra credencial');

    let source: unknown[] = [
      {
        schema_version: 1,
        action: 'upsert',
        external_id: 'gym_sessions:OpaqueCase',
        source_updated_at: '2026-11-23T10:00:00Z',
        activity: {
          type: 'sport.gym',
          title: 'Gimnasio · Push',
          status: 'scheduled',
          schedule: {
            kind: 'interval',
            role: 'start',
            date: null,
            at: '2026-11-24T18:00:00+01:00',
            end_at: '2026-11-24T19:00:00+01:00',
          },
          details: { training_mode: 'push', accompanied: false },
        },
      },
    ];
    const importer = new CanonicalImportService(
      new ConnectorImportTransport(
        db,
        credentials,
        new ActivityImportPipeline(new ActivitiesService(db)),
      ),
      {
        readAll: () => Promise.resolve(source),
      } as unknown as CanonicalReaderService,
    );
    const runs = new RunsService(db);
    const processor = new RunProcessorService(
      runs,
      new ConnectorRegistryService(
        {} as AcademicImportService,
        {} as AcademicExamsImportService,
        {} as StoredIngestionImporter,
        importer,
      ),
    );
    const execute = async () => {
      const run = await runs.createQueued(owner, one.definition.id);
      const claim = await runs.claimQueued(owner, run.id);
      expect(claim?.connector).toBe('standard.activities');
      await processor.process(claim!);
      const result = await runs.get(owner, run.id);
      expect(result.status).toBe('completed');
      return result;
    };
    expect((await execute()).created_count).toBe(1);
    const original = await db.query<{ id: string }>(
      'SELECT id FROM sync.activities WHERE tenant_id=$1',
      [owner],
    );
    expect((await execute()).unchanged_count).toBe(1);
    const envelope = source[0] as {
      activity: {
        status: string;
        details: { training_mode: string; accompanied: boolean };
        schedule: { end_at: string };
      };
      source_updated_at: string;
    };
    source = [
      {
        ...envelope,
        source_updated_at: '2026-11-23T11:00:00Z',
        activity: {
          ...envelope.activity,
          status: 'completed',
          details: { training_mode: 'push', accompanied: true },
          schedule: {
            ...envelope.activity.schedule,
            end_at: '2026-11-24T19:15:00+01:00',
          },
        },
      },
    ];
    expect((await execute()).updated_count).toBe(1);
    const events = await db.query<{
      payload: { activity_type: string; changed_fields: string[] };
    }>(
      `SELECT payload FROM sync.event_outbox WHERE tenant_id=$1 AND event_type='data.changed' AND payload->>'change_type'='updated'`,
      [owner],
    );
    expect(events.rows[0].payload.activity_type).toBe('sport.gym');
    expect(events.rows[0].payload.changed_fields).toEqual(
      expect.arrayContaining(['status', 'schedule', 'accompanied']),
    );
    const edited = source[0] as typeof envelope;
    source = [
      { ...edited, activity: { ...edited.activity, status: 'cancelled' } },
    ];
    expect((await execute()).updated_count).toBe(1);
    const cancelled = await db.query<{
      id: string;
      status: string;
      deleted_at: Date | null;
    }>('SELECT id,status,deleted_at FROM sync.activities WHERE tenant_id=$1', [
      owner,
    ]);
    expect(cancelled.rows).toEqual([
      { id: original.rows[0].id, status: 'cancelled', deleted_at: null },
    ]);
    source = [];
    await execute();
    expect(
      (
        await db.query(
          'SELECT id FROM sync.activities WHERE tenant_id=$1 AND deleted_at IS NULL',
          [owner],
        )
      ).rowCount,
    ).toBe(1);
    source = [
      {
        schema_version: 1,
        action: 'retire',
        external_id: 'gym_sessions:OpaqueCase',
        source_updated_at: '2026-11-23T12:00:00Z',
        source_deleted_at: '2026-11-23T12:00:00Z',
      },
    ];
    expect((await execute()).retired_count).toBe(1);
    expect((await execute()).unchanged_count).toBe(1);
    await expect(runs.get(otherOwner, (await execute()).id)).rejects.toThrow(
      'Ejecución no encontrada',
    );
    expect(
      (
        await db.query('SELECT id FROM sync.activities WHERE tenant_id=$1', [
          otherOwner,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
