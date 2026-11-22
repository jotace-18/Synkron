import { ForbiddenException } from '@nestjs/common';
import { ConnectionProbeService } from './connection-probe.service';
import { ConnectionTargetPolicyService } from './connection-target-policy.service';

describe('ConnectionProbeService', () => {
  const address = 'http://task-api:3000/tasks';
  let previousOrigins: string | undefined;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let service: ConnectionProbeService;

  beforeEach(() => {
    previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://task-api:3000';
    fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('Unexpected request'));
    service = new ConnectionProbeService(new ConnectionTargetPolicyService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousOrigins === undefined) {
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    } else {
      process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
    }
  });

  it('sends the Bearer token to the allowed target without exposing response contents', async () => {
    const token = 'token-ficticio';
    fetchMock.mockResolvedValue(Response.json({ secret: token, items: [] }));

    await expect(service.probe(address, token)).resolves.toEqual({
      ok: true,
      status_code: 200,
      error: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toEqual(new URL(address));
    expect(options?.method).toBe('GET');
    expect(options?.headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(options?.redirect).toBe('manual');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('supports an unauthenticated connection and a successful empty response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(service.probe(address)).resolves.toEqual({
      ok: true,
      status_code: 204,
      error: null,
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });

  it.each([401, 403, 500])(
    'reports HTTP %s without returning the upstream body',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('private response', { status }));

      await expect(service.probe(address)).resolves.toEqual({
        ok: false,
        status_code: status,
        error: 'http_error',
      });
    },
  );

  it.each([302, 307])(
    'rejects HTTP %s without following a redirect and cancels its body',
    async (status) => {
      const cancel = jest.fn();
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancel();
        },
      });
      fetchMock.mockResolvedValue(
        new Response(body, {
          status,
          headers: { Location: 'http://api:3003/internal/auth/session' },
        }),
      );

      await expect(service.probe(address, 'token-ficticio')).resolves.toEqual({
        ok: false,
        status_code: status,
        error: 'redirect_not_allowed',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts a response of exactly 64 KiB', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(64 * 1024)));

    await expect(service.probe(address)).resolves.toEqual({
      ok: true,
      status_code: 200,
      error: null,
    });
  });

  it('cancels a response exceeding 64 KiB without trusting Content-Length', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel() {
        cancel();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Length': '1' },
      }),
    );

    await expect(service.probe(address)).resolves.toEqual({
      ok: false,
      status_code: 200,
      error: 'response_too_large',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('counts bytes cumulatively across response chunks', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40000));
        controller.enqueue(new Uint8Array(30000));
      },
      cancel() {
        cancel();
      },
    });
    fetchMock.mockResolvedValue(new Response(body));

    await expect(service.probe(address)).resolves.toEqual({
      ok: false,
      status_code: 200,
      error: 'response_too_large',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('limits bytes rather than the number of text characters', async () => {
    fetchMock.mockResolvedValue(new Response('é'.repeat(40000)));

    await expect(service.probe(address)).resolves.toEqual({
      ok: false,
      status_code: 200,
      error: 'response_too_large',
    });
  });

  it('reports a connection error without returning exception details', async () => {
    fetchMock.mockRejectedValue(new Error('private details: token-ficticio'));

    await expect(service.probe(address)).resolves.toEqual({
      ok: false,
      status_code: null,
      error: 'network_error',
    });
  });

  it('reports a response stream error after receiving headers', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Stream failed'));
      },
    });
    fetchMock.mockResolvedValue(new Response(body));

    await expect(service.probe(address)).resolves.toEqual({
      ok: false,
      status_code: 200,
      error: 'network_error',
    });
  });

  it('uses a three-second deadline and reports a timeout before receiving headers', async () => {
    const controller = new AbortController();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error('Missing deadline'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Timed out', 'TimeoutError'));
            },
            { once: true },
          );
        }),
    );

    const pending = service.probe(address);
    controller.abort(new DOMException('Timed out', 'TimeoutError'));

    await expect(pending).resolves.toEqual({
      ok: false,
      status_code: null,
      error: 'timeout',
    });
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('keeps the deadline active while reading the response body', async () => {
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        bodyController = streamController;
      },
    });
    controller.signal.addEventListener(
      'abort',
      () => {
        bodyController.error(new DOMException('Timed out', 'TimeoutError'));
      },
      { once: true },
    );
    fetchMock.mockResolvedValue(new Response(body));

    const pending = service.probe(address);
    await Promise.resolve();
    controller.abort(new DOMException('Timed out', 'TimeoutError'));

    await expect(pending).resolves.toEqual({
      ok: false,
      status_code: 200,
      error: 'timeout',
    });
  });

  it('rejects an unauthorized target before sending credentials or making a request', async () => {
    await expect(
      service.probe('http://api:3003/internal/auth/session', 'token-ficticio'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
