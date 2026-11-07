import { ForbiddenException } from '@nestjs/common';
import { ConnectionTargetPolicyService } from './connection-target-policy.service';

describe('ConnectionTargetPolicyService', () => {
  let previousOrigins: string | undefined;

  beforeEach(() => {
    previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://task-api:3000';
  });

  afterEach(() => {
    if (previousOrigins === undefined) {
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    } else {
      process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
    }
  });

  it('accepts a path on an explicitly allowed origin', () => {
    const policy = new ConnectionTargetPolicyService();

    expect(policy.assertAllowed('http://task-api:3000/tasks').href).toBe(
      'http://task-api:3000/tasks',
    );
  });

  it.each([
    { label: 'the internal API', url: 'http://api:3003/internal/auth/session' },
    { label: 'loopback', url: 'http://127.0.0.1:3000/tasks' },
    {
      label: 'cloud metadata',
      url: 'http://169.254.169.254/latest/meta-data/',
    },
    { label: 'another protocol', url: 'https://task-api:3000/tasks' },
    { label: 'another port', url: 'http://task-api:4000/tasks' },
    {
      label: 'a similar hostname',
      url: 'http://task-api.example.com:3000/tasks',
    },
    {
      label: 'embedded credentials',
      url: 'http://user:password@task-api:3000/tasks',
    },
    {
      label: 'query parameters',
      url: 'http://task-api:3000/tasks?token=ficticio',
    },
    { label: 'a fragment', url: 'http://task-api:3000/tasks#fragment' },
    { label: 'a protocol-relative URL', url: '//task-api:3000/tasks' },
    { label: 'a malformed URL', url: 'not-a-url' },
  ])('rejects $label', ({ url }) => {
    const policy = new ConnectionTargetPolicyService();

    expect(() => policy.assertAllowed(url)).toThrow(ForbiddenException);
  });

  it('rejects all targets when no origins are configured', () => {
    delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    const policy = new ConnectionTargetPolicyService();

    expect(() => policy.assertAllowed('http://task-api:3000/tasks')).toThrow(
      ForbiddenException,
    );
  });

  it('supports multiple origins and normalizes default ports', () => {
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS =
      ' http://task-api:3000/ , https://tasks.example.com:443 , ';
    const policy = new ConnectionTargetPolicyService();

    expect(policy.assertAllowed('http://task-api:3000/tasks').origin).toBe(
      'http://task-api:3000',
    );
    expect(policy.assertAllowed('https://tasks.example.com/tasks').origin).toBe(
      'https://tasks.example.com',
    );
  });

  it.each([
    { label: 'malformed URL', value: 'invalid' },
    { label: 'unsupported protocol', value: 'ftp://task-api:3000' },
    { label: 'path', value: 'http://task-api:3000/tasks' },
    { label: 'credentials', value: 'http://user:password@task-api:3000' },
    { label: 'query', value: 'http://task-api:3000?token=ficticio' },
    { label: 'fragment', value: 'http://task-api:3000#fragment' },
  ])('rejects origin configuration containing $label', ({ value }) => {
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = value;

    expect(() => new ConnectionTargetPolicyService()).toThrow(
      'SYNC_ALLOWED_CONNECTION_ORIGINS inválido',
    );
  });
});
