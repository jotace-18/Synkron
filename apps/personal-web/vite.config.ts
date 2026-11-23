import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const personalOrigin: Plugin = {
  name: "personal-source-origin",
  configureServer(server) {
    const origins = new Set(["http://127.0.0.1:5176", "http://localhost:5176"]);
    server.middlewares.use((request, response, next) => {
      if (!/^\/api\/v1\/events(?:\/|\?|$)/.test(request.url ?? ""))
        return next();
      const origin = request.headers.origin;
      const write = !["GET", "HEAD", "OPTIONS"].includes(
        request.method ?? "GET",
      );
      if ((origin && !origins.has(origin)) || (write && !origin)) {
        response.statusCode = 403;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ message: "Origen no permitido" }));
        return;
      }
      next();
    });
  },
};

export default defineConfig(({ command, mode, isPreview }) => {
  const developing = command === "serve" && !isPreview;
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  // This value is read only by the local development server, never by the build.
  const token = developing
    ? loadEnv(mode, repoRoot, "PERSONAL_DEMO_TOKEN").PERSONAL_DEMO_TOKEN
    : undefined;

  if (developing && !token) {
    throw new Error(
      "Falta PERSONAL_DEMO_TOKEN en el .env de la raíz de Synkron.",
    );
  }

  return {
    plugins: [react(), personalOrigin],
    server: {
      host: "127.0.0.1",
      port: 5176,
      strictPort: true,
      cors: false,
      proxy: developing
        ? {
            "/api/v1/events": {
              target: "http://127.0.0.1:3106",
              changeOrigin: true,
              proxyTimeout: 10_000,
              headers: { Authorization: `Bearer ${token}` },
              configure(proxy) {
                proxy.on("proxyReq", (request) => {
                  request.removeHeader("Cookie");
                  request.setHeader("Authorization", `Bearer ${token}`);
                });
              },
            },
          }
        : undefined,
    },
  };
});
