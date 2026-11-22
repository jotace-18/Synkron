# API

El panel se comunicará con Synkron mediante esta API. Las rutas empiezan por `/api/v1` y los datos usan JSON. El acceso identifica a la cuenta y limita lo que puede consultar o modificar.

Los identificadores y direcciones de este documento son ficticios.

## Swagger y documentos OpenAPI

El portal `https://localhost:8443/api/docs` reúne los contratos públicos de
Cuentas, Sync, Automation, Monitoring y Academic mediante un selector. Incluye
parámetros, cuerpos, respuestas, errores y ejemplos de las 50 operaciones
implementadas, con sus permisos reales. La [guía de Swagger](swagger.md) detalla
el arranque, la autenticación y la descarga de cada documento. Las rutas internas
quedan fuera de estos contratos y bloqueadas en el gateway.

## Estado del contrato

Están disponibles las rutas de autenticación de la API, la creación, listado
paginado y prueba de conexiones en Sync, la creación de definiciones de
sincronización, la solicitud y consulta de ejecuciones, el listado y detalle
de actividades centralizadas y la API de entregas de académico. También están
disponibles programaciones, reglas, recordatorios, historial de Automation,
consultas de Monitoring y avisos. La
[entrada HTTPS local](../infra/gateway/README.md) sirve el frontend en
`https://localhost:8443` y encamina `/api/v1/auth/...` a la API de cuentas,
`/api/v1/automation/...` a Automation, `/api/v1/monitoring/...` y
`/api/v1/notifications/...` a Monitoring y el resto de `/api/...` a Sync.
Las rutas `/internal/...` quedan bloqueadas en esa
entrada. En local se mantienen los puertos directos de API (3002), Sync (3001)
y académico (3101) para comprobaciones. El calendario y los recorridos de entregas y exámenes
están implementados. La guía de puesta en marcha y validación de exámenes está en
[Exámenes](examenes.md). Las operaciones indicadas como previstas en este documento son diseño
y todavía no están implementadas.

El destino inicial de una sincronización es la colección de actividades de Sync.
Las tres fuentes se describen en [Servicios de origen](servicios-origen.md). Sus
contratos de entrada son distintos de la representación común y de la vista.

## Entrada estandarizada disponible

Sync incorpora administración de fuentes en `/api/v1/ingestion-sources`, recepción
Bearer en `POST /api/v1/ingestions` y resultados en `GET /api/v1/ingestions/{id}`.
La administración requiere sesión y CSRF; cada fuente tiene una credencial de
entrada propia, con pausa, rotación y revocación. El `202` confirma persistencia
del trabajo, y `Idempotency-Key` permite reintentar sin crear otra ejecución.

La [guía de entrada estandarizada](entrada-estandarizada.md) incluye contratos,
límites, migración 013 y prueba completa. Swagger UI está disponible en
`/api/docs` y el documento OpenAPI en `/api/docs/openapi.json`, a través del
mismo gateway. El selector permite consultar también las API de los demás módulos; las rutas
internas quedan excluidas.

## Servicio académico de origen

El backend académico se accede en local por `http://127.0.0.1:3101`, con una
credencial Bearer propia de la cuenta académica. Su colección `/api/v1/assignments`
admite creación y listado, detalle y edición por ID y borrado lógico. La ruta
`GET /api/v1/assignments/export` devuelve un array paginado que incluye registros
eliminados con `deleted_at`, para que Sync pueda reconocer su retirada. El
[contrato de entregas](../apps/academic/README.md) detalla campos, permisos,
paginación, actualizaciones parciales y preparación local. Sync ya importa esos cambios en segundo plano a su colección central; la consulta
autenticada de actividades y el calendario ya están disponibles.

### Contrato de exámenes

El recurso de origen es `/api/v1/exams` en el servicio académico, con la misma
autenticación Bearer y cuenta que las entregas. Estas rutas están implementadas en Academic; no se exponen como recursos de escritura de Sync.

| Método | Ruta de Academic | Resultado acordado |
|---|---|---|
| POST | `/api/v1/exams` | `201`, examen creado. |
| GET | `/api/v1/exams` | `200`, página de exámenes propios no retirados. |
| GET | `/api/v1/exams/export` | `200`, página propia que incluye marcas de retirada. |
| GET | `/api/v1/exams/{id}` | `200`, examen propio no retirado. |
| PATCH | `/api/v1/exams/{id}` | `200`, edición parcial con validación del estado final. |
| DELETE | `/api/v1/exams/{id}` | `204`, retirada lógica; repetir conserva la primera marca. |

Campos de creación y edición:

| Campo | Contrato |
|---|---|
| `title` | Texto obligatorio, de 1 a 200 caracteres. |
| `course_name` | Texto obligatorio, de 1 a 150 caracteres. |
| `course_abbreviation` | Texto opcional, de 1 a 20 caracteres, o `null`. Campus lo obtiene del selector de asignaturas. |
| `topics` | Texto libre opcional, de 1 a 1000 caracteres, o `null`. |
| `section` | Obligatorio: `theory` o `practice`. |
| `exam_date` | Día `YYYY-MM-DD` sin hora, o `null` cuando se usa `exam_at`. |
| `exam_at` | Instante ISO 8601 con `Z` o desplazamiento explícito, o `null` cuando se usa `exam_date`. |
| `status` | `scheduled`, `completed` o `cancelled`. Por defecto, `scheduled`. |
| `weight_percent` | Número finito entre 0 y 100, opcional. |
| `weight_basis` | `course` o `section`, obligatorio cuando existe porcentaje; ambos campos nulos para omitir ponderación. |
| `grade` | Número finito entre 0 y 10, con hasta dos decimales, o `null`. |

Los textos se recortan y, cuando se proporcionan, no pueden quedar vacíos. Los
textos opcionales y datos de evaluación omitidos en creación se guardan como
`null`; el estado omitido toma el valor `scheduled`. Campos ajenos al
contrato, `account_id`, IDs o fechas técnicas aportados en el cuerpo se rechazan
con `422`. La cuenta procede exclusivamente de la credencial verificada.

En Campus se elige siempre una fecha y, opcionalmente, una hora de Madrid. En la
API se exige exactamente uno entre `exam_date` y `exam_at`; el segundo ya incluye
el día. Se admiten fechas reales de los años 0001 a 9999, pasadas o futuras,
sin fabricar una hora para los registros que no la tienen. Los instantes se
normalizan a UTC y se devuelven con `Z`.

Ejemplo de creación sin hora:

```json
{
  "title": "Parcial de CC",
  "course_name": "Cloud Computing",
  "course_abbreviation": "CC",
  "topics": "Temas 1 a 3",
  "section": "theory",
  "exam_date": "2026-12-02",
  "exam_at": null,
  "status": "scheduled",
  "weight_percent": 25,
  "weight_basis": "course",
  "grade": null
}
```

Las respuestas añaden `id`, `created_at`, `updated_at` y `deleted_at`, y devuelven
los campos opcionales ausentes como `null`; no incluyen credenciales ni
`account_id`. La exportación mantiene la misma forma y añade los registros con
`deleted_at` informado. Los listados usan `limit` entre 1 y 50 (20 por defecto)
y `offset` desde 0, con orden `created_at DESC, id DESC` y filtro por cuenta antes
de paginar. No mantienen una instantánea entre páginas.

En `PATCH`, omitir un campo conserva su valor y `null` vacía solo los campos
opcionales. El cuerpo vacío o una combinación final inválida produce `422`.
Cambiar de formato temporal requiere poner a `null` el campo anterior:

```json
{
  "exam_date": null,
  "exam_at": "2026-12-02T09:00:00+01:00"
}
```

Eliminar una ponderación requiere enviar ambos campos a `null`. La validación
final y la escritura son atómicas. Repetir los mismos valores conserva
`updated_at`; modificar datos conserva `id` y `created_at`. Actualizar una nota
no cambia automáticamente el estado del examen.

Una credencial inválida devuelve `401`. Un ID ausente, ajeno o retirado devuelve
el mismo `404` en detalle y edición. La retirada de un examen propio ya retirado
vuelve a devolver `204`, conservando la primera fecha de borrado. `cancelled`
conserva un registro visible y no equivale a `deleted_at`.

El mapeo al calendario se define en el
[contrato de exámenes del modelo común](modelo-actividades.md#contrato-de-exámenes).

## Operaciones

| Método | Ruta sin prefijo | Resultado previsto |
|---|---|---|
| GET | `/auth/csrf` | `200`, token CSRF ligado al contexto del navegador. No inicia sesión. |
| POST | `/auth/register` | `201`, cuenta sin contraseña ni hash. No inicia sesión automáticamente. |
| POST | `/auth/login` | `200`, cuenta y caducidad; crea la cookie de sesión. |
| POST | `/auth/logout` | `204`, invalida la sesión actual y elimina su cookie. |
| GET | `/auth/session` | `200`, cuenta y caducidad; `401` si no hay sesión válida. |
| GET / POST | `/connections` | `200` listado / `201` conexión. |
| GET / PATCH | `/connections/{id}` | `200` detalle o cambio. |
| POST | `/connections/{id}/test` | `200` resultado de prueba acotada. |
| POST | `/sync-definitions` | `201`, definición creada; disponible. |
| GET | `/sync-definitions` | `200`, listado propio paginado; disponible. |
| GET / PATCH | `/sync-definitions/{id}` | `200` detalle o cambio. |
| POST | `/sync-definitions/{id}/runs` | `202`, ejecución pendiente y `Location`; disponible. |
| GET | `/sync-runs/{id}` | `200`, estado guardado por Sync; disponible. |
| GET | `/activities` | `200`, listado autenticado, filtrado y paginado; disponible. |
| GET | `/activities/{id}` | `200`, detalle propio y activo con procedencia; disponible. |
| GET / POST | `/automation/schedules` | `200` listado / `201` programación. |
| GET / PUT | `/automation/schedules/{id}` | `200` detalle o actualización completa. |
| GET / POST | `/automation/rules` | `200` listado / `201` regla. |
| GET / PUT | `/automation/rules/{id}` | `200` detalle o actualización completa. |
| GET / PUT | `/automation/reminders/settings` | `200`, configuración de recordatorios. |
| GET | `/automation/history` | `200`, historial propio de solicitudes y acciones. |
| GET | `/activity` | `200`, actividad, que puede tardar en reflejar un cambio. |
| GET | `/usage` | `200`, agregados por periodo. |
| GET | `/notifications` | `200`, notificaciones del usuario. |
| GET | `/notifications/unread-count` | `200`, contador de no leídos. |
| PATCH | `/notifications/{id}/read` | `200`, aviso leído; cuerpo `{}`. |

`Location` indica la dirección donde consultar el recurso creado. Los listados tendrán páginas; el historial se podrá filtrar por tipo, estado y fechas con `type`, `status`, `from` y `to`. Los instantes con hora se guardarán en UTC y se mostrarán en la zona del usuario; una fecha sin hora conservará su significado de día, sin inventar una hora.

Cada servicio tendrá además `/healthz` para comprobar su funcionamiento.

El listado de conexiones acepta `GET /api/v1/connections?limit=20&offset=0`.
`limit` es un entero entre 1 y 50 (20 por defecto); `offset` es un entero entre
0 y 9007199254740991 (0 por defecto). Devuelve un array ordenado por
`created_at DESC, id DESC`, filtrado siempre por el propietario autenticado
antes de aplicar la paginación. Un desplazamiento posterior al último resultado
devuelve `[]`. Parámetros inválidos o desconocidos, incluido `tenant_id`, producen
`422`. El cliente solicita la siguiente página incrementando `offset` en `limit`;
una página con menos resultados que `limit` indica el final en esa consulta.
La paginación no mantiene una instantánea entre peticiones: crear o eliminar
conexiones mientras se recorren las páginas puede desplazar los resultados.

## Cuentas y sesiones

El registro recibe `email` y `password`. El correo debe ser único y la contraseña se guarda mediante Argon2id. El inicio de sesión recibe los mismos campos y, si son correctos, devuelve la cuenta y la fecha límite de la sesión:

```json
{
  "user": {"id": "44444444-4444-4444-8444-444444444444", "email": "persona@example.com"},
  "expires_at": "2026-10-21T02:00:00Z"
}
```

El identificador secreto se envía solo en `Set-Cookie`, no dentro del JSON. La cookie se llama `__Host-synkron_session`, usa `Path=/`, no define `Domain` y lleva `Secure`, `HttpOnly` y `SameSite=Lax`. El navegador la envía en las siguientes peticiones al mismo origen. No se guarda una credencial de acceso en `localStorage` ni se utiliza un JWT para la sesión del panel.

La sesión tiene un límite de 30 minutos sin actividad y 12 horas desde su creación. `expires_at` indica el vencimiento efectivo al responder, sujeto a invalidación anterior por cierre de sesión. `POST /auth/logout` recibe `{}`, invalida la sesión en PostgreSQL y elimina la cookie. Repetir el cierre devuelve `204` si la comprobación de origen y CSRF es válida, aunque ya no exista una sesión autenticada. `GET /auth/session` devuelve la misma estructura de cuenta y caducidad que el acceso.

Antes del registro o del acceso, el panel obtiene `GET /auth/csrf`, que devuelve `{"csrf_token":"valor-aleatorio"}` y establece un contexto previo sin autenticar. Las peticiones `POST`, `PUT`, `PATCH` y `DELETE` del navegador envían ese valor en `X-CSRF-Token`; el servidor comprueba también el origen. Al iniciar o cerrar sesión se renuevan el contexto y el token. El contexto previo no permite acceder a datos personales ni se convierte en una sesión autenticada sin regenerar su identificador.

Para el registro, este contexto se identifica mediante `__Host-synkron_context` y el token firmado se acompaña de la cookie `__Host-synkron_csrf`. Ambas cookies usan `Secure`, `HttpOnly`, `SameSite=Lax` y `Path=/`, sin `Domain`. La firma liga el token al contexto del navegador y utiliza `CSRF_SECRET`, configurado únicamente en el servidor. Cada consulta de `/auth/csrf` renueva ambas cookies y devuelve el nuevo token con `Cache-Control: no-store`. La cabecera `X-CSRF-Token` debe coincidir con el token de la cookie y su firma debe ser válida para ese contexto. Este mecanismo previo no inicia sesión.

Las sesiones se guardan en `auth.sessions`. El servidor genera un identificador aleatorio nuevo en cada acceso y conserva únicamente su hash SHA-256; el valor original solo se entrega en la cookie. Al iniciar sesión de nuevo desde un navegador que presenta una sesión anterior, se revoca esa sesión y se crea otra. Consultar `/auth/session` actualiza la última actividad sin ampliar el vencimiento absoluto. El cierre revoca la sesión en PostgreSQL, por lo que volver a enviar su cookie anterior no recupera acceso.

El token CSRF de un navegador autenticado queda ligado también a su cookie de sesión. Login y logout renuevan el contexto y las cookies CSRF; el cliente vuelve a obtener `/auth/csrf` antes de la siguiente operación que modifique datos. Este flujo conserva las cookies protegidas y requiere HTTPS para su uso desde el navegador; las pruebas locales reenvían las cookies explícitamente.

Los intentos de inicio de sesión se cuentan en PostgreSQL por correo normalizado y por dirección IP, mediante referencias con hash. Los límites iniciales son 5 por cuenta y 30 por IP en una ventana de 15 minutos; cuentan tanto los accesos correctos como los fallidos. Se configuran con `AUTH_LOGIN_MAX_ATTEMPTS_PER_ACCOUNT`, `AUTH_LOGIN_MAX_ATTEMPTS_PER_IP` y `AUTH_LOGIN_WINDOW_MINUTES`. Al agotarse un límite se devuelve `429` con `Retry-After` en segundos; los contadores caducados se eliminan al recibir nuevas solicitudes. La IP procede de la conexión que ve Express, sin confiar libremente en una cabecera enviada por el cliente.

Las rutas de CSRF, registro e inicio de sesión no requieren una sesión autenticada. El resto de rutas de datos sí la requieren. Sin sesión válida se devuelve `401`; un recurso ajeno devuelve `404` y una comprobación CSRF fallida, `403`. Una contraseña incorrecta y un correo inexistente producen el mismo error de acceso. Al superar el límite de intentos se responde `429` con `Retry-After`.

Cada servicio debe verificar la sesión mediante el componente de acceso y comprobar a quién pertenece el recurso. API y Sync ya utilizan esta comunicación interna. No es una ruta pública de `/api/v1` y no acepta un propietario elegido por el cliente. Las contraseñas, cookies y tokens CSRF no se incluyen en los registros técnicos.

En la entrada interna de API, sin publicación del puerto 3003 en el host,
`GET /internal/auth/session` verifica el servicio y la sesión. Su variante `POST`
comprueba además origen y CSRF para autorizar escrituras. Devuelve solo `tenant_id`
y `expires_at`. Sync utiliza `SYNC_AUTH_SERVICE_TOKEN` para identificarse; esa
credencial no se entrega al frontend. Los demás servicios aún deben incorporar
su autorización al implementarse.

## Datos que se envían

Creación de conexión, `POST /api/v1/connections`:

```json
{
  "name": "Mis tareas",
  "base_url": "https://tasks.example.com",
  "auth": {"type": "bearer", "token": "token-ficticio-de-ejemplo"},
  "enabled": true
}
```

La respuesta muestra nombre, dirección sin datos sensibles, identificador, tipo de acceso y estado. `has_credentials` indica si hay credenciales guardadas; su contenido no se devuelve. La dirección se revisa al guardar y al conectar.

Se admiten `auth: {"type":"none"}` y `auth: {"type":"bearer","token":"..."}`.
Un token Bearer debe tener entre 1 y 4096 caracteres y seguir la sintaxis de
[RFC 6750, sección 2.1](https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1).
No se recorta ni transforma. Credenciales ausentes, inválidas o campos adicionales
producen `422`; `none` no admite un campo `token`.

Sync guarda las credenciales Bearer cifradas con AES-256-GCM. Cada cifrado usa un
IV aleatorio de 12 bytes y una etiqueta de autenticidad de 16 bytes, y queda ligado
al propietario y al identificador de la conexión mediante datos autenticados.
La columna `credentials_encrypted` contiene `v1.iv.tag.ciphertext`, con sus tres
componentes binarios codificados en hexadecimal. La clave de 32 bytes se configura
como 64 caracteres hexadecimales en `SYNC_CREDENTIALS_KEY`, únicamente en Sync;
no se almacena en PostgreSQL. Cambiar o perder esa clave impide descifrar los
valores existentes. Crear o listar una conexión no devuelve el token ni el cifrado
y no realiza todavía peticiones a la aplicación externa.

Prueba de conexión: `POST /api/v1/connections/{id}/test`, con cuerpo `{}`, sesión,
origen y CSRF válidos. Hace un `GET` a la URL guardada, incluida su ruta; para la
API ficticia se utiliza `http://task-api:3000/tasks`. La conexión debe pertenecer
a la cuenta; una conexión ajena o inexistente produce el mismo `404`, y un UUID
inválido produce `422`. No se aceptan direcciones alternativas en el cuerpo:
el destino procede siempre de la conexión guardada.

La prueba devuelve `200` con `{"ok":true,"status_code":200,"error":null}` si el
destino responde correctamente. Los fallos externos también devuelven `200`,
con `ok:false` y `error` igual a `http_error`, `network_error`, `timeout`,
`redirect_not_allowed` o `response_too_large`. `status_code` contiene el estado
HTTP externo si se recibió, o `null` si no llegó. El cuerpo externo y las
credenciales no se incluyen en el resultado.

Solo se consultan los orígenes expresamente configurados en
`SYNC_ALLOWED_CONNECTION_ORIGINS` (separados por comas, sin rutas, credenciales,
query ni fragmentos). En el entorno local se autoriza `http://task-api:3000`;
esta configuración está pensada para servicios controlados en la red de Docker.
Los destinos no autorizados, o las URLs con credenciales, query o fragmentos,
se rechazan con `403` antes de hacer la petición externa. Las redirecciones no
se siguen. El límite de espera es de 3 segundos y el de respuesta es de 64 KiB,
contados durante la lectura, también cuando no hay `Content-Length` fiable.
Una credencial que no puede descifrarse produce `503` sin contactar con el destino.
El resultado se devuelve en esta petición; guardar la última prueba queda pendiente.

Listado de sincronizaciones, `GET /api/v1/sync-definitions` (disponible):

Requiere sesión y devuelve únicamente definiciones de la cuenta verificada, sin
credenciales ni propietario en la respuesta. Admite `limit` entre 1 y 50 (20 por
defecto) y `offset` entero no negativo (0 por defecto). El orden es `created_at`
ascendente e `id` ascendente. Incluye alternativas deshabilitadas; la interfaz
solo permite solicitar ejecuciones de las habilitadas. Devuelve `Cache-Control:
no-store`; una sesión ausente produce `401` y una paginación inválida, `422`.

Creación de sincronización, `POST /api/v1/sync-definitions` (disponible):

```json
{
  "name": "Centralizar entregas académicas",
  "source_connection_id": "11111111-1111-4111-8111-111111111111",
  "connector": "academic.assignments",
  "enabled": true
}
```

El nombre se recorta y debe contener entre 1 y 100 caracteres. La conexión se
identifica mediante un UUID v4 y los conectores admitidos son
`academic.assignments` y `academic.exams`. `enabled` es un booleano y vale `true` si se omite.
No se convierten cadenas como `"false"` en booleanos. Se rechazan campos
adicionales, incluidos propietario, credenciales, colección y fechas técnicas.

El conector de entregas utiliza la colección `assignments` y el tipo
`academic.assignment`; el de exámenes utiliza `exams` y `academic.exam`. La URL de exportación y la credencial proceden de la
conexión guardada. El modelo de destino se concreta en
[Modelo de actividades](modelo-actividades.md). La configuración de
correspondencias personalizadas y los demás conectores siguen pendientes.
El servicio comprueba la existencia y propiedad de la conexión y exige que esté
habilitada y tenga configurada una credencial Bearer. No realiza una petición al
origen al crear la definición. Un recurso inexistente o ajeno produce `404`, una
conexión deshabilitada produce `409` y una autenticación incompatible, `400`.
La comprobación y la creación usan una transacción. El propietario y la colección
se fijan en el servidor; la respuesta no incluye propietario ni credenciales.
Dos definiciones activas para la misma conexión y colección producen `409`.
Se permiten alternativas deshabilitadas sin sustituir la definición activa.

La ruta requiere sesión, origen permitido y token CSRF. Devuelve `201` con los
campos públicos de la definición y `Cache-Control: no-store`. Las fechas se
serializan en formato ISO. Los cuerpos inválidos o con campos adicionales
producen `422`. Esta operación guarda la configuración; no inicia una ejecución.
La creación y el rechazo de un duplicado se han comprobado por HTTP con la
sesión real y la conexión académica guardada. El listado, detalle y edición de
definiciones siguen pendientes.

El propietario se obtiene de la sesión comprobada y la procedencia de la conexión
y colección configuradas. La ruta de lectura debe conservar el origen autorizado;
la configuración no puede convertirla en una llamada a otro servidor. Al
reimportar un recurso se actualiza su actividad central, sin duplicarla.

## Consulta de actividades centralizadas

`GET /api/v1/activities` devuelve un array de actividades activas del propietario
autenticado. `GET /api/v1/activities/{id}` devuelve una actividad con el mismo
formato público. Un ID inexistente, ajeno o retirado devuelve `404`; una petición
sin sesión válida devuelve `401`. Un ID que no sea UUID v4 produce `422`. Ambas rutas usan
`Cache-Control: no-store`.

El tipo público es `ActivityView`, definido en
`apps/sync/src/activities/activity-view.types.ts`: contiene los campos de
`ActivityInput` más `id`, `created_at`, `updated_at` y `last_synced_at`. Las fechas
técnicas y `source_updated_at`, cuando se conozca, se devuelven como cadenas ISO
UTC. Los detalles son los datos autorizados que Sync ya ha normalizado.

Las pruebas con PostgreSQL cubren permisos, exclusión de retiradas, filtros antes
de paginar, orden estable, límites temporales y días de 23 y 25 horas. Las pruebas
HTTP usan el guard y la validación reales y simulan únicamente la comprobación
interna de sesión. También se han consultado listado y detalle con una sesión
real en el entorno local.

### Parámetros del listado

| Parámetro | Contrato |
| --- | --- |
| `limit` | Entero entre 1 y 50; por defecto 20. |
| `offset` | Entero entre 0 y 9007199254740991; por defecto 0. |
| `type` | Opcional; uno de los tipos de `ActivityType`, con coincidencia exacta. |
| `source_connection_id` | UUID opcional de la conexión de origen. Una conexión inexistente o ajena no produce coincidencias. |
| `from` | Fecha real `YYYY-MM-DD`, inicio incluido del periodo. Se envía junto a `to`. |
| `to` | Fecha real `YYYY-MM-DD`, final excluido. Debe ser posterior a `from`. |
| `timezone` | Zona horaria IANA válida; por defecto `Europe/Madrid`. Se usa para interpretar los días del calendario y ordenar. |

Ejemplo para consultar noviembre:

```http
GET /api/v1/activities?from=2026-11-01&to=2026-12-01&timezone=Europe%2FMadrid&type=academic.assignment&limit=20&offset=0
```

Sin `from` ni `to` se admite el listado paginado sin restricción temporal. Enviar
solo uno, usar un periodo vacío o invertido, o parámetros desconocidos o inválidos
produce `422`. El cliente no puede seleccionar propietario ni solicitar registros
retirados mediante parámetros adicionales.

El filtrado por propietario, retirada, periodo, tipo y conexión se aplica antes
de paginar. El orden es ascendente por día de inicio o vencimiento en la zona
solicitada; dentro del día, primero las actividades sin hora y después las que
tienen hora, ordenadas por su instante real de inicio o vencimiento. `id ASC`
desempata. No se inventa una hora pública para ordenar las fechas sin hora. Una
página fuera del resultado devuelve `[]`. Como en conexiones, la paginación con
`offset` no mantiene una instantánea entre peticiones; las sincronizaciones
concurrentes pueden desplazar resultados.

### Selección temporal

- `kind: date`: `from <= schedule.date < to`, sin desplazar el día por la zona.
- `kind: instant`: el instante pertenece al periodo entre el comienzo del día
  `from` y el comienzo del día `to` en `timezone`.
- `kind: interval`: el intervalo se solapa con ese periodo. Se incluye si
  `at < fin_del_periodo` y `end_at > inicio_del_periodo`; tocar únicamente un
  límite no cuenta como solapamiento.

Los límites de cada día se convierten mediante la zona horaria, respetando los
cambios de horario estacional; no se presupone que todos los días duren 24 horas.
Un intervalo solapado conserva sus fechas reales, sin recortarlas al periodo.

Las actividades devolverán `schedule` con `kind`, `role`, `date`, `at` y `end_at`.
Una fecha sin hora usa `kind:date`; un instante conocido usa `kind:instant`; un
intervalo con final conocido usa `kind:interval`. Los campos no aplicables son
`null`, los instantes se devuelven en UTC y las fechas sin hora no se convierten
en medianoche. `tenant_id` y `content_hash` son internos y no se exponen.

La colección pertenece a Sync. `/activities` no es `/activity`: esta última ruta
representa el historial de cambios y operaciones de Monitoring. El calendario
consulta lo ya sincronizado y no vuelve a leer todas las fuentes al abrirse.
El cliente no puede elegir `tenant_id`; tampoco se exponen `deleted_at` ni credenciales.
La creación y modificación de compromisos se realizan en las fuentes. No se
define un POST/PATCH público sobre la colección central para editar el origen.

Los endpoints de creación y modificación de académico, deporte y planes son
contratos de esas fuentes, todavía por concretar. Los formularios de demostración
usarán un backend autorizado y no recibirán los secretos de sus conexiones.

## Ejecuciones: aceptación y consulta disponibles

La tabla de ejecuciones ya dispone de estados, fechas y contadores. Los estados
son `queued`, `running`, `completed` y `failed`. Los contadores distinguen registros
leídos, creados, actualizados, sin cambios, retirados e ignorados. Una ejecución
completada debe contabilizar todos los registros leídos; una fallida puede
conservar resultados parciales.

Una ejecución fallida exige `error_code` y `error_message`; los demás estados
mantienen ambos campos vacíos. Los mensajes proceden de un catálogo fijo según
el tipo de excepción: fuente, configuración, dependencia, almacenamiento o fallo
desconocido. No se copian mensajes originales, respuestas externas, sentencias
SQL ni credenciales. El procesador utiliza esa conversión al guardar un fallo.
Las rutas de solicitud y consulta, Rabbit, el publicador automático y el worker
ya están implementados para las entregas académicas.

Solicitud de ejecución: `POST /api/v1/sync-definitions/{id}/runs`, cuerpo `{}`, cabecera `Idempotency-Key: tareas-001`.

```json
{"id": "33333333-3333-4333-8333-333333333333", "status": "queued"}
```

La respuesta es `202`, con `Cache-Control: no-store` y
`Location: /api/v1/sync-runs/{id}`. Exige sesión, origen autorizado y CSRF. El
cuerpo debe ser `{}`; campos adicionales producen `422`. La clave es obligatoria,
entre 1 y 128 caracteres ASCII: empieza por letra o número y admite letras,
números, punto, guion, guion bajo y dos puntos. No se recortan espacios ni se
aceptan cabeceras combinadas. Una clave ausente o inválida produce `422`.

Misma cuenta, operación, clave y definición devuelven la ejecución existente,
incluso ante solicitudes simultáneas o si la configuración se deshabilita después
de aceptarla. La misma clave con otra definición produce `409`; una clave nueva
solicita otra ejecución. Los UUID se comparan sin distinguir mayúsculas. Se guarda
el hash SHA-256 de la clave, no el texto original. Las claves se conservan mientras
exista su ejecución; por ahora no hay caducidad ni eliminación pública de historial.

La aceptación guarda en una sola transacción la ejecución, la identidad de la
solicitud, la referencia al origen elegido (conexión, conector y colección) y una
fila pendiente en `sync.run_jobs`. Si falla cualquiera de las escrituras, no se
acepta la solicitud. Una definición inexistente o ajena produce `404`; una
definición o conexión deshabilitada produce `409`; una autenticación de origen
incompatible produce `400`. Solo se comprueba esta configuración para solicitudes
nuevas, no para recuperar una solicitud ya aceptada.

La referencia guardada evita que editar la definición redirija un trabajo ya
aceptado. No copia credenciales ni respuestas externas. El worker resuelve la
conexión de esa cuenta y el importador comprueba su disponibilidad, recupera
su credencial y aplica la política de destinos permitidos.

**Las solicitudes se publican automáticamente en Rabbit y el worker procesa
las entregas académicas hasta guardar `completed` o `failed`.** `202` confirma
aceptación duradera, no importación completada. `published_at` registra
publicación, no ejecución. El cliente consulta el resultado mediante GET.
La tabla de trabajos pendientes no es el outbox de eventos de cambios de
actividades. La migración no crea trabajos para ejecuciones históricas.

`GET /api/v1/sync-runs/{id}` exige sesión y devuelve exclusivamente el estado
persistido de una ejecución propia, con `Cache-Control: no-store`. No necesita
CSRF ni vuelve a leer la fuente. Un ID ajeno o inexistente produce el mismo `404`;
un UUID inválido produce `422`. Devuelve `id`, `definition_id`, `status`,
`created_at`, `started_at`, `finished_at`, los seis contadores y los dos campos
de error. Las fechas se serializan en ISO; las fechas todavía no disponibles y
los errores de ejecuciones que no han fallado son `null`. La consulta no incluye
propietario, hashes de idempotencia, configuración interna ni credenciales.
Repetir el POST devuelve el estado actual de la ejecución existente.

## Publicador de trabajos

Rabbit se inicia mediante el servicio `rabbitmq` de Compose. Las credenciales y
el vhost se configuran en `.env` siguiendo `.env.example`. El panel local está en
`http://127.0.0.1:15672`; el acceso AMQP entre contenedores utiliza `rabbitmq:5672`.
El broker conserva sus datos en `rabbitmq-data` con un hostname estable.

El proceso `sync-publisher` utiliza el Dockerfile y PostgreSQL de Sync. No expone
una API ni necesita otra base. Con las migraciones de Sync aplicadas, se inicia
junto con sus dependencias mediante:

```bash
docker compose up -d --build sync-publisher
docker compose logs --tail=20 sync-publisher
```

Mantiene abiertas sus conexiones, publica los trabajos de uno en uno y espera un
segundo entre consultas vacías. Selecciona por antigüedad, con el ID como segundo
criterio, y reserva cada fila mediante `FOR UPDATE SKIP LOCKED` durante la
transacción. Otro publicador puede recoger un trabajo diferente.

La cola `synkron.sync.runs.v1` es clásica, durable, no exclusiva y no se borra al
desconectar consumidores. El mensaje contiene solo `schema_version: 1`, `run_id`
y `tenant_id`. El contrato exige UUIDv4 y rechaza campos adicionales. El
publicador lo envía como JSON persistente, con `messageId` igual a `run_id`, y
comprueba las confirmaciones del broker y las devoluciones de mensajes sin ruta.
El canal se utiliza secuencialmente y la espera de confirmación está limitada a
10 segundos. Esto confirma el almacenamiento en Rabbit, no el procesamiento por el worker.

Solo después de recibir la confirmación sin devolución se actualiza
`sync.run_jobs.published_at` y se confirma la transacción. Un fallo deja el
trabajo pendiente. Si Rabbit aceptó el mensaje pero PostgreSQL no pudo guardar
esa confirmación, puede enviarse de nuevo. El worker reconoce las ejecuciones
ya terminadas y no las procesa otra vez. Las ejecuciones en curso con reserva
caducada pueden recuperarse; no se garantiza procesamiento exactamente una vez.

El proceso atiende `SIGTERM` y `SIGINT`: deja de recoger trabajo, permite terminar
la operación en curso y cierra Rabbit y PostgreSQL. Compose concede 30 segundos
para la parada y configura reinicio ante un fallo del proceso. El recorrido
HTTP a Rabbit y la parada y arranque sin republicación se han comprobado en local.
Las pruebas de PostgreSQL simulan el broker y limitan la selección a sus propias
cuentas de prueba para no marcar trabajos reales como publicados.

También hay comandos de comprobación para declarar la cola y publicar un solo
trabajo. Desde la raíz, tras compilar Sync:

```bash
docker compose run --rm --no-deps \
  --volume "$PWD/apps/sync:/app" \
  sync npm run rabbitmq:setup

docker compose run --rm --no-deps \
  --volume "$PWD/apps/sync:/app" \
  sync npm run rabbitmq:publish-one
```

Estos comandos requieren sus dependencias arrancadas; la publicación normal la
realiza `sync-publisher` sin intervención manual. Los reintentos de importaciones
que ya terminaron en `failed` y los eventos de dominio siguen pendientes.

## Worker de ejecuciones

El proceso `sync-worker` comparte el código y PostgreSQL de Sync. Usa las mismas
variables de conexión a Rabbit, la clave `SYNC_CREDENTIALS_KEY` para descifrar las
credenciales y `SYNC_ALLOWED_CONNECTION_ORIGINS` para autorizar destinos. Mantiene
un contexto de Nest y recibe mensajes sin abrir un servidor HTTP.

Para la demostración académica, con las migraciones y las credenciales del origen
ya configuradas, se arranca primero la fuente y después los procesos de Sync:

```bash
docker compose up -d --wait academic
docker compose up -d --build sync-publisher sync-worker
docker compose logs --tail=30 sync-worker
```

La recepción exige confirmación manual y limita a uno el número de mensajes sin
confirmar por consumidor. Antes de acceder a PostgreSQL valida contenido UTF-8,
JSON de hasta 1 KiB, contrato de versión e identidades, tipo `application/json` y
coincidencia entre `messageId` y `run_id`.

La toma usa una actualización condicionada por cuenta, ID y referencia de origen
válida. Puede adquirir una ejecución `queued` o recuperar una `running` cuya
reserva haya caducado. Cada adquisición genera un `claim_token` nuevo y una
reserva de 60 segundos; conserva el `started_at` original al recuperar. Solo un
worker puede adquirirla, incluso si varios lo intentan simultáneamente.

Antes de importar, el procesador comprueba su reserva. Durante el trabajo la
renueva cada 20 segundos. Si una renovación falla, solicita detener la importación
y no guarda un resultado terminal con una reserva ajena. La cancelación se
comprueba antes de cada actividad; no interrumpe una consulta ya en curso.

Las escrituras del worker bloquean la fila de ejecución dentro de la misma
transacción que guarda o retira la actividad. Después de obtener el bloqueo
comprueban cuenta, token, vigencia y conexión y colección capturadas. El bloqueo
se mantiene hasta terminar la transacción: una recuperación tiene que esperar
antes de sustituir la reserva. Las importaciones manuales anteriores conservan
su funcionamiento sin contexto de ejecución.

Al terminar se detiene y espera al renovador antes de guardar `completed`, la
fecha final y los seis contadores. Tanto `complete` como `fail` exigen el token
vigente y liberan la reserva. Un fallo de importación guarda `failed`, error
seguro y el último progreso conocido. Un fallo al persistir ese resultado deja
el mensaje sin confirmar. Los contadores corresponden al intento que los guardó;
no hay todavía un historial separado de intentos ni un acumulado de todos ellos.
La importación completa sigue sin ser una única transacción: puede haber
actividades ya guardadas cuando se interrumpe el procesamiento.

El consumidor decide según el estado persistido:

- Después de importar, confirma el mensaje solo si el resultado es terminal.
- Un duplicado de `completed` o `failed` se confirma sin volver a importar.
- Si otra instancia mantiene una reserva, conserva el mensaje sin confirmar y
  espera un segundo antes de volver a intentar la adquisición. Al caducar la
  reserva puede recuperar el trabajo; si la otra instancia termina, confirma el
  duplicado. Esta espera no reinicia el proceso.
- Un mensaje inválido, una ejecución inexistente o una configuración histórica
  no recuperable se copia a `synkron.sync.runs.rejected.v1`, con contenido original
  y motivo en las cabeceras. La cola es clásica y durable. Solo se confirma el
  original después de confirmar la copia persistente y comprobar que Rabbit no
  la devolvió. Si falla la publicación se conserva el original sin confirmar.
- Las ejecuciones históricas `running` sin reserva no se recuperan automáticamente:
  no se presupone que estén abandonadas. Tampoco se ejecutan registros sin una
  configuración de origen capturada.

Los fallos de infraestructura cierran la sesión de trabajo y sus conexiones,
permitiendo que Rabbit vuelva a entregar los mensajes sin confirmar. El proceso
intenta abrir una sesión nueva después de cinco segundos, sin registrar detalles
privados del error. La espera se cancela con `SIGTERM` o `SIGINT`.

La parada cancela la recepción y las esperas por reservas ajenas; no reclama ni
confirma nuevas entregas. Deja terminar el trabajo ya adquirido, cierra Rabbit
y el contexto de Nest. Compose concede 30 segundos y mantiene el reinicio ante
un fallo del proceso. Un cierre forzado puede dejar una reserva vigente hasta
60 segundos después de la última renovación.

La aceptación, la persistencia y la recuperación ofrecen entrega al menos una
vez, no ejecución exactamente una vez. Si se pierde un ACK después de copiar un
rechazado, puede quedar más de una copia en esa cola. Los rechazos no se vuelven
a publicar automáticamente: requieren revisión. Una importación que ya acabó
en `failed` tampoco se reinicia automáticamente; sus reintentos funcionales
siguen pendientes, junto con los eventos para Automation y Monitoring.

Se han comprobado solicitudes HTTP hasta `completed` y parada ordenada en local.
Las pruebas de PostgreSQL cubren reservas caducadas, competencia por la recuperación
y protección de escrituras tras esperar un bloqueo. También se ha comprobado una
caída real del consumidor temporal después de adquirir una ejecución y antes de
importar o confirmar el mensaje: el worker normal esperó a que caducase la reserva,
recuperó la misma ejecución conservando su inicio y terminó sin errores. Un mensaje
ficticio inválido quedó guardado en rechazados.

Se completaron también estas cinco comprobaciones manuales del recorrido académico,
con la fuente, PostgreSQL, el publicador, Rabbit y el worker reales:

| Escenario | Resultado observado |
| --- | --- |
| Alta | Una nueva entrega produjo una única actividad central con sus datos normalizados. |
| Edición | Cambiaron título, vencimiento, estado y nota, conservando ID y fecha de creación central. |
| Retirada y repetición | La marca de retirada explícita llegó a Sync; otra ejecución conservó la misma identidad y no volvió a retirar ni reactivar la actividad. |
| Fuente inaccesible | La ejecución terminó en `failed` con `source_error`, contadores a cero y actividades intactas, incluido `last_synced_at`. Al recuperar la fuente, una ejecución nueva terminó en `completed`; el fallo anterior permaneció en el historial. |
| Caída tras un guardado | Un consumidor de prueba terminó abruptamente después de confirmar la primera de dos altas. El worker normal recuperó la misma ejecución, conservó el ID de la actividad ya guardada y creó únicamente la pendiente. |

En la última comprobación se verificó el estado intermedio `running` con una sola
actividad de las dos nuevas persistida. Tras recuperar, el resultado fue cinco
entradas leídas, una creada y cuatro sin cambios, sin errores. Son contadores del
intento recuperado; el alta confirmada antes de la caída se reconoció como existente.

Estas comprobaciones distribuidas se realizaron manualmente. CI mantiene sus
pruebas unitarias y de integración con PostgreSQL; no se presenta esa ejecución
manual como una suite de CI con Rabbit real.

## Automation y avisos

Creación de regla, `POST /api/v1/automation/rules`:

```json
{
  "name": "Avisarme cuando cambien mis tareas",
  "trigger": {"event_type": "data.changed"},
  "condition": {"mode": "all", "conditions": [{"field": "payload.change_type", "operator": "==", "value": "updated"}]},
  "actions": [{"type": "notify", "message": "Hay cambios en tus tareas"}],
  "enabled": true
}
```

Las reglas solo admiten campos y comparaciones definidos por Synkron. `notify` crea un aviso y `start_sync` solicita una sincronización de la misma cuenta.

`GET /api/v1/automation/history` devuelve un array paginado con `limit` (1 a 50,
20 por defecto) y `offset` (desde 0). Acepta `kind=schedule|rule|reminder` y
`status=pending|accepted|failed|blocked|cancelled`; omitir un filtro incluye todos
sus valores. Cada origen se filtra por la cuenta de la sesión antes de unir los
resultados, ordenados por `created_at DESC, kind ASC, id DESC`. Incluye
`action_type`, intentos, fechas, error, `result_id`, `sync_run_id` y `activity_id`
cuando corresponden. `accepted` confirma aceptación, no finalización de Sync.

`GET /api/v1/notifications` acepta la misma paginación y `status=unread|read`;
sin `status` incluye ambos. El contador responde `{"unread": 2}`. Marcar como
leído exige sesión, origen y CSRF válidos; repetir conserva el primer `read_at`.
La procedencia `source.kind` distingue `rule` y `reminder`. La recepción interna
deduplica por cuenta e ID de acción; repetir contenido idéntico devuelve el aviso
existente y cambiarlo produce `409`.

Todas estas rutas públicas exigen sesión y envían `Cache-Control: no-store`.
Las escrituras exigen además comprobación de origen y CSRF. No aceptan
`tenant_id` del navegador. Las rutas de entrega entre servicios se mantienen
bajo `/internal/automation`, con token de servicio, y Caddy no las expone.

## Eventos

Un evento comunica un cambio o resultado. `sync.completed` indica que la sincronización terminó y `sync.failed` que falló. Los mensajes comparten estos campos:

| Campo | Significado |
|---|---|
| `event_id` | Identificador para reconocer el mensaje y evitar repeticiones. |
| `event_type` | Tipo de evento. |
| `schema_version` | Versión de su formato. |
| `tenant_id` | Cuenta propietaria. |
| `correlation_id` | Referencia para seguir la operación completa. |
| `causation_id` | Mensaje o acción que lo originó. |
| `occurred_at` | Momento en que ocurrió. |
| `producer` | Servicio que lo emitió. |
| `payload` | Datos del resultado o cambio. |

Los mensajes no incluyen contraseñas ni el contenido personal completo.

El contrato de tipos está definido en
[`sync-event.types.ts`](../apps/sync/src/events/sync-event.types.ts).
La versión inicial fija `schema_version: 1` y `producer: "sync"`. Los
identificadores del sobre son UUID y `occurred_at` representa el momento del
hecho en ISO 8601 UTC, no el de cada reenvío. En el flujo actual,
`correlation_id` identifica la ejecución y `causation_id` su mensaje de trabajo;
ambos usan el ID de ejecución. Cada evento tiene su propio `event_id`, que se
conserva si la publicación debe repetirse.

Los eventos de resultado incluyen `sync_run_id`, `definition_id` y `counts`,
con `read`, `created`, `updated`, `unchanged`, `retired` e `ignored`. Reutilizan
el tipo de contadores de Sync. `sync.failed` añade `error: { code, message }`,
con el formato de error seguro existente. El tipo de evento distingue éxito y
fallo; no se duplica el estado dentro del payload.

También se emitirá `data.changed` al confirmar una actividad nueva, modificada o retirada
en la colección de Sync. La actividad y el evento pendiente se guardan juntos:

```json
{
  "sync_run_id": "33333333-3333-4333-8333-333333333333",
  "activity_id": "22222222-2222-4222-8222-222222222222",
  "source_connection_id": "11111111-1111-4111-8111-111111111111",
  "source_collection": "assignments",
  "activity_type": "academic.assignment",
  "external_id": "42",
  "change_type": "updated",
  "changed_fields": ["grade"]
}
```

Este es un ejemplo previsto de `payload`, acompañado de los campos anteriores.
Identifica el cambio de una nota sin incluir su valor, participantes ni el contenido
completo del registro. El cambio se detecta al sincronizar; no se revisa
continuamente. Las retiradas explícitas del origen se conservan como marcas de
retirada en Sync; la ausencia de un registro no implica su borrado.

`change_type` admite `created`, `updated` y `retired`. Una actividad sin cambios
no genera `data.changed`; una ejecución nueva que termine sin cambios sí genera
`sync.completed`. `changed_fields` contiene nombres de campos, no sus valores.
Los tres contratos están definidos y existe la tabla `sync.event_outbox`, con
un helper que recibe la conexión de una transacción ya abierta. `published_at`
nulo identifica un evento pendiente. El worker guarda `data.changed` en la misma
transacción que crea, modifica o retira la actividad. El cierre de una ejecución
guarda `sync.completed` o `sync.failed` en la misma transacción que su resultado,
incluidos los contadores y, si corresponde, el error seguro. Si falla guardar el
evento, se deshace esa transacción; repetir un cierre ya confirmado no genera
otro evento.

El proceso `sync-event-publisher` publica los pendientes en el exchange durable
de tipo `topic` `synkron.events.v1`, usando `event_type` como routing key.
Los mensajes son persistentes y se marcan como publicados después de recibir
confirmación de RabbitMQ; si no se pueden enrutar o confirmar, quedan pendientes.
La cola durable `synkron.events.inspection.v1` recibe los tres tipos para su
inspección. Una caída después de publicar y antes de confirmar la transacción
puede provocar un reenvío: se conserva el mismo `event_id` y los futuros
consumidores deberán deduplicarlo.

## Errores

El formato común previsto es Problem Details, con código y explicación sin datos
sensibles. Su unificación sigue pendiente: los endpoints actuales devuelven los
errores estándar de NestJS. Los principales estados son `401` para acceso no
válido, `403` para origen, CSRF o destino rechazado, `404` para un recurso
inexistente o ajeno, `409` para conflicto, `422` para entrada incorrecta, `429`
para exceso de intentos y `503` si no puede comprobarse una dependencia. El
contrato final utilizará `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Configuración inválida",
  "status": 422,
  "detail": "La conexión de origen no está habilitada.",
  "code": "connection_disabled"
}
```

Aceptar la solicitud con `202` indica que queda pendiente, no que haya terminado
correctamente. Los fallos posteriores se consultan en la ejecución. El código
`external_outcome_unknown` se reserva para una ampliación de escritura hacia
destinos externos; el flujo inicial confirma sus actividades dentro de Sync.
