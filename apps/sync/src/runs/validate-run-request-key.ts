import { UnprocessableEntityException } from '@nestjs/common';

export function validateRunRequestKey(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new UnprocessableEntityException(
      'Idempotency-Key es obligatoria: entre 1 y 128 caracteres alfanuméricos, punto, guion, guion bajo o dos puntos',
    );
  }
}
