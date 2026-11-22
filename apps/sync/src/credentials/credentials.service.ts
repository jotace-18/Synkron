import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CredentialsService {
  private readonly key: Buffer;

  constructor() {
    const key = process.env.SYNC_CREDENTIALS_KEY;

    if (!key || !/^[a-f0-9]{64}$/.test(key)) {
      throw new Error(
        'SYNC_CREDENTIALS_KEY debe contener 64 caracteres hexadecimales',
      );
    }

    this.key = Buffer.from(key, 'hex');
  }

  encrypt(token: string, tenantId: string, connectionId: string): string {
    if (!token) {
      throw new Error('La credencial no puede estar vacía');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, {
      authTagLength: 16,
    });

    cipher.setAAD(this.context(tenantId, connectionId));

    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join('.');
  }

  decrypt(value: string, tenantId: string, connectionId: string): string {
    try {
      const parts =
        /^v1\.([a-f0-9]{24})\.([a-f0-9]{32})\.((?:[a-f0-9]{2})+)$/.exec(value);

      if (!parts) {
        throw new Error('Formato inválido');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(parts[1], 'hex'),
        { authTagLength: 16 },
      );

      decipher.setAAD(this.context(tenantId, connectionId));
      decipher.setAuthTag(Buffer.from(parts[2], 'hex'));

      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('No se pudo descifrar la credencial');
    }
  }

  private context(tenantId: string, connectionId: string): Buffer {
    return Buffer.from(
      JSON.stringify(['synkron.connections.v1', tenantId, connectionId]),
      'utf8',
    );
  }
}
