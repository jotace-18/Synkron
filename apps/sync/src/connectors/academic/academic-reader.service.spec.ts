import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { ConnectionTargetPolicyService } from '../../connections/connection-target-policy.service';
import { AcademicReaderService } from './academic-reader.service';
import type { AcademicAssignmentSource } from './assignment-source.types';

describe('AcademicReaderService', () => {
  const address = 'http://academic:3000/api/v1/assignments/export';
  const token = 'academic-test-token';
  let previousOrigins: string | undefined;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let service: AcademicReaderService;

  function assignment(): AcademicAssignmentSource {
    return {
      id: 'd1903b29-d126-4c48-9bbf-226cf0829309',
      title: 'Entrega de prácticas',
      course_name: 'Cloud Computing',
      course_abbreviation: null,
      section: 'practice',
      mandatory: false,
      due_date: '2026-11-24',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: 0,
      created_at: '2026-11-08T19:00:00.000Z',
      updated_at: '2026-11-08T19:00:00.000Z',
      deleted_at: null,
    };
  }

  beforeEach(() => {
    previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://academic:3000';
    fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('Unexpected request'));
    service = new AcademicReaderService(new ConnectionTargetPolicyService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousOrigins === undefined) {
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    } else {
      process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
    }
  });

  it('reads one page using default pagination and Bearer authentication', async () => {
    const items = [assignment()];
    fetchMock.mockResolvedValue(Response.json(items));

    await expect(service.readPage(address, token)).resolves.toEqual(items);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toEqual(new URL(`${address}?limit=20&offset=0`));
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });
    expect(options?.redirect).toBe('manual');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts custom pagination without fetching the following page', async () => {
    fetchMock.mockResolvedValue(
      Response.json(Array.from({ length: 50 }, () => assignment())),
    );

    await expect(
      service.readPage(address, token, 50, 100),
    ).resolves.toHaveLength(50);

    expect(fetchMock.mock.calls[0][0]).toEqual(
      new URL(`${address}?limit=50&offset=100`),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty final page', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await expect(service.readPage(address, token)).resolves.toEqual([]);
  });

  it('preserves instant deadlines and explicit deletion marks in validated records', async () => {
    const source = {
      ...assignment(),
      due_date: null,
      due_at: '2026-11-24T23:59:00+01:00',
      updated_at: '2026-11-09T12:00:00.000Z',
      deleted_at: '2026-11-09T12:00:00.000Z',
    };
    fetchMock.mockResolvedValue(Response.json([source]));
    await expect(service.readPage(address, token)).resolves.toEqual([source]);
  });

  it.each([
    null,
    { id: 'incomplete' },
    { ...assignment(), grade: 11 },
    { ...assignment(), due_date: '2026-02-30' },
    { ...assignment(), weight_percent: 25, weight_basis: null },
    { ...assignment(), work_mode: 'individual', group_members: ['Ana'] },
  ])(
    'rejects the whole page if a record violates the Academic contract: %j',
    async (invalid) => {
      fetchMock.mockResolvedValue(Response.json([assignment(), invalid]));
      await expect(service.readPage(address, token)).rejects.toThrow(
        'Academic devolvió una entrega con estructura inválida',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [0, 0],
    [51, 0],
    [1.5, 0],
    [NaN, 0],
    [Infinity, 0],
    [20, -1],
    [20, 0.5],
    [20, NaN],
    [20, Number.MAX_SAFE_INTEGER + 1],
  ])(
    'rejects invalid pagination (%s, %s) before making a request',
    async (limit, offset) => {
      await expect(
        service.readPage(address, token, limit, offset),
      ).rejects.toThrow('Paginación académica inválida');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'http://api:3003/internal/auth/session',
    'http://academic:3000.evil.example/api/v1/assignments/export',
    `${address}?limit=5000`,
    `${address}#fragment`,
    'http://user:password@academic:3000/api/v1/assignments/export',
  ])(
    'rejects an unauthorized address before sending credentials: %s',
    async (target) => {
      await expect(service.readPage(target, token)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([204, 301, 302, 307, 401, 403, 500])(
    'rejects HTTP %s without following redirects or exposing its response',
    async (status) => {
      const cancel = jest.fn();
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancel();
        },
      });
      fetchMock.mockResolvedValue(
        new Response(status === 204 ? null : body, {
          status,
          headers: { Location: 'http://api:3003/internal/auth/session' },
        }),
      );

      await expect(service.readPage(address, token)).rejects.toThrow(
        'Academic no devolvió una página de entregas',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      if (status !== 204) expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a successful response without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null));
    await expect(service.readPage(address, token)).rejects.toThrow(
      'Academic devolvió una respuesta vacía',
    );
  });

  it.each(['{}', 'null', '"text"', '123', '{"items":[]}'])(
    'rejects valid JSON that is not a root array: %s',
    async (body) => {
      fetchMock.mockResolvedValue(new Response(body));
      await expect(service.readPage(address, token)).rejects.toThrow(
        'Academic devolvió un formato de página inesperado',
      );
    },
  );

  it('rejects a page with more items than requested', async () => {
    fetchMock.mockResolvedValue(Response.json([{}, {}]));
    await expect(service.readPage(address, token, 1)).rejects.toThrow(
      'Academic devolvió un formato de página inesperado',
    );
  });

  it('rejects malformed JSON without exposing source contents', async () => {
    fetchMock.mockResolvedValue(
      new Response(`private source contents: ${token}`),
    );
    await expect(service.readPage(address, token)).rejects.toThrow(
      'No se pudo leer la página de entregas de Academic',
    );
  });

  it('accepts valid JSON of exactly 64 KiB', async () => {
    const items = [assignment()];
    const json = JSON.stringify(items);
    const body = json + ' '.repeat(64 * 1024 - Buffer.byteLength(json));
    fetchMock.mockResolvedValue(new Response(body));
    await expect(service.readPage(address, token)).resolves.toEqual(items);
  });

  it('cancels an oversized body even if Content-Length advertises fewer bytes', async () => {
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
      new Response(body, { headers: { 'Content-Length': '1' } }),
    );

    await expect(service.readPage(address, token)).rejects.toThrow(
      'La página académica supera el tamaño permitido',
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('counts cumulative bytes across chunks, rather than text characters', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('é'.repeat(20000)));
        controller.enqueue(new TextEncoder().encode('é'.repeat(15000)));
      },
      cancel() {
        cancel();
      },
    });
    fetchMock.mockResolvedValue(new Response(body));

    await expect(service.readPage(address, token)).rejects.toThrow(
      'La página académica supera el tamaño permitido',
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('decodes UTF-8 characters split across stream chunks and releases the reader', async () => {
    const items = [{ ...assignment(), title: 'Préctica' }];
    const bytes = new TextEncoder().encode(JSON.stringify(items));
    const split = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(body));
    await expect(service.readPage(address, token)).resolves.toEqual(items);
    expect(body.locked).toBe(false);
  });

  it('sanitizes network errors instead of exposing credentials or internal details', async () => {
    fetchMock.mockRejectedValue(new Error(`private credentials: ${token}`));
    const error: unknown = await service
      .readPage(address, token)
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toEqual({
      statusCode: 502,
      message: 'No se pudo leer la página de entregas de Academic',
      error: 'Bad Gateway',
    });
  });

  it('sanitizes stream errors and releases the reader', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(`private: ${token}`));
      },
    });
    fetchMock.mockResolvedValue(new Response(body));
    await expect(service.readPage(address, token)).rejects.toThrow(
      'No se pudo leer la página de entregas de Academic',
    );
    expect(body.locked).toBe(false);
  });

  it('uses a three-second deadline before headers arrive', async () => {
    const controller = new AbortController();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('Timed out')),
            { once: true },
          );
        }),
    );

    const pending = service.readPage(address, token);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(BadGatewayException);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('keeps the deadline active while reading the body', async () => {
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        streamController = value;
      },
    });
    controller.signal.addEventListener(
      'abort',
      () => {
        streamController.error(new Error('Timed out reading body'));
      },
      { once: true },
    );
    fetchMock.mockResolvedValue(new Response(body));

    const pending = service.readPage(address, token);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(BadGatewayException);
    expect(body.locked).toBe(false);
  });

  describe('readAll', () => {
    function assignments(count: number): AcademicAssignmentSource[] {
      return Array.from({ length: count }, (_, index) => ({
        ...assignment(),
        id: `d1903b29-d126-4c48-9bbf-${index.toString(16).padStart(12, '0')}`,
      }));
    }

    function respondWithPages(records: AcademicAssignmentSource[]): void {
      for (let offset = 0; offset <= records.length; offset += 20) {
        fetchMock.mockResolvedValueOnce(
          Response.json(records.slice(offset, offset + 20)),
        );
      }
    }

    it.each([0, 1, 19, 20, 21, 40, 41])(
      'reads %s assignments in order and stops after the first short page',
      async (count) => {
        const records = assignments(count);
        respondWithPages(records);

        await expect(service.readAll(address, token)).resolves.toEqual(records);

        const requests = Math.floor(count / 20) + 1;
        expect(fetchMock).toHaveBeenCalledTimes(requests);
        fetchMock.mock.calls.forEach(([url, options], index) => {
          expect(url).toEqual(
            new URL(`${address}?limit=20&offset=${index * 20}`),
          );
          expect(options?.headers).toEqual({
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          });
        });
      },
    );

    it('rejects duplicate IDs inside a short page instead of returning duplicate data', async () => {
      fetchMock.mockResolvedValueOnce(
        Response.json([assignment(), assignment()]),
      );
      await expect(service.readAll(address, token)).rejects.toThrow(
        'Academic devolvió entregas repetidas durante la paginación',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('recognizes an existing UUID when it reappears on another page in uppercase', async () => {
      const records = assignments(20);
      fetchMock.mockResolvedValueOnce(Response.json(records));
      fetchMock.mockResolvedValueOnce(
        Response.json([{ ...records[0], id: records[0].id.toUpperCase() }]),
      );
      await expect(service.readAll(address, token)).rejects.toThrow(
        'Academic devolvió entregas repetidas durante la paginación',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops if the source ignores offsets and repeats the same full page', async () => {
      const records = assignments(20);
      fetchMock.mockImplementation(() =>
        Promise.resolve(Response.json(records)),
      );
      await expect(service.readAll(address, token)).rejects.toThrow(
        'Academic devolvió entregas repetidas durante la paginación',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([401, 403, 500])(
      'rejects the entire read when a later page responds with HTTP %s',
      async (status) => {
        fetchMock.mockResolvedValueOnce(Response.json(assignments(20)));
        fetchMock.mockResolvedValueOnce(
          new Response('private contents', { status }),
        );
        await expect(service.readAll(address, token)).rejects.toThrow(
          'Academic no devolvió una página de entregas',
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it('does not turn a later network failure into a successful partial result', async () => {
      fetchMock.mockResolvedValueOnce(Response.json(assignments(20)));
      fetchMock.mockRejectedValueOnce(new Error(`private token: ${token}`));
      await expect(service.readAll(address, token)).rejects.toThrow(
        'No se pudo leer la página de entregas de Academic',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('validates records on later pages and rejects the complete read if one is invalid', async () => {
      fetchMock.mockResolvedValueOnce(Response.json(assignments(20)));
      fetchMock.mockResolvedValueOnce(
        Response.json([{ ...assignment(), grade: 11 }]),
      );
      await expect(service.readAll(address, token)).rejects.toThrow(
        'Academic devolvió una entrega con estructura inválida',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('accepts a short final page at the maximum permitted page count', async () => {
      const records = assignments(1999);
      respondWithPages(records);
      await expect(service.readAll(address, token)).resolves.toEqual(records);
      expect(fetchMock).toHaveBeenCalledTimes(100);
    });

    it('fails at the page limit without fetching more pages or returning truncated data', async () => {
      respondWithPages(assignments(2000));
      await expect(service.readAll(address, token)).rejects.toThrow(
        'La lectura académica supera el límite de páginas permitido',
      );
      expect(fetchMock).toHaveBeenCalledTimes(100);
    });

    it('preserves the destination policy before sending credentials or requesting any page', async () => {
      await expect(
        service.readAll('http://api:3003/internal/auth/session', token),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
