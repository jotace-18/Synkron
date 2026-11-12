import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { connect, type ChannelModel } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

const settings = {
  RABBITMQ_HOST: 'rabbitmq',
  RABBITMQ_PORT: '5673',
  RABBITMQ_USER: 'test-user',
  RABBITMQ_PASSWORD: 'test-only:p@ss/word',
  RABBITMQ_VHOST: 'test/vhost',
};

describe('RabbitMQ connection', () => {
  let previousSettings: Map<string, string | undefined>;
  let connection: ChannelModel;
  let logError: jest.SpyInstance;
  const connectMock = jest.mocked(connect);

  beforeEach(() => {
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
    // Real EventEmitter semantics: an unhandled connection error would throw.
    connection = new EventEmitter() as ChannelModel;
    connectMock.mockReset().mockResolvedValue(connection);
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logError.mockRestore();
    for (const [name, value] of previousSettings) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('opens a connection with separate credentials, configured vhost, heartbeat and timeout', async () => {
    await expect(connectRabbitmq()).resolves.toBe(connection);
    expect(connectMock.mock.calls).toEqual([
      [
        {
          protocol: 'amqp',
          hostname: settings.RABBITMQ_HOST,
          port: 5673,
          username: settings.RABBITMQ_USER,
          password: settings.RABBITMQ_PASSWORD,
          vhost: settings.RABBITMQ_VHOST,
          heartbeat: 10,
        },
        { timeout: 5000 },
      ],
    ]);
    expect(logError).not.toHaveBeenCalled();
  });

  it('uses the default AMQP port when it is not configured', async () => {
    delete process.env.RABBITMQ_PORT;
    await connectRabbitmq();
    expect(connectMock.mock.calls[0][0]).toMatchObject({ port: 5672 });
  });

  describe.each([
    'RABBITMQ_HOST',
    'RABBITMQ_USER',
    'RABBITMQ_PASSWORD',
    'RABBITMQ_VHOST',
  ])('%s configuration', (name) => {
    it.each([undefined, ''])(
      'rejects missing or empty settings before opening a connection: %j',
      async (value) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
        await expect(connectRabbitmq()).rejects.toThrow(
          'Configuración de RabbitMQ incompleta o inválida',
        );
        expect(connectMock).not.toHaveBeenCalled();
      },
    );
  });

  it.each(['', '0', '-1', '65536', '5672.5', 'invalid', 'Infinity'])(
    'rejects invalid port %j before trying to connect',
    async (port) => {
      process.env.RABBITMQ_PORT = port;
      await expect(connectRabbitmq()).rejects.toThrow(
        'Configuración de RabbitMQ incompleta o inválida',
      );
      expect(connectMock).not.toHaveBeenCalled();
    },
  );

  it.each(['1', '65535'])('accepts a valid boundary port %s', async (port) => {
    process.env.RABBITMQ_PORT = port;
    await connectRabbitmq();
    expect(connectMock.mock.calls[0][0]).toMatchObject({ port: Number(port) });
  });

  it('reports a safe error if opening the connection fails', async () => {
    connectMock.mockRejectedValueOnce(
      new Error(`Private connection error: ${settings.RABBITMQ_PASSWORD}`),
    );
    await expect(connectRabbitmq()).rejects.toThrow(
      new Error('No se pudo conectar con RabbitMQ'),
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it('handles an asynchronous connection error without logging its sensitive content', async () => {
    await connectRabbitmq();
    expect(() =>
      connection.emit('error', new Error(settings.RABBITMQ_PASSWORD)),
    ).not.toThrow();
    expect(logError.mock.calls).toEqual([
      ['Error en la conexión con RabbitMQ'],
    ]);
  });

  it('reads configuration when called rather than capturing it at module import', async () => {
    process.env.RABBITMQ_VHOST = 'another-vhost';
    await connectRabbitmq();
    expect(connectMock.mock.calls[0][0]).toMatchObject({
      vhost: 'another-vhost',
    });
  });
});
