import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { SyncClientService } from '../sync-client/sync-client.service';
import { RuleSyncDispatcherService } from './rule-sync-dispatcher.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actionId = '22222222-2222-4222-8222-222222222222';
const definitionId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';

function requestBody(options?: RequestInit): unknown {
  if (typeof options?.body !== 'string')
    throw new Error('Expected a JSON body');
  return JSON.parse(options.body) as unknown;
}

function fixture(origin: string | null = null) {
  const writes: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: (sql: string, values: unknown[] = []) => {
      if (sql.trimStart().startsWith('SELECT')) {
        return Promise.resolve({
          rows: [
            {
              id: actionId,
              tenant_id: tenantId,
              action: { type: 'start_sync', definition_id: definitionId },
              automation_action_id: origin,
            },
          ],
        });
      }
      writes.push({ sql, values });
      return Promise.resolve({ rows: [], rowCount: 1 });
    },
  };
  const database = {
    transaction: <T>(operation: (value: PoolClient) => Promise<T>) =>
      operation(client as unknown as PoolClient),
  } as unknown as DatabaseService;
  return {
    dispatcher: new RuleSyncDispatcherService(
      database,
      new SyncClientService(),
    ),
    writes,
  };
}

describe('rule sync action delivery', () => {
  const previousUrl = process.env.SYNC_INTERNAL_URL;
  const previousToken = process.env.AUTOMATION_SYNC_SERVICE_TOKEN;

  beforeEach(() => {
    process.env.SYNC_INTERNAL_URL = 'http://sync.test';
    process.env.AUTOMATION_SYNC_SERVICE_TOKEN = 'a'.repeat(64);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousUrl === undefined) delete process.env.SYNC_INTERNAL_URL;
    else process.env.SYNC_INTERNAL_URL = previousUrl;
    if (previousToken === undefined)
      delete process.env.AUTOMATION_SYNC_SERVICE_TOKEN;
    else process.env.AUTOMATION_SYNC_SERVICE_TOKEN = previousToken;
  });

  it('retries a lost response with the same identity and action origin, while scheduled requests remain roots', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Response lost'))
      .mockImplementation(() =>
        Promise.resolve(Response.json({ id: runId }, { status: 202 })),
      );
    const { dispatcher, writes } = fixture();
    await dispatcher.dispatchOne();
    await dispatcher.dispatchOne();

    const first = fetchMock.mock.calls[0][1]!;
    const second = fetchMock.mock.calls[1][1]!;
    expect(first.body).toBe(second.body);
    expect(requestBody(second)).toEqual({
      tenant_id: tenantId,
      automation_action_id: actionId,
    });
    expect(first.headers).toEqual(second.headers);
    expect(second.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': `automation:${actionId}` }),
    );
    expect(writes[0].values[2]).toBe('pending');
    expect(writes[1].values[2]).toBe(runId);

    await new SyncClientService().requestRun(tenantId, definitionId, actionId);
    expect(requestBody(fetchMock.mock.calls[2][1])).toEqual({
      tenant_id: tenantId,
    });
  });

  it('blocks an old pending action triggered by a derived event without contacting Sync', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected request'));
    const { dispatcher, writes } = fixture(actionId);
    await dispatcher.dispatchOne();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes[0].sql).toContain("error_code = 'chain_limit'");
    expect(writes[0].values).toEqual([actionId, tenantId]);
  });

  it('records a permanent rejection without scheduling another attempt', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 404 }));
    const { dispatcher, writes } = fixture();
    await dispatcher.dispatchOne();
    expect(writes[0].values.slice(2)).toEqual([
      'failed',
      null,
      'request_rejected',
      'Sync rechazó la solicitud de sincronización',
    ]);
  });
});
