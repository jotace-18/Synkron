import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConnectionTargetPolicyService } from '../../connections/connection-target-policy.service';
import type { AcademicAssignmentSource } from './assignment-source.types';
import { parseAcademicAssignment } from './assignment-source.validator';

@Injectable()
export class AcademicReaderService {
  constructor(private readonly targets: ConnectionTargetPolicyService) {}

  async readAll(
    address: string,
    token: string,
  ): Promise<AcademicAssignmentSource[]> {
    const limit = 20;
    const maxPages = 100;
    const assignments: AcademicAssignmentSource[] = [];
    const seenIds = new Set<string>();

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const page = await this.readPage(
        address,
        token,
        limit,
        pageIndex * limit,
      );

      for (const assignment of page) {
        const identity = assignment.id.toLowerCase();

        if (seenIds.has(identity)) {
          throw new BadGatewayException(
            'Academic devolvió entregas repetidas durante la paginación',
          );
        }

        seenIds.add(identity);
        assignments.push(assignment);
      }

      if (page.length < limit) {
        return assignments;
      }
    }

    throw new BadGatewayException(
      'La lectura académica supera el límite de páginas permitido',
    );
  }

  async readPage(
    address: string,
    token: string,
    limit = 20,
    offset = 0,
  ): Promise<AcademicAssignmentSource[]> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      throw new Error('Paginación académica inválida');
    }

    const url = this.targets.assertAllowed(address);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      });

      if (response.status !== 200) {
        await response.body?.cancel();
        throw new BadGatewayException(
          'Academic no devolvió una página de entregas',
        );
      }

      if (!response.body) {
        throw new BadGatewayException('Academic devolvió una respuesta vacía');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          bytes += value.byteLength;

          if (bytes > 64 * 1024) {
            await reader.cancel();
            throw new BadGatewayException(
              'La página académica supera el tamaño permitido',
            );
          }

          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const items: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      if (!Array.isArray(items) || items.length > limit) {
        throw new BadGatewayException(
          'Academic devolvió un formato de página inesperado',
        );
      }

      return (items as unknown[]).map(parseAcademicAssignment);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        'No se pudo leer la página de entregas de Academic',
      );
    }
  }
}
