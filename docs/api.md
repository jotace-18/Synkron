# API

El panel se comunicará con Synkron mediante esta API. Las rutas empiezan por `/api/v1` y los datos usan JSON. El acceso identifica a la cuenta y limita lo que puede consultar o modificar.

Los identificadores y direcciones de este documento son ficticios.

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
| GET / POST | `/sync-definitions` | `200` listado / `201` definición. |
| GET / PATCH | `/sync-definitions/{id}` | `200` detalle o cambio. |
| POST | `/sync-definitions/{id}/runs` | `202`, ejecución pendiente y `Location`. |
| GET | `/sync-runs/{id}` | `200`, estado guardado por Sync. |
| GET / POST | `/automations` | `200` listado / `201` regla. |
| GET / PATCH | `/automations/{id}` | `200` detalle o cambio. |
| GET | `/automation-runs/{id}` | `200`, detalle de regla y acciones. |
| GET | `/activity` | `200`, actividad, que puede tardar en reflejar un cambio. |
| GET | `/usage` | `200`, agregados por periodo. |
| GET | `/notifications` | `200`, notificaciones del usuario. |

`Location` indica la dirección donde consultar el recurso creado. Los listados tendrán páginas; la actividad se podrá filtrar por tipo, estado y fechas con `type`, `status`, `from` y `to`. Las fechas y horas se guardarán en UTC.

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

Cada servicio verifica la sesión mediante el componente de acceso y comprueba a quién pertenece el recurso. La verificación interna no es una ruta pública de `/api/v1` y no acepta un propietario elegido por el cliente. Las contraseñas, cookies y tokens CSRF no se incluyen en los registros técnicos. Estos contratos describen el funcionamiento previsto, no una implementación disponible.

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

Creación de sincronización, `POST /api/v1/sync-definitions`:

```json
{
  "name": "Sincronizar mis tareas",
  "source_connection_id": "11111111-1111-4111-8111-111111111111",
  "target_connection_id": "22222222-2222-4222-8222-222222222222",
  "source": {"method": "GET", "path": "/tasks", "records_path": "items"},
  "target": {"method": "PUT", "path_template": "/entries/{external_id}"},
  "mappings": {"id": "external_id", "title": "title", "due_at": "due_at"},
  "deduplication_key": "id",
  "enabled": true
}
```

El destino de prueba permite actualizar una entrada por su identificador sin crear otra. En `path_template` solo se sustituyen valores comprobados; no se puede cambiar el dominio ni el protocolo. El formato exacto de selección y conversión de campos está pendiente.

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

También se emitirá `data.changed` al confirmar un registro nuevo o modificado en el destino:

```json
{
  "sync_run_id": "33333333-3333-4333-8333-333333333333",
  "record_id": "42",
  "change_type": "updated",
  "changed_fields": ["title", "due_at"]
}
```

Este es el contenido de `payload`, acompañado de los campos anteriores. El cambio se detecta al sincronizar; no se revisa continuamente ni se propagan borrados en la primera versión.

## Errores

Los errores usan el mismo formato, con código y una explicación sin datos sensibles. Los principales son `401` para acceso no válido, `403` para comprobación CSRF fallida, `404` para un recurso inexistente o ajeno, `409` para conflicto, `422` para configuración incorrecta y `429` para exceso de intentos o peticiones. Se devuelven como `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Configuración inválida",
  "status": 422,
  "detail": "La conexión destino no está habilitada.",
  "code": "connection_disabled"
}
```

Aceptar la solicitud con `202` indica que queda pendiente, no que haya terminado correctamente. Los fallos posteriores se consultan en la ejecución. El código `external_outcome_unknown` indica que no se conoce el resultado de un envío y repetirlo podría duplicar información.
