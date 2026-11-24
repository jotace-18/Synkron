import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  encoded?: string,
): Promise<boolean> {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded ?? '');
  const key = await derive(
    password,
    match?.[1] ?? '00000000000000000000000000000000',
  );
  return !!match && timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
