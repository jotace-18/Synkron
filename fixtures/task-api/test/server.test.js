import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));
const token = 'fixture-test-token';
let serverProcess;
let baseUrl;

before(async () => {
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: '0', TASK_API_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('La API de tareas no arrancó en diez segundos'));
    }, 10000);
    let output = '';
    let startupError = '';

    serverProcess.stderr.on('data', (chunk) => {
      startupError = (startupError + chunk.toString()).slice(-4000);
    });

    serverProcess.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    serverProcess.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(
        `La API de tareas terminó antes de estar disponible: ${startupError}`,
      ));
    });
    serverProcess.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = /escuchando en el puerto (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        baseUrl = `http://127.0.0.1:${match[1]}`;
        resolve();
      }
    });
  });
});

after(async () => {
  if (
    serverProcess &&
    serverProcess.exitCode === null &&
    serverProcess.signalCode === null
  ) {
    const exited = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await exited;
  }
});

function call(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(3000),
  });
}

test('health is available without credentials', async () => {
  const response = await call('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'task-api' });
});

test('tasks require a Bearer token', async () => {
  const response = await call('/tasks');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="tasks"');
  assert.deepEqual(await response.json(), { message: 'Token no válido' });
});

test('tasks reject an incorrect Bearer token', async () => {
  const response = await call('/tasks', {
    headers: { Authorization: 'Bearer incorrect-token' },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Token no válido' });
});

test('an authorized request returns the fixture tasks without exposing credentials', async () => {
  const response = await call('/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body, {
    items: [
      { id: 'task-1', title: 'Preparar la entrega', completed: false },
      { id: 'task-2', title: 'Revisar documentación', completed: true },
    ],
  });
  assert.equal(JSON.stringify(body).includes(token), false);
});

test('unknown routes return 404', async () => {
  const response = await call('/unknown');
  assert.equal(response.status, 404);
  await response.json();
});

test('unsupported methods do not expose tasks', async () => {
  const response = await call('/tasks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404);
  await response.json();
});
