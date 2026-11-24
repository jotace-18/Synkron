import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true, cors: false,
    proxy: {'/api/v1': {target: 'http://127.0.0.1:3101', changeOrigin: true, proxyTimeout: 10000,
      configure(proxy) {proxy.on('proxyReq', request => request.removeHeader('Authorization'));}
    }}
  }
});
