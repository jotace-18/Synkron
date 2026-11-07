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
      label: 'unsupported authentication',
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
  ])('rejects $label', async ({ changes }) => {
    const dto = plainToInstance(CreateConnectionDto, {
      ...validInput,
      ...changes,
    });

    const errors = await validate(dto, validationOptions);

    expect(errors.length).toBeGreaterThan(0);
  });
});
