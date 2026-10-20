# API

El panel se comunicará con Synkron mediante esta API. Las rutas empiezan por `/api/v1` y los datos usan JSON. El acceso identifica a la cuenta y limita lo que puede consultar o modificar.

Los identificadores y direcciones de este documento son ficticios.

## Operaciones

| Método | Ruta sin prefijo | Resultado previsto |
|---|---|---|
| POST | `/auth/register` | `201`, usuario sin contraseña ni hash. |
| POST | `/auth/login` | `200`, sesión; formato por cerrar en ADR-005. |
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

Los errores usan el mismo formato, con código y una explicación sin datos sensibles. Los principales son `401` para acceso no válido, `404` para un recurso inexistente o ajeno, `409` para conflicto y `422` para configuración incorrecta. Se devuelven como `application/problem+json`:

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
