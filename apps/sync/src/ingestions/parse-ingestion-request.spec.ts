import { UnprocessableEntityException } from '@nestjs/common';
import { parseIngestionRequest } from './parse-ingestion-request';
import { ingestionExample, buildIngestionOpenApi } from './ingestion-openapi';
import type { ActivityImportContext } from '../imports/activity-import.validation';
const context: ActivityImportContext = {
  tenant_id: 'owner',
  source_connection_id: 'connection',
  source_collection: 'external-exams',
  allowed_types: ['academic.exam'],
};
describe('HTTP ingestion contract', () => {
  it('adds trusted provenance and normalizes input without accepting an owner or connection in the request', () => {
    const result = parseIngestionRequest(ingestionExample, context);
    expect(result).toMatchObject({
      action: 'upsert',
      activity: {
        source_connection_id: 'connection',
        source_collection: 'external-exams',
        external_id: ingestionExample.external_id,
      },
    });
    expect(() =>
      parseIngestionRequest(
        { ...ingestionExample, tenant_id: 'foreign' },
        context,
      ),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      parseIngestionRequest(
        {
          ...ingestionExample,
          activity: {
            ...ingestionExample.activity,
            source_connection_id: 'foreign',
          },
        },
        context,
      ),
    ).toThrow(UnprocessableEntityException);
  });
  it('validates the version, complete snapshots and retirements using the shared domain rules', () => {
    expect(
      parseIngestionRequest(
        {
          schema_version: 1,
          action: 'retire',
          external_id: 'external-exam-001',
          source_updated_at: null,
          source_deleted_at: '2026-12-02T10:00:00+01:00',
        },
        context,
      ),
    ).toMatchObject({
      action: 'retire',
      source_deleted_at: '2026-12-02T09:00:00.000Z',
    });
    for (const invalid of [
      { ...ingestionExample, schema_version: 2 },
      {
        ...ingestionExample,
        activity: { ...ingestionExample.activity, status: 'pending' },
      },
      { ...ingestionExample, external_id: ' trailing ' },
    ])
      expect(() => parseIngestionRequest(invalid, context)).toThrow(
        UnprocessableEntityException,
      );
  });
  it('publishes an OpenAPI document excluding internal endpoints and real credentials', () => {
    const spec = buildIngestionOpenApi();
    expect(spec.openapi).toBe('3.0.4');
    expect(
      Object.keys(spec.paths as object).every(
        (path) => !path.includes('/internal'),
      ),
    ).toBe(true);
    expect(spec.paths).toHaveProperty('/api/v1/ingestions');
    expect(spec.paths).toHaveProperty('/api/v1/ingestion-sources');
  });
});
