import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionClientService } from './session-client.service';

describe('SessionClientService', () => {
  const cookie = `__Host-synkron_session=${'a'.repeat(64)}`;
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const serviceToken = 'b'.repeat(64);
  const settings = {
    AUTH_API_INTERNAL_URL: 'http://api:3003',
    SYNC_AUTH_SERVICE_TOKEN: serviceToken,
    SESSION_COOKIE_NAME: '__Host-synkron_session',
  };
  let previousSettings: Map<string, string | undefined>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let service: SessionClientService;

  beforeEach(() => {
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
    fetchMock = jest.spyOn(globalThis, 'fetch');
    // Ninguna prueba debe llegar a la red real.
    fetchMock.mockRejectedValue(new Error('Unexpected fetch'));
    service = new SessionClientService();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    for (const [name, value] of previousSettings) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('checks the session and forwards only its cookie to the fixed internal route', async () => {
    const session = {
      tenant_id: tenantId,
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
    fetchMock.mockResolvedValue(
      Response.json({ ...session, extra: 'ignored' }),
    );

    await expect(
      service.getSession(`__Host-synkron_csrf=private; ${cookie}`),
    ).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toEqual(new URL('http://api:3003/internal/auth/session'));
    expect(options?.headers).toEqual({
      Cookie: cookie,
      'X-Synkron-Service-Token': serviceToken,
    });
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('forwards only authentication cookies, origin and CSRF for write authorization', async () => {
    const session = {
      tenant_id: tenantId,
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
    fetchMock.mockResolvedValue(Response.json(session));
    const authCookies = `${cookie}; __Host-synkron_context=${'c'.repeat(64)}; __Host-synkron_csrf=csrf-value`;

    await expect(
      service.authorizeWrite(
        `${authCookies}; unrelated=private`,
        'https://synkron.test',
        'csrf-value',
      ),
    ).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toEqual(new URL('http://api:3003/internal/auth/session'));
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({
      Cookie: authCookies,
      'X-Synkron-Service-Token': serviceToken,
      Origin: 'https://synkron.test',
      'X-CSRF-Token': 'csrf-value',
    });
  });

  it.each([
    { label: 'origin', origin: undefined, csrf: 'csrf-value' },
    { label: 'CSRF token', origin: 'https://synkron.test', csrf: undefined },
  ])(
    'rejects a write without $label before consulting the API',
    async ({ origin, csrf }) => {
      await expect(
        service.authorizeWrite(cookie, origin, csrf),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 401, error: UnauthorizedException },
    { status: 403, error: ForbiddenException },
    { status: 500, error: ServiceUnavailableException },
  ])(
    'maps write authorization status $status to the appropriate error',
    async ({ status, error }) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(
        service.authorizeWrite(cookie, 'https://synkron.test', 'csrf-value'),
      ).rejects.toBeInstanceOf(error);
    },
  );

  it.each([
    { label: 'missing', header: undefined },
    { label: 'unrelated', header: '__Host-synkron_csrf=value' },
    { label: 'malformed', header: '__Host-synkron_session=invalid' },
    { label: 'duplicated', header: `${cookie}; ${cookie}` },
  ])(
    'rejects a $label session cookie without consulting the API',
    async ({ header }) => {
      await expect(service.getSession(header)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('preserves an invalid-session response from the API', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([403, 500])(
    'treats upstream status %s as unavailability',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('rejects malformed JSON from the API', async () => {
    fetchMock.mockResolvedValue(new Response('invalid JSON', { status: 200 }));

    await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports a timeout as unavailability', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));

    await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects missing service configuration without making a request', async () => {
    delete process.env.SYNC_AUTH_SERVICE_TOKEN;

    await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'null body', body: null },
    {
      label: 'invalid owner',
      body: { tenant_id: 'invalid', expires_at: '2099-01-01T00:00:00Z' },
    },
    {
      label: 'invalid expiration',
      body: { tenant_id: tenantId, expires_at: 'invalid' },
    },
    {
      label: 'expired session',
      body: { tenant_id: tenantId, expires_at: '2000-01-01T00:00:00Z' },
    },
  ])('rejects an unexpected response: $label', async ({ body }) => {
    fetchMock.mockResolvedValue(Response.json(body));

    await expect(service.getSession(cookie)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
