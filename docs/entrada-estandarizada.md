# Entrada estandarizada de actividades

Contrato v1 implementado el 22/11/2026: validación común, lectura por conectores,
recepción HTTP autenticada, aceptación duradera, worker y resultados consultables.
La migración 013 incorpora las fuentes de entrada y sus operaciones persistidas.

Decisión de referencia: [ADR-012](decisiones.md#adr-012-entrada-estandarizada-de-actividades-a-la-tubería).
Swagger UI está en `/api/docs` y la especificación descargable en
`/api/docs/openapi.json`. El [portal Swagger](swagger.md) reúne las API públicas de Cuentas, Sync,
Automation, Monitoring y Academic, con documentos separados por servicio.

## Objetivo y alcance

Las fuentes académicas, deportivas y de planes sociales entregarán actividades
al mismo núcleo de Sync, sin depender de Campus ni del formato de una API de
origen. Cada adaptador leerá y transformará sus datos; una fuente que conozca el
contrato podrá enviarlos directamente.

La parte común identifica y sitúa la actividad en el tiempo. Los estados y los
detalles conservan su significado por tipo. El alcance son actividades con fecha,
instante o intervalo; admitir documentos arbitrarios sin interpretación temporal
queda fuera de esta versión.

La primera API acepta una operación sobre un registro por petición. Los lotes,
las correspondencias configurables y la escritura hacia aplicaciones externas
quedan para ampliaciones posteriores.

## Contexto comprobado e identidad

El transporte proporciona al núcleo un contexto comprobado con `tenant_id`,
`source_connection_id`, `source_collection`, los tipos admitidos por la fuente
y la referencia de ejecución. Ese contexto se obtiene de la sesión, credencial
y configuración autorizadas, según el transporte; no se toma libremente del JSON.

La identidad estable sigue siendo:

`tenant_id + source_connection_id + source_collection + external_id`

El ID central de Synkron se genera en el servidor y no cambia al modificar fecha,
nota, título o estado. El mismo ID externo en otra fuente o colección identifica
otro registro. No se busca identidad por título ni por fecha.

Una colección de una conexión tiene una modalidad de entrada configurada:
lectura por conector o recepción directa. La v1 no admite dos escritores
simultáneos, por ambas modalidades, sobre esa misma colección. La migración de
modalidad deberá conservar la procedencia para mantener los IDs centrales.

## Operaciones y representación normalizada

- `upsert`: proporcionar la representación completa de la actividad para crearla
  o reemplazar su contenido normalizado, conservando su identidad.
- `retire`: comunicar una retirada explícita, conservando el historial central.

`upsert` no es un PATCH: omitir un campo requerido no significa conservar su
valor anterior. Los valores opcionales del esquema concreto se representan como
`null` o con la colección vacía que corresponda. La ausencia de un registro en
una página de lectura o envío no implica su retirada.

El núcleo mantiene las instrucciones de `ActivityImport`: para un alta o cambio,
`action: upsert` y un `ActivityInput`; para una retirada, `action: retire` y su
identidad y fechas de origen. El adaptador o transporte incorpora la procedencia
comprobada antes de llamar al núcleo. El campo `schema_version` pertenece al
contrato de intercambio y no se añade a `details` ni a la huella de actividad.

### Campos comunes de una actividad

| Campo | Regla v1 |
|---|---|
| `external_id` | Texto estable de 1 a 256 caracteres; no exige UUID. Se rechazan valores vacíos y espacios exteriores, sin cambiar mayúsculas ni normalizar el identificador. |
| `type` | Tipo registrado y permitido para esa fuente. El prefijo `academic`, `sport` o `personal` determina su bloque; no se recibe otra categoría que pueda contradecirlo. |
| `title` | Texto recortado de 1 a 200 caracteres. |
| `schedule` | Objeto completo de una de las tres variantes temporales siguientes. |
| `status` | Campo obligatorio, con un estado del tipo o `null` si su esquema lo admite. Nunca se infiere a partir de la fecha o de una nota. |
| `details` | Objeto JSON con los campos permitidos por el esquema del tipo. No admite propiedades desconocidas, credenciales ni la respuesta bruta de origen. |
| `source_updated_at` | Campo obligatorio, instante ISO 8601 con zona explícita o `null` si la fuente no ofrece esa información. Es metadato de procedencia. |

Todos los números deben ser finitos y cumplir el rango y precisión de su campo.
Las reglas de notas académicas no se trasladan a las métricas deportivas.

### Tiempo

Se conservan los nombres y nulos explícitos del modelo actual:

| `kind` | Campos y significado |
|---|---|
| `date` | `date` es un día real `YYYY-MM-DD`, entre los años 0001 y 9999; `at` y `end_at` son `null`. No se convierte en medianoche UTC. |
| `instant` | `at` es un instante ISO 8601 con `Z` o desplazamiento explícito; `date` y `end_at` son `null`. |
| `interval` | `at` y `end_at` son instantes explícitos, con final posterior al comienzo; `date` es `null` y `role` es `start`. El final es exclusivo. |

`role` distingue `deadline` de `start`. Cada tipo limita las combinaciones
permitidas: las entregas usan vencimiento; los exámenes, celebración o comienzo.
Un examen sigue admitiendo solo `date` o `instant`. Una capacidad del contrato
común no habilita automáticamente esa variante para todos los tipos.

Los instantes se normalizan a UTC para guardar y comparar. Las horas locales sin
zona se rechazan; corresponde a la fuente o adaptador resolver su zona y los
cambios de horario. El calendario actual muestra los instantes en Madrid.

### Tipos habilitados y detalles

La entrada común utilizará un registro de esquemas por tipo. En la primera
implementación se habilitan `academic.assignment` y `academic.exam`, conservando
sus campos, estados y reglas ya documentados en el [modelo común](modelo-actividades.md).
Los nombres de otros tipos previstos en código no bastan para admitirlos por HTTP.

Cada nueva actividad de deporte o planes registrará su esquema, estados y reglas
temporales. Utilizará el mismo sobre, transporte y núcleo, sin añadir un endpoint
de recepción diferente por disciplina. Los esquemas deportivos y sociales aún
no acordados no se dan por cerrados en este documento.

## Recepción directa por HTTP

Rutas disponibles tras aplicar la migración 013:

- `POST /api/v1/ingestions`: aceptar una operación persistente.
- `GET /api/v1/ingestions/{id}`: consultar el resultado de esa entrada.

La credencial `Authorization: Bearer ...` se emite en Synkron para una fuente
de entrada y queda vinculada a su propietario, conexión, colección y tipos
permitidos. Es distinta de la credencial con la que Sync consulta Academic.
Su administración incluye alta, pausa, rotación y revocación.

Estos endpoints usan autenticación explícita de fuente, sin alternativa de
autenticación mediante cookies. Las operaciones de administración desde el panel
utilizan sesión y CSRF. No se publican rutas internas para esta entrada.
Una credencial solo puede consultar entradas de su propia fuente.

Se exige `Content-Type: application/json` y `Idempotency-Key`. Esta clave conserva
la sintaxis actual: de 1 a 128 caracteres, empieza por un carácter alfanumérico y
solo contiene caracteres alfanuméricos, punto, guion, guion bajo o dos puntos.
La primera versión limita el cuerpo completo a 64 KiB de JSON UTF-8 sin comprimir;
no acepta arrays de operaciones ni cuerpos comprimidos. Este límite es de la
recepción directa y no recorta las exportaciones existentes de los conectores.

### Ejemplo de alta o actualización

Cabeceras: `Authorization: Bearer CREDENCIAL_FICTICIA_DE_ENTRADA` e
`Idempotency-Key: parcial-cc:revision-1`.

```json
{
  "schema_version": 1,
  "action": "upsert",
  "external_id": "parcial-cc-001",
  "source_updated_at": "2026-11-22T19:00:00Z",
  "activity": {
    "type": "academic.exam",
    "title": "Parcial de CC",
    "schedule": {
      "kind": "date",
      "role": "start",
      "date": "2026-11-26",
      "at": null,
      "end_at": null
    },
    "status": "scheduled",
    "details": {
      "course_name": "Cloud Computing",
      "course_abbreviation": "CC",
      "topics": "Temas 1 y 2",
      "section": "theory",
      "weight_percent": null,
      "weight_basis": null,
      "grade": null
    }
  }
}
```

Todos los campos mostrados del sobre son obligatorios. `activity` contiene los
cinco campos mostrados; los permitidos dentro de `details` dependen de su tipo.
Se rechazan propiedades adicionales en el sobre y en los objetos comunes.
No se reciben `tenant_id`, `source_connection_id`, `source_collection`, ID central,
fechas técnicas, contadores, `content_hash` ni eventos suministrados por la fuente.

### Ejemplo de retirada

```json
{
  "schema_version": 1,
  "action": "retire",
  "external_id": "parcial-cc-001",
  "source_updated_at": "2026-11-22T19:30:00Z",
  "source_deleted_at": "2026-11-22T19:30:00Z"
}
```

La retirada no lleva `activity` y exige un instante válido `source_deleted_at`.
Una retirada desconocida se registra como `ignored`, sin crear una actividad
incompleta. Retirar de nuevo una actividad ya retirada no genera otro cambio
de dominio. Cancelar un examen es un `upsert` de su estado; mantiene su visibilidad.
Un `upsert` posterior sobre una identidad retirada puede volver a activarla,
conservando el ID central, como en la persistencia actual.

## Idempotencia, cambios y orden

Hay dos identidades diferentes: la clave de idempotencia identifica una solicitud;
la procedencia y el ID externo identifican la actividad. Una nueva revisión de
un registro utiliza una nueva clave de idempotencia y conserva `external_id`.

La clave se limita al propietario y a la fuente configurada, no al texto de su
credencial: rotar una credencial no crea otro espacio de idempotencia. Repetir la
misma clave con la misma operación normalizada devuelve la misma ejecución,
incluso si ya terminó. La misma clave con otro contenido produce `409`. Las
reservas concurrentes deben resolverse de forma atómica en PostgreSQL.

Con otra clave, enviar una actividad sin cambios semánticos produce `unchanged`:
no duplica el registro ni genera otro `data.changed`. El orden de las propiedades
JSON no constituye un cambio. Se conservan las reglas actuales de huella sobre
tipo, título, horario, estado y detalles; las fechas técnicas y la mera revisión
de `source_updated_at` no generan cambios de dominio.

`source_updated_at` no es una versión de concurrencia ni proporciona un reloj
común entre fuentes. La v1 aplica las escrituras confirmadas y no garantiza el
orden causal de peticiones simultáneas con claves distintas. Una fuente debe
esperar al resultado terminal de una operación antes de enviar la siguiente
sobre la misma identidad. El rechazo de revisiones antiguas o el control mediante
versiones monotónicas requieren una ampliación explícita del contrato.

## Aceptación, resultados y errores

La petición se valida por completo antes de aceptar trabajo. Antes del `202`
deben quedar guardados la operación normalizada, su contexto, la clave y huella
de solicitud, y la ejecución con su trabajo pendiente, de forma atómica.
La recepción directa no vuelve a consultar una URL de origen para obtener el
contenido que ya recibió.

La aceptación inicial devuelve `202`, `Cache-Control: no-store`,
`Location: /api/v1/ingestions/{id}` y este cuerpo:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "status": "queued"
}
```

El ID identifica la ejecución del trabajo de entrada. Un reenvío idempotente
devuelve `202` y ese mismo ID con su estado actual, sin crear otro trabajo.
La consulta devuelve `200`, el estado `queued`, `running`, `completed` o `failed`,
los contadores comunes y un error seguro cuando corresponda. Por ejemplo:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "status": "completed",
  "counts": {
    "read": 1,
    "created": 1,
    "updated": 0,
    "unchanged": 0,
    "retired": 0,
    "ignored": 0
  },
  "error": null
}
```

En una entrada completada, `read` vale 1 y la suma de resultados vale 1.
En caso de fallo, `error` contiene `code` y `message` sanitizados, sin cuerpos,
credenciales ni trazas de la fuente. La aceptación no significa que la actividad
ya esté visible; se espera al resultado terminal. La ejecución debe aparecer en
el seguimiento común y reutilizar la reserva de trabajo y los eventos de Sync.

| Código HTTP | Significado |
|---|---|
| `400` | JSON mal formado. |
| `401` | Credencial ausente, inválida o revocada. |
| `404` | Entrada inexistente o perteneciente a otra fuente. |
| `409` | Clave reutilizada con otro contenido o configuración de fuente deshabilitada/incompatible con recepción directa. |
| `413` | Cuerpo superior a 64 KiB. |
| `415` | Formato distinto de JSON o codificación comprimida no admitida. |
| `422` | Versión, operación, tipo, clave de idempotencia, campos o combinaciones semánticas no válidos. |
| `503` | Dependencia necesaria no disponible; no se confirma trabajo que no haya quedado persistido. |

Los errores de validación indicarán las rutas de los campos y el motivo, sin
repetir sus valores. No habrá escrituras de actividades por entradas rechazadas.
Una fuente permitida pero un tipo no registrado o fuera de su alcance produce
`422`. No se exponen detalles de la configuración de otras fuentes.

## Núcleo compartido implementado: subpunto 2

La entrada interna está separada del transporte de consulta:

1. `ConnectorImportTransport` comprueba la conexión de la cuenta, descifra la
   credencial saliente y utiliza el lector y la transformación del conector.
2. `ActivityImportPipeline` recibe exclusivamente el contexto comprobado y las
   instrucciones normalizadas. No consulta conexiones, descifra credenciales ni
   solicita datos por HTTP; utiliza `ActivitiesService` para persistirlos.
3. `normalizeActivityImport` valida todas las instrucciones y prepara copias
   independientes antes de la primera escritura. Comprueba procedencia, campos
   exactos, identidad externa, tiempo, tipo habilitado, estado y detalles.

`ActivitySchema` registra las reglas de cada tipo. Por ahora admite entregas y
exámenes; las actividades previstas de deporte y planes requieren registrar su
esquema antes de poder entrar. Las notas, ponderaciones, asignaturas e integrantes
comparten reglas de dominio académico entre adaptadores y actividades
normalizadas. Exámenes ya no depende del validador de entregas.

El núcleo normaliza instantes a UTC y recorta el título, conservando los días sin
hora y el identificador externo. Mantiene los contadores y sus instantáneas de
progreso, la cancelación y la reserva de ejecución que reciben las escrituras.
Los errores de validación son de dominio y llevan una ruta de campo sin el valor
rechazado. El transporte de lectura los traduce a un error de fuente; la recepción HTTP
los representa con `422` y rutas de campo, sin repetir valores rechazados.

Ambos importadores académicos utilizan estos servicios mediante la inyección de
dependencias del backend y del worker. La recepción directa incorpora su propio transporte y utiliza este mismo núcleo
a través de `StoredIngestionImporter`, sin volver a consultar una API de origen.

## Compatibilidad

`schema_version` debe ser exactamente el número `1`. Cambiar significados,
operaciones o requisitos existentes exige una nueva versión; un tipo nuevo
registrado con su propio esquema conserva el sobre v1. Los clientes no deben
enviar campos desconocidos anticipando funcionalidades futuras.

Los adaptadores actuales se ajustarán al contrato normalizado sin cambiar sus
API de origen, identidades centrales, credenciales salientes ni respuestas
públicas existentes. El nuevo formato HTTP no modifica los cuerpos que Campus
envía a Academic ni el `POST` actual para solicitar una sincronización de lectura.

La implementación de esta entrada queda completada para los tipos registrados:
`academic.assignment` y `academic.exam`. Deporte y planes utilizarán el mismo
sobre y núcleo cuando incorporen sus esquemas de dominio; todavía no se admiten
sus tipos por el mero hecho de aparecer en el catálogo conceptual.

## Fuentes y credenciales de entrada

La administración requiere sesión de Synkron y CSRF en las escrituras. La
recepción y la consulta de su resultado requieren una credencial Bearer de la
fuente; una cookie de sesión no la sustituye.

| Método | Ruta | Resultado |
|---|---|---|
| POST | `/api/v1/ingestion-sources` | `201`, fuente y credencial mostrada una sola vez. |
| GET | `/api/v1/ingestion-sources?limit=20&offset=0` | Fuentes de la cuenta, sin credenciales ni hashes. |
| PUT | `/api/v1/ingestion-sources/{id}` | `200`, cuerpo `{ "enabled": false }` o `true`. |
| POST | `/api/v1/ingestion-sources/{id}/rotate-token` | `200`, nueva credencial; invalida la anterior. |
| POST | `/api/v1/ingestion-sources/{id}/revoke` | `200`, invalida la credencial. |
| POST | `/api/v1/ingestions` | `202`, operación aceptada de forma duradera. |
| GET | `/api/v1/ingestions/{id}` | `200`, estado y resultado de una operación de esa fuente. |

Ejemplo de alta de fuente:

```json
{
  "name": "Integración externa de exámenes",
  "source_collection": "external.exams",
  "allowed_types": ["academic.exam"]
}
```

La credencial aleatoria solo se guarda como SHA-256. No se reutiliza el Bearer
saliente de Academic. La cuenta, conexión, colección y tipos permitidos se
obtienen de la fuente comprobada, no del JSON recibido. Cada fuente administra
una colección de recepción propia; estas conexiones y definiciones privadas no
se ofrecen como conectores de lectura o programaciones manuales.

Pausar impide nuevas operaciones, pero permite consultar y repetir las ya
aceptadas. Rotar mantiene la identidad y el espacio de idempotencia: la nueva
credencial puede consultar las operaciones anteriores de la misma fuente.
Revocar impide autenticar esa credencial. Las operaciones aceptadas antes de una
pausa, rotación o revocación conservan su trabajo: estos controles no cancelan
una aceptación ya confirmada.

## Arranque y prueba manual

La comprobación de esta versión en tus contenedores se realiza con los pasos
siguientes. Desde la raíz del repositorio, aplica primero la migración
con la base de Sync disponible:

```bash
docker compose up -d --wait sync-db
docker compose run --rm --no-deps \
  --volume "$PWD/apps/sync:/app" sync npm run migrate:up
docker compose up -d --build sync sync-worker
```

Para el recorrido con sesión, cola, calendario, eventos y consumidores:

```bash
docker compose up -d api rabbitmq sync-publisher sync-event-publisher \
  monitoring monitoring-consumer automation automation-consumer \
  automation-notifications automation-reminders web gateway
```

Compose levanta también las dependencias declaradas de esos servicios. Las
fuentes directas no necesitan Academic. Para comprobar además los conectores
académicos existentes, levanta sus servicios como en [Exámenes](examenes.md).

1. Entra en Synkron y abre `https://localhost:8443/api/docs` en ese navegador.
2. Despliega `POST /api/v1/ingestion-sources`, pulsa **Try it out**, envía el
   ejemplo anterior con **Execute** y conserva la
   credencial de la respuesta `201`. Las escrituras de administración solicitan
   el CSRF automáticamente desde Swagger UI; no necesitas copiar cookies ni
   introducir un CSRF manualmente en Authorize.
3. Pulsa **Authorize** e introduce la credencial en **IngestionToken**, sin
   añadir el prefijo `Bearer`. Cierra el diálogo, despliega
   `POST /api/v1/ingestions`, pulsa **Try it out** y utiliza el ejemplo de examen. Mantén una clave de idempotencia estable para
   reintentar ese mismo contenido. Debe responder `202` con un ID.
4. Consulta `GET /api/v1/ingestions/{id}` con esa credencial hasta `completed`.
   Debe indicar una lectura y un alta; el examen debe aparecer en el calendario
   y su ejecución en Monitoring.
5. Repite la misma clave y contenido: debe devolver el mismo ID. Una clave nueva
   con el mismo contenido debe terminar con `unchanged`, sin duplicar actividad.
6. Cambia nota o fecha y usa otra clave: debe actualizar la misma actividad.
   Envía después la retirada explícita con otra clave; debe quedar retirada.
7. Comprueba un estado no permitido (`422`), una clave reutilizada con otro
   contenido (`409`) y que otra fuente o cuenta no puede consultar esa entrada.
8. Pausa, rota y revoca desde la administración para comprobar los controles
   descritos arriba. No hay que editar credenciales en una base de datos.

Swagger no persiste la credencial al recargar. Puedes retirarla con **Logout**
en el diálogo **Authorize**. Al crear o rotar una fuente, la respuesta contiene
el secreto y debe tratarse como tal; recarga la página para limpiar los
resultados mostrados.

## Ejemplo externo sin Campus

Los archivos [exam.json](../examples/ingestions/exam.json) y
[retire-exam.json](../examples/ingestions/retire-exam.json) utilizan la misma
identidad externa. El script Node 24
[send-activity.mjs](../examples/ingestions/send-activity.mjs) envía una operación
y consulta su resultado. Requiere una fuente que permita `academic.exam`.

Con HTTPS local, utiliza la CA de Caddy exportada como se explica en
[Gateway](../infra/gateway/README.md). No desactives la verificación TLS. Ejemplo
en zsh, introduciendo la credencial sin guardarla en el historial:

```bash
read -r -s 'SYNKRON_INGESTION_TOKEN?Credencial de entrada: '
export SYNKRON_INGESTION_TOKEN
NODE_EXTRA_CA_CERTS="$PWD/tmp/synkron-local-ca.crt" \
  node examples/ingestions/send-activity.mjs \
  examples/ingestions/exam.json external-exam:1
unset SYNKRON_INGESTION_TOKEN
```

El origen predeterminado es `https://localhost:8443`; `SYNKRON_URL` permite
cambiarlo. El script no imprime el Bearer ni lo envía tras una redirección. Si
se pierde una respuesta, conserva la misma clave y contenido para reintentar.
Espera al resultado terminal antes de mandar otra revisión de esa identidad.
Para retirar el ejemplo, utiliza `retire-exam.json` y otra clave.

## Comprobaciones y límites del cierre

Las pruebas unitarias cubren el núcleo compartido, los conectores existentes, el
contrato directo y la especificación pública. La suite PostgreSQL
`test/ingestions.e2e-spec.ts` añade el ciclo de vida completo, separación entre
cuentas y fuentes, concurrencia, reversión de aceptación si falla el trabajo,
pausa, rotación, revocación y límites HTTP. Está escrita y comprobada por
TypeScript; su ejecución real queda para el entorno con PostgreSQL o CI.

En esa suite, el worker y los lectores se controlan desde el propio test. Para
lanzarla localmente, evita que otro `sync-worker` o publicador reclame sus
trabajos mientras corre. No se presupone una validación manual de estos nuevos
endpoints por haber pasado las pruebas unitarias.


## Lectura de fuentes canónicas y gimnasio (23/11/2026)

La migración 014 incorpora el conector genérico `standard.activities` para
exportaciones HTTP de operaciones v1 paginadas con `limit/offset`, incluidas bajas
explícitas. Utiliza `normalizeIngestionEnvelope`, la misma validación de dominio
que la recepción directa, sin traducir datos de una aplicación específica. Su
colección es `activities`; los IDs externos son opacos y sensibles a mayúsculas.

Está registrado también `sport.gym`: intervalo de comienzo, duración positiva de
minutos enteros (hasta 2147483647), estados `scheduled/completed/cancelled`, detalles
exactos `training_mode` y `accompanied`. Se puede recibir por POST si la fuente
lo permite, o mediante el lector canónico de Sport. No se habilitan aún los demás
tipos deportivos previstos en el enum.

`POST /api/v1/sync-sources`, con sesión y CSRF, crea conexión y definición de
lectura en una transacción y conserva la procedencia ante reintentos. La guía de
[Deporte](deporte.md#conectar-gimnasio-con-synkron) documenta la configuración,
límites, paginación y el botón «Sincronizar todo». No se incorpora un conector
específico de gimnasio ni un endpoint de recepción nuevo por disciplina.


## Integración de Otros: personal.event (23/11/2026)

La migración 015 añade `personal.event` al catálogo central. No crea otro
conector ni otro endpoint de ingesta: `standard.activities` consulta la
exportación canónica de Personal y la entrada directa utiliza la misma validación.
El worker, la identidad, la idempotencia y los eventos existentes se conservan.

El esquema exige rol `start`, estado `pending/completed/cancelled` y exactamente
`details.people`: un array de hasta 50 nombres no vacíos, sin espacios exteriores,
y de hasta 100 caracteres Unicode cada uno. Una lista vacía representa personas
no indicadas. Admite día sin hora, instante o intervalo de duración positiva en
minutos enteros hasta 2147483647; no permite almacenar otra duración en details.

Cada operación conserva su identidad `events:<id>` en colección `activities`.
No se inventa una hora para un día ni se infiere una retirada por ausencia. Un
registro inválido en cualquier página impide comenzar a aplicar esa exportación;
una baja requiere `retire`. Los eventos de cambio identifican el tipo, la actividad
y los campos modificados, incluidos `people` y `schedule`, sin copiar la lista de
personas en el evento.

`social.plan` conserva su valor de base de datos y su lectura histórica. No se
reescriben sus IDs, huellas ni eventos y no se habilita como tipo de entrada.
La agenda identifica `personal.event` como «Otros» y agrupa allí el tipo histórico.

Compose autoriza `http://personal:3000` tanto en Sync como en su worker. El
preset Otros utiliza la misma administración atómica de conexiones y credenciales
cifradas; cambiar el preset limpia la credencial introducida. «Sincronizar todo»
incluye su definición habilitada junto a las académicas y deportivas, sin cambiar
las fuentes ya conectadas. Véase la
[guía de conexión](servicios-origen.md#conectar-otros-con-synkron).


### Selección manual por bloques

En la agenda, seleccionar Académico solicita juntas sus definiciones habilitadas
de entregas y exámenes; Deporte y Otros hacen lo mismo con sus fuentes del bloque.
Sincronizar todo reúne todos los bloques y las otras fuentes conectadas. Las
solicitudes, claves de idempotencia y ejecuciones siguen siendo independientes
por definición; la interfaz agrega el resultado y deja desplegar sus detalles.
Las programaciones y reglas existentes mantienen su destino explícito.
