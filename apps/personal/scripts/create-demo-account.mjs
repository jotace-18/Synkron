import { createHash } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
});
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 128) throw new Error('Invalid credential');
    chunks.push(bytes);
  }
  const token = Buffer.concat(chunks).toString('utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid credential');
  const hash = createHash('sha256').update(token).digest('hex');
  const result = await pool.query(
    `INSERT INTO personal.accounts(name, token_hash)
     VALUES('Cuenta personal de demostración', $1)
     ON CONFLICT(token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash
     RETURNING id, name, enabled`,
    [hash],
  );
  console.log(JSON.stringify(result.rows[0], null, 2));
} catch {
  console.error(
    'No se pudo preparar la cuenta personal. Comprueba la migración, la conexión y la credencial de 64 caracteres hexadecimales enviada por stdin.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
