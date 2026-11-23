import type { CanonicalImportService } from '../src/imports/canonical-import.service';
import type { StoredIngestionImporter } from '../src/ingestions/stored-ingestion.importer';
import { ConnectorImportTransport } from '../src/imports/connector-import.transport';
import { ActivityImportPipeline } from '../src/imports/activity-import.pipeline';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { DefinitionsService } from '../src/definitions/definitions.service';
import { RunsService } from '../src/runs/runs.service';
import { RunProcessorService } from '../src/runs/run-processor.service';
import { ActivitiesService } from '../src/activities/activities.service';
import { AcademicExamsImportService } from '../src/imports/academic-exams-import.service';
import type { AcademicImportService } from '../src/imports/academic-import.service';
import type { AcademicExamsReaderService } from '../src/connectors/academic/academic-exams-reader.service';
import { ConnectorRegistryService } from '../src/connectors/connector-registry.service';
import type { AcademicExamSource } from '../src/connectors/academic/exam-source.types';

describe('Exam execution integration', () => {
  const owner = randomUUID(),
    connection = randomUUID(),
    externalId = randomUUID();
  let db: DatabaseService;
  afterAll(async () => {
    if (!db) return;
    for (const table of [
      'event_outbox',
      'runs',
      'activities',
      'definitions',
      'connections',
    ])
      await db.query(`DELETE FROM sync.${table} WHERE tenant_id=$1`, [owner]);
    await db.onModuleDestroy();
  });
  it('keeps a stable identity across retries, grades, rescheduling, cancellation and retirement, emitting normal events', async () => {
    db = new DatabaseService();
    const credentials = new CredentialsService();
    await db.query(
      `INSERT INTO sync.connections(id,tenant_id,name,base_url,auth_type,credentials_encrypted) VALUES($1,$2,'Exams test','http://academic:3000/api/v1/exams/export','bearer',$3)`,
      [
        connection,
        owner,
        credentials.encrypt('fictional-test-token', owner, connection),
      ],
    );
    const definition = await new DefinitionsService(db).create(owner, {
      name: 'Exams',
      source_connection_id: connection,
      connector: 'academic.exams',
      enabled: true,
    });
    let source: AcademicExamSource = {
      id: externalId,
      title: 'Parcial CC',
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      section: 'theory',
      topics: null,
      exam_date: '2026-11-25',
      exam_at: null,
      status: 'scheduled',
      weight_percent: null,
      weight_basis: null,
      grade: null,
      created_at: '2026-11-22T10:00:00Z',
      updated_at: '2026-11-22T10:00:00Z',
      deleted_at: null,
    };
    const importer = new AcademicExamsImportService(
      new ConnectorImportTransport(
        db,
        credentials,
        new ActivityImportPipeline(new ActivitiesService(db)),
      ),
      {
        readAll: () => Promise.resolve([source]),
      } as unknown as AcademicExamsReaderService,
    );
    const runs = new RunsService(db),
      registry = new ConnectorRegistryService(
        {} as AcademicImportService,
        importer,
        {} as StoredIngestionImporter,
        {} as CanonicalImportService,
      ),
      processor = new RunProcessorService(runs, registry);
    const execute = async () => {
      const queued = await runs.createQueued(owner, definition.id);
      const claim = await runs.claimQueued(owner, queued.id);
      expect(claim?.connector).toBe('academic.exams');
      await processor.process(claim!);
      return runs.get(owner, queued.id);
    };
    expect((await execute()).created_count).toBe(1);
    const original = await db.query<{ id: string }>(
      'SELECT id FROM sync.activities WHERE tenant_id=$1',
      [owner],
    );
    expect((await execute()).unchanged_count).toBe(1);
    source = {
      ...source,
      grade: 8.5,
      exam_date: null,
      exam_at: '2026-11-26T09:00:00Z',
      updated_at: '2026-11-22T11:00:00Z',
    };
    expect((await execute()).updated_count).toBe(1);
    const changed = await db.query<{ payload: { changed_fields: string[] } }>(
      `SELECT payload FROM sync.event_outbox WHERE tenant_id=$1 AND event_type='data.changed' AND payload->>'change_type'='updated'`,
      [owner],
    );
    expect(changed.rows[0].payload.changed_fields).toEqual(
      expect.arrayContaining(['grade', 'schedule']),
    );
    source = {
      ...source,
      status: 'cancelled',
      updated_at: '2026-11-22T12:00:00Z',
    };
    await execute();
    const visible = await db.query<{
      id: string;
      status: string;
      deleted_at: Date | null;
    }>('SELECT id,status,deleted_at FROM sync.activities WHERE tenant_id=$1', [
      owner,
    ]);
    expect(visible.rows[0]).toEqual({
      id: original.rows[0].id,
      status: 'cancelled',
      deleted_at: null,
    });
    source = {
      ...source,
      deleted_at: '2026-11-22T13:00:00Z',
      updated_at: '2026-11-22T13:00:00Z',
    };
    expect((await execute()).retired_count).toBe(1);
  });
});
