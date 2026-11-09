import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { ActivitiesService } from './activities.service';
import { activityContentHash } from './activity-content-hash';
import type { ActivityInput, ActivitySaveResult } from './activity.types';

describe('ActivitiesService.save', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const storedId = '33333333-3333-4333-8333-333333333333';
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const client = { query } as unknown as PoolClient;
  const transaction = jest.fn<
    Promise<ActivitySaveResult>,
    [(connection: PoolClient) => Promise<ActivitySaveResult>]
  >();
  let service: ActivitiesService;

  function activity(): ActivityInput {
    return {
      source_connection_id: '22222222-2222-4222-8222-222222222222',
      source_collection: 'assignments',
      external_id: '001',
      type: 'academic.assignment',
      title: "Entrega d'aplicación",
      schedule: {
        kind: 'date',
        role: 'deadline',
        date: '2026-11-24',
        at: null,
        end_at: null,
      },
      status: 'submitted',
      details: { grade: 8.75, mandatory: false },
      source_updated_at: '2026-11-08T22:38:24.294Z',
    };
  }

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    transaction
      .mockReset()
      .mockImplementation((operation) => operation(client));
    service = new ActivitiesService({
      transaction,
    } as unknown as DatabaseService);
  });

  it('returns created with the database ID and passes content as parameters inside a transaction', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: storedId }] });
    const input = activity();

    await expect(service.save(tenantId, input)).resolves.toEqual({
      id: storedId,
      outcome: 'created',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain(input.title);
    expect(values).toEqual([
      tenantId,
      input.source_connection_id,
      'assignments',
      '001',
      'academic.assignment',
      input.title,
      'date',
      'deadline',
      '2026-11-24',
      null,
      null,
      'submitted',
      JSON.stringify(input.details),
      input.source_updated_at,
      activityContentHash(input),
    ]);
  });

  it('returns unchanged with the original ID and refreshes only synchronization metadata', async () => {
    const input = activity();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: storedId, content_hash: activityContentHash(input) }],
    });

    await expect(service.save(tenantId, input)).resolves.toEqual({
      id: storedId,
      outcome: 'unchanged',
    });

    expect(query.mock.calls[1][1]).toEqual([
      tenantId,
      input.source_connection_id,
      'assignments',
      '001',
    ]);
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    const [sql, values] = query.mock.calls[2];
    expect(values).toEqual([storedId, tenantId, input.source_updated_at]);
    expect(sql).not.toMatch(/\bupdated_at\s*=/);
    expect(sql).not.toMatch(/\bcontent_hash\s*=/);
  });

  it('returns updated with the original ID when business content changes', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: storedId, content_hash: 'old-hash' }],
    });

    await expect(service.save(tenantId, activity())).resolves.toEqual({
      id: storedId,
      outcome: 'updated',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][1]).toEqual(query.mock.calls[0][1]);
    expect(query.mock.calls[2][0]).toMatch(/\bupdated_at\s*=/);
  });

  it('fails instead of inventing a successful result if the conflicting row cannot be recovered', async () => {
    await expect(service.save(tenantId, activity())).rejects.toThrow(
      'No se pudo recuperar la actividad existente',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('propagates an insert failure without attempting further writes', async () => {
    const error = new Error('Insert rejected');
    query.mockRejectedValueOnce(error);
    await expect(service.save(tenantId, activity())).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('propagates a row-lock lookup failure', async () => {
    const error = new Error('Lookup failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(error);
    await expect(service.save(tenantId, activity())).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    'does not report success if a write fails (same hash: %s)',
    async (sameHash) => {
      const input = activity();
      const error = new Error('Update rejected');
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: storedId,
              content_hash: sameHash ? activityContentHash(input) : 'old-hash',
            },
          ],
        })
        .mockRejectedValueOnce(error);
      await expect(service.save(tenantId, input)).rejects.toBe(error);
    },
  );

  it('propagates a transaction failure instead of returning an uncommitted result', async () => {
    const error = new Error('Commit failed');
    transaction.mockRejectedValueOnce(error);
    await expect(service.save(tenantId, activity())).rejects.toBe(error);
  });
});
