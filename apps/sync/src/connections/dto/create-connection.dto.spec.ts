import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateConnectionDto } from './create-connection.dto';

describe('CreateConnectionDto', () => {
  const validInput = {
    name: '  Mis tareas  ',
    base_url: 'https://tasks.example.com',
    auth: { type: 'none' },
  };

  const validationOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
  };

  it('trims the name and enables the connection by default', async () => {
    const dto = plainToInstance(CreateConnectionDto, validInput);

    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.name).toBe('Mis tareas');
    expect(dto.enabled).toBe(true);
  });

  it('accepts an explicitly disabled connection', async () => {
    const dto = plainToInstance(CreateConnectionDto, {
      ...validInput,
      enabled: false,
    });

    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.enabled).toBe(false);
  });

  it('accepts Bearer authentication and preserves the exact token', async () => {
    const token = 'AbC09-._~+/==';
    const dto = plainToInstance(CreateConnectionDto, {
      ...validInput,
      auth: { type: 'bearer', token },
    });

    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.auth.type).toBe('bearer');
    if (dto.auth.type !== 'bearer') throw new Error('Expected Bearer DTO');
    expect(dto.auth.token).toBe(token);
  });

  it('accepts a token at the maximum supported length', async () => {
    const dto = plainToInstance(CreateConnectionDto, {
      ...validInput,
      auth: { type: 'bearer', token: 'a'.repeat(4096) },
    });

    expect(await validate(dto, validationOptions)).toHaveLength(0);
  });

  it.each([
    { label: 'a blank name', changes: { name: '   ' } },
    { label: 'a long name', changes: { name: 'a'.repeat(101) } },
    { label: 'a URL without protocol', changes: { base_url: 'example.com' } },
    { label: 'an FTP URL', changes: { base_url: 'ftp://example.com' } },
    {
      label: 'credentials inside the URL',
      changes: { base_url: 'https://user:password@example.com' },
    },
    { label: 'missing authentication', changes: { auth: undefined } },
    {
      label: 'Bearer authentication without a token',
      changes: { auth: { type: 'bearer' } },
    },
    {
      label: 'unexpected credentials',
      changes: { auth: { type: 'none', token: 'unexpected' } },
    },
    { label: 'a string boolean', changes: { enabled: 'false' } },
    { label: 'a null boolean', changes: { enabled: null } },
    {
      label: 'an owner supplied in the body',
      changes: { tenant_id: '11111111-1111-4111-8111-111111111111' },
    },
    { label: 'unknown authentication', changes: { auth: { type: 'basic' } } },
    {
      label: 'an empty token',
      changes: { auth: { type: 'bearer', token: '' } },
    },
    {
      label: 'a numeric token',
      changes: { auth: { type: 'bearer', token: 123 } },
    },
    {
      label: 'whitespace in a token',
      changes: { auth: { type: 'bearer', token: ' token ' } },
    },
    {
      label: 'a line break in a token',
      changes: { auth: { type: 'bearer', token: 'token\r\nInjected:value' } },
    },
    {
      label: 'an oversized token',
      changes: { auth: { type: 'bearer', token: 'a'.repeat(4097) } },
    },
    {
      label: 'padding inside a token',
      changes: { auth: { type: 'bearer', token: 'abc=def' } },
    },
    {
      label: 'additional Bearer fields',
      changes: { auth: { type: 'bearer', token: 'valid-token', extra: true } },
    },
    { label: 'null authentication', changes: { auth: null } },
    { label: 'an authentication array', changes: { auth: [{ type: 'none' }] } },
  ])('rejects $label', async ({ changes }) => {
    const dto = plainToInstance(CreateConnectionDto, {
      ...validInput,
      ...changes,
    });

    const errors = await validate(dto, validationOptions);

    expect(errors.length).toBeGreaterThan(0);
  });
});
