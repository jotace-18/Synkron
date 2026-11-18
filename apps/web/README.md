# Frontend de Synkron

Aplicación React y TypeScript creada con Vite. Actualmente muestra la pantalla
inicial de Synkron; el acceso, la consulta de actividades y el calendario todavía
están pendientes de conexión.

Desde la raíz del repositorio, instala y arranca el entorno de desarrollo:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Vite muestra la dirección local, normalmente `http://127.0.0.1:5173`.

Para comprobar el código y compilar:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run build
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
Sync. El formulario de acceso y las vistas de actividades y calendario todavía
están pendientes. Para usar las próximas funciones con sesión, accede por esa
entrada HTTPS e importa su certificado local en el navegador.
