# Frontend de Synkron

Aplicación React y TypeScript creada con Vite. Actualmente muestra la pantalla
inicial de Synkron con inicio y cierre de sesión, restauración al recargar y
mensajes de error. Las vistas de actividades y calendario siguen pendientes.

Desde la raíz del repositorio, instala y arranca el entorno de desarrollo:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Vite permite revisar la presentación; muestra la dirección local, normalmente `http://127.0.0.1:5173`.

Para comprobar el código y compilar:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run build
npm --prefix apps/web test
```

La compilación genera los archivos estáticos en `dist`. La imagen Docker utiliza
Node para compilarlos y Nginx para servirlos como usuario sin privilegios.

Con la configuración local del proyecto preparada, arranca el contenedor:

```bash
docker compose up -d --build --wait web
```

La pantalla está disponible en `http://127.0.0.1:3102` y el estado del servidor en
`http://127.0.0.1:3102/healthz`. CI comprueba ESLint, compilación, Dockerfile y
construcción de la imagen.

La [entrada HTTPS común](../../infra/gateway/README.md) ya permite abrir la misma
pantalla en `https://localhost:8443` y encamina las peticiones de autenticación y
Sync. Para probar el acceso, utiliza esa entrada e importa su certificado local
en el navegador. El servidor de desarrollo de Vite todavía no tiene proxy API.

Para levantar los servicios de acceso y actualizar el frontend:

    docker compose up -d --wait gateway
    docker compose up -d --build --wait web

El navegador gestiona la cookie HttpOnly; React conserva la información pública
de sesión en memoria y la recupera con GET /api/v1/auth/session al recargar.
Cada acceso o cierre obtiene previamente un token CSRF nuevo. Los errores de
credenciales y los fallos de conexión se muestran en la interfaz.

Las tres pruebas del cliente usan el runner integrado de Node 24 y simulan fetch.
Comprueban sesión ausente frente a dependencia caída, renovación de CSRF entre
acceso y cierre, respuesta vacía de logout y errores de acceso. También se han
verificado en Firefox por HTTPS el error de contraseña, el acceso correcto, la
persistencia al recargar, el cierre y la ausencia de sesión tras otra recarga.
El formulario de registro todavía está pendiente; el registro existe en la API.
