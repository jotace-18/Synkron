import { parseSyncRunMessage } from './sync-run-message';

const validMessage = () => ({
  schema_version: 1,
  run_id: 'abcdef12-3456-4789-8abc-123456789abc',
  tenant_id: 'fedcba98-7654-4321-9abc-abcdef123456',
});

describe('Sync run message contract', () => {
  it('accepts a message decoded from JSON', () => {
    const decoded: unknown = JSON.parse(JSON.stringify(validMessage()));
    expect(parseSyncRunMessage(decoded)).toEqual(validMessage());
  });

  it('normalizes uppercase UUIDs to the identity used by PostgreSQL', () => {
    const message = validMessage();
    expect(
      parseSyncRunMessage({
        ...message,
        run_id: message.run_id.toUpperCase(),
        tenant_id: message.tenant_id.toUpperCase(),
      }),
    ).toEqual(message);
  });

  it('returns an independent object without modifying the received message', () => {
    const message = validMessage();
    const parsed = parseSyncRunMessage(message);
    expect(parsed).not.toBe(message);
    parsed.run_id = '11111111-1111-4111-8111-111111111111';
    expect(message).toEqual(validMessage());
  });

  it.each([undefined, null, 'not-an-object', 1, [], true])(
    'rejects a non-object payload: %j',
    (value) => {
      expect(() => parseSyncRunMessage(value)).toThrow(
        'Mensaje de ejecución no válido',
      );
    },
  );

  it.each([0, 2, '1', null])(
    'rejects unsupported schema version %j',
    (version) => {
      expect(() =>
        parseSyncRunMessage({ ...validMessage(), schema_version: version }),
      ).toThrow('Mensaje de ejecución no válido');
    },
  );

  it.each(['schema_version', 'run_id', 'tenant_id'] as const)(
    'rejects a message with missing %s',
    (field) => {
      const message: Record<string, unknown> = validMessage();
      delete message[field];
      expect(() => parseSyncRunMessage(message)).toThrow(
        'Mensaje de ejecución no válido',
      );
    },
  );

  describe.each(['run_id', 'tenant_id'] as const)('%s validation', (field) => {
    it.each([
      null,
      42,
      '',
      'not-a-uuid',
      '11111111-1111-1111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa',
      ' abcdef12-3456-4789-8abc-123456789abc ',
    ])('rejects invalid identity %j', (value) => {
      expect(() =>
        parseSyncRunMessage({ ...validMessage(), [field]: value }),
      ).toThrow('Mensaje de ejecución no válido');
    });
  });

  it.each(['token', 'definition_id'])(
    'rejects unexpected %s instead of silently accepting it',
    (field) => {
      expect(() =>
        parseSyncRunMessage({ ...validMessage(), [field]: 'unexpected-value' }),
      ).toThrow('Mensaje de ejecución no válido');
    },
  );

  it('rejects an unexpected field even when it replaces a missing expected field', () => {
    const message: Record<string, unknown> = validMessage();
    delete message.tenant_id;
    message.account_id = validMessage().tenant_id;
    expect(() => parseSyncRunMessage(message)).toThrow(
      'Mensaje de ejecución no válido',
    );
  });

  it('does not copy untrusted payload content into the error', () => {
    const marker = 'private-payload-must-not-leak';
    expect(() =>
      parseSyncRunMessage({ ...validMessage(), token: marker }),
    ).toThrow(new Error('Mensaje de ejecución no válido'));
  });
});
