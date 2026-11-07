import { createServer } from 'node:http';

const token = process.env.TASK_API_TOKEN;

if (!token) {
  throw new Error('Falta TASK_API_TOKEN');
}

const tasks = [
  {
    id: 'task-1',
    title: 'Preparar la entrega',
    completed: false,
  },
  {
    id: 'task-2',
    title: 'Revisar documentación',
    completed: true,
  },
];

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;

  if (request.method === 'GET' && path === '/healthz') {
    sendJson(response, 200, {
      status: 'ok',
      service: 'task-api',
    });
    return;
  }

  if (request.method === 'GET' && path === '/tasks') {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.setHeader('WWW-Authenticate', 'Bearer realm="tasks"');
      sendJson(response, 401, { message: 'Token no válido' });
      return;
    }

    sendJson(response, 200, { items: tasks });
    return;
  }

  sendJson(response, 404, { message: 'Ruta no encontrada' });
});

server.listen(Number(process.env.PORT ?? 3100), '0.0.0.0', () => {
  console.log(`Task API escuchando en el puerto ${server.address().port}`);
});