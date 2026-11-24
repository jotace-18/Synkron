# Cuentas personales y conexión con Synkron

Campus, Sport y Otros tienen registro y sesión propios. Cada cuenta mantiene sus
actividades; no se vinculan cuentas por coincidencia de correo. La sesión central
de Synkron es independiente. El flujo común es:

1. Crear una cuenta en la fuente e iniciar sesión (contraseña de 8–128 caracteres).
2. Crear allí actividades; una cuenta nueva empieza vacía.
3. Pulsar **Acceso de Synkron**, crear una credencial con nombre y copiarla.
4. En la cuenta central, desplegar **Conectar una fuente externa**, elegir el bloque
   y pegar la credencial. Académico registra entregas y exámenes con el mismo token.
5. Pulsar Sincronizar todo. Solo se incorporan datos accesibles con esas credenciales.

## Activar esta versión sobre una instalación existente

Las migraciones son aditivas: no borran las cuentas demo ni sus actividades. Antes
de arrancar la versión nueva, detener los procesos de las fuentes y sus interfaces:

```bash
docker compose stop academic sport personal academic-web sport-web personal-web

docker compose up -d --wait academic-db sport-db personal-db

docker compose -f compose.yaml -f compose.migrations.yaml build academic sport personal

(
  set -e
  for service in academic sport personal; do
    docker compose -f compose.yaml -f compose.migrations.yaml run --rm --no-deps "$service"
  done
)

docker compose up -d --build --wait academic sport personal \
  academic-web sport-web personal-web sync web gateway
```

Se aplican `academic/005_source_identity.sql`, `sport/003_source_identity.sql` y
`personal/003_source_identity.sql`. Recarga las cuatro interfaces con Ctrl+Shift+R.
No hace falta instalar paquetes adicionales ni cambiar el `.env` local existente:
Compose usa el `CSRF_SECRET` configurado y valores de origen locales por defecto.

Las interfaces dejan de inyectar los tokens demo. Sus datos y conexiones existentes
siguen siendo válidos mediante la API Bearer; no se transfieren automáticamente a
una cuenta nueva. Para separar tus datos personales de la demostración, crea una
cuenta nueva en Synkron y cuentas nuevas en las tres fuentes, y conéctalas entre sí.

## Sesiones y credenciales

- Contraseñas con scrypt, sal aleatoria de 16 bytes, N=16384, r=8, p=1 y clave de
  64 bytes. No se guardan ni devuelven contraseñas legibles.
- Cookies HttpOnly y SameSite=Strict, con nombre distinto por fuente. La sesión
  tiene 30 minutos de inactividad y 12 horas de duración absoluta. Login renueva
  la sesión; logout invalida su hash en PostgreSQL.
- Cada escritura con sesión verifica el origen y un CSRF firmado, ligado a la
  sesión de esa fuente. Login y registro también requieren origen y CSRF.
- Límites atómicos en PostgreSQL por ventana de 15 minutos: registro 20 por IP,
  login 100 por IP y 5 por correo. Login correcto limpia el límite de ese correo.
  Los proxies locales agrupan las IP de acceso; estos límites son iniciales para
  la demostración y deben adaptarse al proxy de despliegue.
- Tokens de integración aleatorios de 32 bytes, mostrados una sola vez, guardados
  como SHA-256 y listados solo con nombre, sufijo, fechas y estado de revocación.
  Permiten lectura, nunca creación, edición o retirada. Una sesión del navegador
  no sirve para exportar datos: las exportaciones requieren Bearer explícito.
- Revocar un token no cambia la contraseña, no borra actividades y no cierra la
  sesión. Las lecturas siguientes con ese token fallan. Los tokens demo anteriores
  mantienen su comportamiento por compatibilidad, pero ya no los usan las interfaces.

El acceso inicial mediante credenciales se realiza con posesión del correo y la
contraseña elegida; esta versión no verifica el correo ni envía recuperación de
contraseña. No hay inicio de sesión único entre las cuatro aplicaciones.

## API pública de cada fuente

Prefijo `/api/v1/auth`, documentado en el selector correspondiente de Swagger:

| Método | Ruta | Función |
|---|---|---|
| GET | `/csrf` | Obtener CSRF y su cookie. |
| POST | `/register` | Registro; 201, no inicia sesión. |
| POST | `/login` | Acceso; 200 y cookie de sesión. |
| GET | `/session` | Cuenta actual; 401 si no hay sesión válida. |
| POST | `/logout` | Cierre; 204. |
| GET | `/tokens` | Listar las credenciales propias sin su valor secreto. |
| POST | `/tokens` | Crear una credencial de lectura; 201 con el token una vez. |
| DELETE | `/tokens/{id}` | Revocar una credencial propia; 204, ajena/inexistente 404. |

Una petición de CRUD de fuente puede usar su sesión o una credencial antigua de
API. Una credencial nueva de conexión solo permite GET/HEAD. No basta con poseer
un ID ajeno para acceder o revocar recursos.

## Despliegue HTTPS

En local se sirven las fuentes por HTTP en localhost. Configura
`SOURCE_COOKIE_SECURE=true` al desplegarlas por HTTPS y define los orígenes reales
en `ACADEMIC_APP_ORIGINS`, `SPORT_APP_ORIGINS` y `PERSONAL_APP_ORIGINS` (lista de
orígenes exactos separados por comas). Los servidores de desarrollo tienen puertos
5174, 5175 y 5176, incluidos en los valores locales por defecto. No añadas dominios
arbitrarios ni uses esos valores locales como configuración de producción.

Para conectar las fuentes desplegadas, sus URL deben ser accesibles desde Sync y
estar autorizadas en `SYNC_ALLOWED_CONNECTION_ORIGINS`. Los presets incluidos
usan los nombres internos de los servicios de este Compose. El dominio público de
cada interfaz puede ser distinto de la URL interna de su backend.

## Comprobaciones

Las pruebas unitarias cubren contraseñas, CSRF, exportaciones exclusivas por Bearer
(incluida la ruta con barra final) y políticas de escritura. Los tests existentes
mantienen validación de datos y contratos Swagger. Las pruebas de navegador
simuladas comprueban cookies, renovación de CSRF y ausencia de reintento de una
escritura incierta.

Cada backend incluye `test/source-identity.e2e-spec.ts`: dos cuentas separadas,
registro/login, CSRF, privacidad de datos y credenciales, lectura mediante token,
rechazo de escritura, revocación, logout y caducidad. Se ejecutan en CI con
PostgreSQL. Para repetirlas en los contenedores, después de las migraciones:

```bash
(
  set -e
  for service in academic sport personal; do
    docker compose -f compose.yaml -f compose.migrations.yaml run --rm --no-deps \
      --volume "$PWD/apps/$service/test:/app/test:ro" \
      "$service" npm run test:e2e -- --runInBand source-identity.e2e-spec.ts
  done
)
```

Estas pruebas crean y eliminan sus propios registros. No sustituyen la revisión
desde el navegador: crear dos cuentas, comprobar listas vacías ajenas, generar un
token, conectarlo en Synkron, sincronizar y revocarlo para comprobar la siguiente
lectura. La validación local de código no acredita haber probado ese recorrido
real en los contenedores.
