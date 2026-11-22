import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const academicOrigin: Plugin = {
  name: 'campus-academic-origin',
  configureServer(server) {
    const origins = new Set(['http://127.0.0.1:5174', 'http://localhost:5174'])
    server.middlewares.use((request, response, next) => {
      if (!/^\/api\/v1\/(?:assignments|exams)(?:\/|\?|$)/.test(request.url ?? '')) return next()
      const origin = request.headers.origin
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET')
      if ((origin && !origins.has(origin)) || (write && !origin)) {
        response.statusCode = 403
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ message: 'Origen no permitido' }))
        return
      }
      next()
    })
  },
}

export default defineConfig(({ command, mode, isPreview }) => {
  const developing = command === 'serve' && !isPreview
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  // This value is read only by the local development server, never by the build.
  const token = developing
    ? loadEnv(mode, repoRoot, 'ACADEMIC_DEMO_TOKEN').ACADEMIC_DEMO_TOKEN
    : undefined

  if (developing && !token) {
    throw new Error('Falta ACADEMIC_DEMO_TOKEN en el .env de la raíz de Synkron.')
  }

  return {
    plugins: [react(), academicOrigin],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      cors: false,
      proxy: developing ? {
        '/api/v1/exams': { target: 'http://127.0.0.1:3101', changeOrigin: true, proxyTimeout: 10_000, headers: { Authorization: `Bearer ${token}` } },
        '/api/v1/assignments': {
          target: 'http://127.0.0.1:3101',
          changeOrigin: true,
          proxyTimeout: 10_000,
          headers: { Authorization: `Bearer ${token}` },
        },
      } : undefined,
    },
  }
})
