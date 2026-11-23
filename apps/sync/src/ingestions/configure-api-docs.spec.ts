import { Script } from 'node:vm';
import { swaggerRequestInterceptor } from './configure-api-docs';

function browserInterceptor(
  fetchCsrf: unknown,
): typeof swaggerRequestInterceptor {
  // Exercise the serialized function that Swagger embeds, without Node closures or real HTTP.
  const interceptor: unknown = new Script(
    `(${swaggerRequestInterceptor.toString()})`,
  ).runInNewContext({
    URL,
    AbortSignal,
    location: { origin: 'https://synkron.test' },
    fetch: fetchCsrf,
  });
  if (typeof interceptor !== 'function')
    throw new Error('Expected a browser interceptor');
  return interceptor as typeof swaggerRequestInterceptor;
}

describe('Swagger browser authentication', () => {
  it('obtains a fresh CSRF token for each source mutation while preserving the request', async () => {
    const fetchCsrf = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ csrf_token: 'first' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ csrf_token: 'second' }),
      });
    const intercept = browserInterceptor(fetchCsrf);
    const request = {
      url: '/api/v1/ingestion-sources/source-id/rotate-token',
      method: 'POST',
      headers: { 'Idempotency-Key': 'stable-key' },
    };
    const first = await intercept(request);
    expect(first.credentials).toBe('same-origin');
    expect(first.headers['X-CSRF-Token']).toBe('first');
    expect(first.headers['Idempotency-Key']).toBe('stable-key');
    const second = await intercept(request);
    expect(second.headers['X-CSRF-Token']).toBe('second');
    expect(fetchCsrf).toHaveBeenCalledTimes(2);
    expect(fetchCsrf).toHaveBeenCalledWith(
      '/api/v1/auth/csrf',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      }),
    );
  });

  it('uses Bearer without cookies for ingestions and the browser session for queries', async () => {
    const fetchCsrf = jest.fn();
    const intercept = browserInterceptor(fetchCsrf);
    const result = await intercept({
      url: 'https://synkron.test/api/v1/ingestions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-only',
        'Idempotency-Key': 'stable-key',
      },
    });
    expect(result.credentials).toBe('omit');
    expect(result.redirect).toBe('error');
    expect(result.headers.Authorization).toBe('Bearer test-only');
    expect(result.headers['Idempotency-Key']).toBe('stable-key');
    expect(
      (
        await intercept({
          url: '/api/v1/ingestion-sources',
          method: 'GET',
          headers: {},
        })
      ).credentials,
    ).toBe('same-origin');
    expect(fetchCsrf).not.toHaveBeenCalled();
  });

  it('blocks external targets and does not continue a mutation if CSRF cannot be obtained', async () => {
    const fetchCsrf = jest
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ csrf_token: null }),
      });
    const intercept = browserInterceptor(fetchCsrf);
    await expect(
      intercept({
        url: 'https://external.invalid/api/v1/ingestions',
        method: 'POST',
        headers: {},
      }),
    ).rejects.toThrow('mismo origen');
    expect(fetchCsrf).not.toHaveBeenCalled();
    await expect(
      intercept({
        url: '/api/v1/ingestion-sources',
        method: 'POST',
        headers: {},
      }),
    ).rejects.toThrow('Inicia sesión');
    await expect(
      intercept({
        url: '/api/v1/ingestion-sources',
        method: 'POST',
        headers: {},
      }),
    ).rejects.toThrow('CSRF válido');
  });

  it('protects writes in every Synkron module and keeps external source authentication separate', async () => {
    const fetchCsrf = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ csrf_token: 'current-csrf' }),
    });
    const intercept = browserInterceptor(fetchCsrf);
    for (const url of [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/connections',
      '/api/v1/sync-definitions/id/runs',
      '/api/v1/automation/schedules/id',
      '/api/v1/notifications/id/read',
    ]) {
      expect(
        (await intercept({ url, method: 'POST', headers: {} })).headers[
          'X-CSRF-Token'
        ],
      ).toBe('current-csrf');
    }
    expect(fetchCsrf).toHaveBeenCalledTimes(7);
    for (const source of ['academic', 'sport', 'personal']) {
      const external = await intercept({
        url: `/${source}/api/v1/${source === 'sport' ? 'gym-sessions' : source === 'personal' ? 'events' : 'exams'}`,
        method: 'POST',
        headers: { Authorization: 'Bearer source-test-only' },
      });
      expect(external.credentials).toBe('omit');
      expect(external.headers.Authorization).toBe('Bearer source-test-only');
      expect(external.headers['X-CSRF-Token']).toBeUndefined();
    }
    expect(fetchCsrf).toHaveBeenCalledTimes(7);
  });
});
