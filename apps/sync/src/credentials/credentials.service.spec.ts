import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const connectionId = '22222222-2222-4222-8222-222222222222';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const token = 'token-ficticio-para-pruebas';
  let previousKey: string | undefined;
  let service: CredentialsService;

  beforeEach(() => {
    previousKey = process.env.SYNC_CREDENTIALS_KEY;
    process.env.SYNC_CREDENTIALS_KEY = '1'.repeat(64);
    service = new CredentialsService();
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.SYNC_CREDENTIALS_KEY;
    else process.env.SYNC_CREDENTIALS_KEY = previousKey;
  });

  it('recovers the exact token without storing it in plaintext', () => {
    const encrypted = service.encrypt(token, tenantId, connectionId);

    expect(encrypted).not.toContain(token);
    expect(service.decrypt(encrypted, tenantId, connectionId)).toBe(token);
  });

  it('uses fresh randomness when encrypting the same token twice', () => {
    const first = service.encrypt(token, tenantId, connectionId);
    const second = service.encrypt(token, tenantId, connectionId);

    expect(first).not.toBe(second);
    expect(first.split('.')[1]).not.toBe(second.split('.')[1]);
    expect(service.decrypt(first, tenantId, connectionId)).toBe(token);
    expect(service.decrypt(second, tenantId, connectionId)).toBe(token);
  });

  it.each([
    { label: 'owner', tenant: otherId, connection: connectionId },
    { label: 'connection', tenant: tenantId, connection: otherId },
  ])(
    'rejects credentials moved to another $label',
    ({ tenant, connection }) => {
      const encrypted = service.encrypt(token, tenantId, connectionId);

      expect(() => service.decrypt(encrypted, tenant, connection)).toThrow(
        'No se pudo descifrar la credencial',
      );
    },
  );

  it.each([
    { label: 'initialization vector', index: 1 },
    { label: 'authentication tag', index: 2 },
    { label: 'ciphertext', index: 3 },
  ])('rejects an altered $label', ({ index }) => {
    const parts = service.encrypt(token, tenantId, connectionId).split('.');
    const replacement = parts[index].startsWith('0') ? '1' : '0';
    parts[index] = replacement + parts[index].slice(1);

    expect(() =>
      service.decrypt(parts.join('.'), tenantId, connectionId),
    ).toThrow('No se pudo descifrar la credencial');
  });

  it('rejects decryption with a different key', () => {
    const encrypted = service.encrypt(token, tenantId, connectionId);
    process.env.SYNC_CREDENTIALS_KEY = '2'.repeat(64);
    const otherService = new CredentialsService();

    expect(() =>
      otherService.decrypt(encrypted, tenantId, connectionId),
    ).toThrow('No se pudo descifrar la credencial');
  });

  it('rejects malformed stored credentials', () => {
    expect(() =>
      service.decrypt('invalid-format', tenantId, connectionId),
    ).toThrow('No se pudo descifrar la credencial');
  });

  it.each([
    { label: 'missing', key: undefined },
    { label: 'short', key: '1234' },
    { label: 'non-hexadecimal', key: 'z'.repeat(64) },
  ])('rejects a $label encryption key', ({ key }) => {
    if (key === undefined) delete process.env.SYNC_CREDENTIALS_KEY;
    else process.env.SYNC_CREDENTIALS_KEY = key;

    expect(() => new CredentialsService()).toThrow('SYNC_CREDENTIALS_KEY');
  });

  it('rejects empty tokens', () => {
    expect(() => service.encrypt('', tenantId, connectionId)).toThrow(
      'La credencial no puede estar vacía',
    );
  });
});
