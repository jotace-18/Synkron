import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConnectionTargetPolicyService } from '../../connections/connection-target-policy.service';
import { isRecord } from '../../validation/value-validators';

@Injectable()
export class CanonicalReaderService {
  constructor(private readonly targets: ConnectionTargetPolicyService) {}
  async readAll(
    address: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const records: unknown[] = [],
      seen = new Set<string>(),
      limit = 20;
    for (let page = 0; page < 100; page++) {
      signal?.throwIfAborted();
      const items = await this.readPage(
        address,
        token,
        limit,
        page * limit,
        signal,
      );
      for (const item of items) {
        if (
          !isRecord(item) ||
          typeof item.external_id !== 'string' ||
          seen.has(item.external_id)
        )
          throw new BadGatewayException(
            'La fuente canónica devolvió registros sin identidad o repetidos',
          );
        seen.add(item.external_id);
        records.push(item);
      }
      if (items.length < limit) return records;
    }
    throw new BadGatewayException(
      'La exportación canónica supera el límite de páginas',
    );
  }
  async readPage(
    address: string,
    token: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const url = this.targets.assertAllowed(address);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    try {
      const timeout = AbortSignal.timeout(3000);
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        throw new BadGatewayException(
          'La fuente canónica no devolvió una página válida',
        );
      }
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 64 * 1024) {
            await reader.cancel();
            throw new BadGatewayException('La página canónica supera 64 KiB');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const items: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      );
      if (!Array.isArray(items) || items.length > limit)
        throw new BadGatewayException('Formato de página canónica no válido');
      return items as unknown[];
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('No se pudo consultar la fuente canónica');
    }
  }
}
