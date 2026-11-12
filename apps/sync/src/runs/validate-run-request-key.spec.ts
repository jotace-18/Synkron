import { UnprocessableEntityException } from '@nestjs/common';
import { validateRunRequestKey } from './validate-run-request-key';

describe('Run request idempotency key', () => {
  it.each(['a', 'A-1_test.request:retry', 'x'.repeat(128)])(
    'accepts %s',
    (key) => {
      expect(() => validateRunRequestKey(key)).not.toThrow();
    },
  );
  it.each([
    undefined,
    null,
    1,
    [],
    ['a', 'b'],
    {},
    '',
    ' ',
    ' a',
    'a ',
    'a,b',
    'a/b',
    'á',
    '-a',
    'a\nb',
    'a\n',
    'a\r\n',
    'x'.repeat(129),
  ])('rejects invalid or ambiguous key %j', (key) => {
    expect(() => validateRunRequestKey(key)).toThrow(
      UnprocessableEntityException,
    );
  });
});
