# API

El panel se comunicará con Synkron mediante esta API. Las rutas empiezan por `/api/v1` y los datos usan JSON. El acceso identifica a la cuenta y limita lo que puede consultar o modificar.

Los identificadores y direcciones de este documento son ficticios.

## Estado del contrato

Están disponibles las rutas de autenticación de la API, la creación, listado
paginado y prueba de conexiones en Sync, la creación de definiciones de
sincronización y la API de entregas de académico. En
local se accede a API por el puerto 3002, a Sync por el 3001 y a académico por el
3101. El encaminamiento de todas las rutas bajo una entrada
pública común, las consultas de actividades, las ejecuciones, las reglas, el
historial y el calendario siguen pendientes. Las operaciones indicadas como previstas en este documento
son diseño y todavía no están implementadas.

El destino inicial de una sincronización es la colección de actividades de Sync.
Las tres fuentes se describen en [Servicios de origen](servicios-origen.md). Sus
contratos de entrada son distintos de la representación común y de la vista.

## Servicio académico de origen

El backend académico se accede en local por `http://127.0.0.1:3101`, con una
credencial Bearer propia de la cuenta académica. Su colección `/api/v1/assignments`
admite creación y listado, detalle y edición por ID y borrado lógico. La ruta
`GET /api/v1/assignments/export` devuelve un array paginado que incluye registros
eliminados con `deleted_at`, para que Sync pueda reconocer su retirada. El
[contrato de entregas](../apps/academic/README.md) detalla campos, permisos,
paginación, actualizaciones parciales y preparación local. La aplicación de esos
cambios al calendario central requiere el motor de sincronización pendiente.

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
| GET | `/sync-definitions` | `200`, listado; previsto. |
| GET / PATCH | `/sync-definitions/{id}` | `200` detalle o cambio. |
| POST | `/sync-definitions/{id}/runs` | `202`, ejecución pendiente y `Location`. |
| GET | `/sync-runs/{id}` | `200`, estado guardado por Sync. |
| GET | `/activities` | `200`, actividades personales centralizadas; previsto. |
| GET | `/activities/{id}` | `200`, detalle, datos específicos y procedencia; previsto. |
| GET / POST | `/automations` | `200` listado / `201` regla. |
| GET / PATCH | `/automations/{id}` | `200` detalle o cambio. |
| GET | `/automation-runs/{id}` | `200`, detalle de regla y acciones. |
| GET | `/activity` | `200`, actividad, que puede tardar en reflejar un cambio. |
| GET | `/usage` | `200`, agregados por periodo. |
| GET | `/notifications` | `200`, notificaciones del usuario. |

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
identifica mediante un UUID v4 y el único conector admitido por ahora es
`academic.assignments`. `enabled` es un booleano y vale `true` si se omite.
No se convierten cadenas como `"false"` en booleanos. Se rechazan campos
adicionales, incluidos propietario, credenciales, colección y fechas técnicas.

Este primer conector utiliza la lectura y la correspondencia de entregas ya
implementadas: colección `assignments`, destino central y tipo
`academic.assignment`. La URL de exportación y la credencial proceden de la
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

## Consulta de actividades centralizadas (prevista)

`GET /api/v1/activities` reunirá las actividades propias de las tres fuentes.
Permitirá seleccionar un intervalo temporal, fuente y tipo; la forma concreta
de filtros y paginación se cerrará al implementar la consulta. El detalle
`GET /api/v1/activities/{id}` conservará la procedencia, la referencia externa,
los datos comunes y los detalles de origen autorizados.

Las actividades devolverán `schedule` con `kind`, `role`, `date`, `at` y `end_at`.
Una fecha sin hora usa `kind:date`; un instante conocido usa `kind:instant`; un
intervalo con final conocido usa `kind:interval`. Los campos no aplicables son
`null`, los instantes se devuelven en UTC y las fechas sin hora no se convierten
en medianoche. `tenant_id` y `content_hash` son internos y no se exponen.

La colección pertenece a Sync. `/activities` no es `/activity`: esta última ruta
representa el historial de cambios y operaciones de Monitoring. El calendario
consulta lo ya sincronizado y no vuelve a leer todas las fuentes al abrirse.
Una actividad ajena devuelve `404`; el cliente no puede elegir `tenant_id`.
La creación y modificación de compromisos se realizan en las fuentes. No se
define un POST/PATCH público sobre la colección central para editar el origen.

Los endpoints de creación y modificación de académico, deporte y planes son
contratos de esas fuentes, todavía por concretar. Los formularios de demostración
usarán un backend autorizado y no recibirán los secretos de sus conexiones.

## Ejecuciones y reglas (previstas)

La tabla de ejecuciones ya dispone de estados, fechas y contadores. Los estados
son `queued`, `running`, `completed` y `failed`. Los contadores distinguen registros
leídos, creados, actualizados, sin cambios, retirados e ignorados. Una ejecución
completada debe contabilizar todos los registros leídos; una fallida puede
conservar resultados parciales.

Una ejecución fallida exige `error_code` y `error_message`; los demás estados
mantienen ambos campos vacíos. Los mensajes proceden de un catálogo fijo según
el tipo de excepción: fuente, configuración, dependencia, almacenamiento o fallo
desconocido. No se copian mensajes originales, respuestas externas, sentencias
SQL ni credenciales. Esta conversión está preparada para el futuro procesador;
las rutas de solicitud y consulta de ejecuciones y el worker siguen pendientes.

Solicitud de ejecución: `POST /api/v1/sync-definitions/{id}/runs`, cuerpo `{}`, cabecera `Idempotency-Key: tareas-001`.

```json
{"id": "33333333-3333-4333-8333-333333333333", "status": "queued"}
```

La respuesta es `202` y `Location` lleva al detalle de esa ejecución. Misma cuenta, operación, clave y contenido devuelven la ejecución existente. Si cambia el contenido con la misma clave, se responde `409`. Falta fijar cuánto tiempo se conservan esas claves.

Creación de automatización, `POST /api/v1/automations`:

```json
{
  "name": "Avisarme cuando cambien mis tareas",
  "trigger": {"event_type": "data.changed"},
  "condition": {"field": "payload.change_type", "operator": "==", "value": "updated"},
  "actions": [{"type": "notify", "message": "Hay cambios en tus tareas"}],
  "enabled": true
}
```

Las reglas solo admiten campos y comparaciones definidos por Synkron. `notify` crea un aviso y `start_sync` solicita una sincronización de la misma cuenta.

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

El resultado de una sincronización incluye su identificador, estado y cantidades leídas, escritas y omitidas. Si falla, añade la causa del error sin datos sensibles.

También se emitirá `data.changed` al confirmar una actividad nueva o modificada
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
continuamente ni se propagan borrados en la primera versión.

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
