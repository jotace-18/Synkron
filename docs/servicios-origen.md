# Servicios de origen y actividades

Este documento define las entradas de la demostración. Describe requisitos de
producto; los modelos y rutas que todavía no existen no se presentan como código
implementado. Las decisiones abiertas se enumeran al final.

## Tres fuentes independientes

| Fuente | Responsabilidad |
|---|---|
| Académico | Agenda personal de entregas, exámenes, sesiones de trabajo y eventos académicos. |
| Deporte | Registro de gimnasio, fútbol, senderismo, carrera y otras actividades sencillas. |
| Otros | Recados, citas y quedadas con asunto y día, hora y duración opcionales, personas opcionales y estado. |

Son servicios externos al motor de Synkron. En un proyecto personal pueden ser
módulos propios. No son los componentes internos Sync, Automation y Monitoring.
Cada fuente mantiene sus datos y persistencia, permite introducir y modificar
registros y ofrece una API de acceso autorizado. Synkron no lee sus bases de datos.

La API estática `fixtures/task-api` permite comprobar conexiones. El backend
`apps/academic` implementa las colecciones editables de entregas y exámenes, con PostgreSQL,
autorización Bearer y borrado lógico. Su [contrato y arranque](../apps/academic/README.md)
describen las rutas disponibles. Los demás recursos académicos siguen pendientes. La fuente Otros dispone ya
de backend; su interfaz e integración central siguen pendientes. `apps/sport` incorpora la API de gimnasio con
PostgreSQL y credenciales propias. `apps/sport-web` permite mantener sesiones
desde una interfaz independiente; la integración con Sync y Monitoring está validada. Campus permite introducir y editar entregas y exámenes.

## Fuente académica

### Entregas

| Dato | Alcance |
|---|---|
| Título | Nombre de la entrega. |
| Asignatura | Asignatura a la que corresponde. |
| Parte | Teoría, prácticas o seminarios. |
| Obligatoriedad | Obligatoria u opcional. |
| Ponderación | Opcional, si se conoce. |
| Vencimiento | Fecha y hora límite cuando se conozcan; se debe admitir una fecha sin hora. |
| Estado de entrega | Pendiente, en preparación o entregada (`pending`, `in_progress`, `submitted`). |
| Modalidad | Individual o grupal. |
| Integrantes | Lista opcional de nombres para grupos; vacía para una entrega individual. |
| Nota | Opcional y actualizable posteriormente, de 0 a 10 con máximo dos decimales. |

La ausencia de nota o ponderación no equivale a un cero. Una nota publicada
después se incorpora a la misma entrega, manteniendo su identificador. La
ponderación conserva un porcentaje de 0 a 100 y su referencia: nota final de la
asignatura (`course`) o parte correspondiente (`section`). Se admiten ambas formas
sin calcular equivalencias automáticamente. La condición de vencida se deriva
del plazo y del estado, sin sustituir los tres estados de progreso.

La edición conserva los campos omitidos y valida la combinación final de
vencimiento, modalidad/integrantes y ponderación en una operación atómica. El
borrado marca `deleted_at`: las consultas normales ocultan el registro y la
exportación autenticada conserva esa marca para el futuro motor de Sync.

### Exámenes

Contrato acordado el 22/11/2026.

| Dato | Alcance |
|---|---|
| Título | Obligatorio, entre 1 y 200 caracteres. |
| Asignatura | Obligatoria. Campus reutiliza el selector de siglas y conserva nombre y abreviatura. |
| Temas | Texto libre opcional, hasta 1000 caracteres. |
| Parte | Teoría o prácticas (`theory`, `practice`). |
| Fecha | Obligatoria; admite exámenes futuros y pasados. |
| Hora | Opcional. Campus utiliza el horario de Madrid. |
| Estado | Programado, realizado o cancelado (`scheduled`, `completed`, `cancelled`). Por defecto, programado. |
| Ponderación | Opcional, de 0 a 100, con referencia a la asignatura completa (`course`) o a su parte (`section`). |
| Nota | Opcional, de 0 a 10, con máximo dos decimales. |

Una fecha sin hora conserva su significado de día. No se le asigna
automáticamente medianoche ni otra hora de celebración. Cuando existe hora,
el instante se comunica con zona horaria y se almacena en UTC.

La ausencia de nota o ponderación no equivale a cero. La ponderación y su
referencia se indican juntas o se dejan ambas vacías. No se calculan medias
ni equivalencias entre ponderaciones.

El estado se modifica explícitamente. El paso del tiempo o la incorporación
de una nota no cambian automáticamente el estado del examen.

Modificar fecha, temas, estado o nota actualiza el mismo examen, conservando
su identidad. Publicar una nota no crea otro compromiso académico.

Cancelar y retirar son operaciones distintas:

- Un examen cancelado conserva su registro y se identifica como cancelado.
- Retirarlo aplica borrado lógico: desaparece de las consultas normales y
  su exportación mantiene la marca para que Sync retire la actividad.
- Los exámenes realizados, cancelados o retirados no generan nuevos
  recordatorios pendientes.

La API y la exportación reutilizan la autenticación Bearer y la cuenta
académica existentes. Cada cuenta solo accede a sus propios exámenes.

Los campos, rutas y reglas de edición se concretan en el
[contrato API de exámenes](api.md#contrato-de-exámenes).
La representación temporal y los detalles de `academic.exam` se recogen en el
[modelo común](modelo-actividades.md#contrato-de-exámenes).
El recorrido de exámenes está implementado. Consulta la [guía de arranque y validación](examenes.md).

### Sesiones de estudio o trabajo

Una sesión reserva tiempo para estudiar o avanzar una práctica. Se utilizará un
mismo tipo de sesión, distinguiendo estudio y práctica, con relación opcional a
una entrega o examen existente. También se admite trabajar en una asignatura
sin vincular la sesión a un compromiso concreto.

Una entrega o examen puede tener varias sesiones de preparación. Cada sesión
tiene identidad y horario propios; completarla no marca la entrega como
entregada ni el examen como realizado.

La propuesta de campos comprende título, asignatura, tipo de trabajo, comienzo,
duración prevista y estado. Los valores de estado y la representación exacta de
duración/finalización siguen pendientes. No se ha acordado planificación
automática, cronómetro ni reprogramación de sesiones.

### Eventos académicos generales

Permiten registrar tutorías, exposiciones, jornadas y otros compromisos con una
estructura flexible. Se propone título y fecha como base, con hora, duración o
finalización, asignatura, ubicación/enlace y descripción opcionales. Las reglas
exactas de obligatoriedad y estado se cerrarán antes de implementarlos.

No se exige completar ponderación, nota o integrantes de grupo para registrar
un evento general.

## Fuente deportiva

Las sesiones comparten información de identificación y tiempo, con detalles
según el deporte. Esta separación funcional no exige un microservicio por
disciplina ni fija todavía un esquema de tablas o almacenamiento.

| Actividad | Datos acordados |
|---|---|
| Gimnasio | Fecha, hora, duración en minutos, modalidad push/pull/leg/upper/lower/otros y solo/acompañado. Título automático y estados programado/realizado/cancelado. |
| Fútbol | Modalidad sala/7/11, posición, goles, asistencias, ubicación y distancia recorrida opcional. |
| Senderismo | Nombre de ruta, acompañantes opcionales, distancia, desnivel positivo acumulado y ubicación. |
| Carrera | Distancia y tiempo empleado. |
| Otros deportes | Registro básico y flexible para actividades poco frecuentes. |

### Primera actividad: gimnasio

Alcance acordado el 23/11/2026 para `sport.gym`:

- Fecha y hora de inicio obligatorias, introducidas en horario de Madrid.
- Duración obligatoria, expresada en minutos enteros positivos.
- Modalidad seleccionable: push, pull, leg, upper, lower u otros.
- Selección explícita de solo o acompañado; no se solicitan nombres.
- Estado programado, realizado o cancelado (`scheduled`, `completed`, `cancelled`).
  Permite registrar tanto sesiones futuras como entrenamientos ya realizados.
- Título generado a partir de la modalidad, por ejemplo «Gimnasio · Push».

La fuente guarda la duración y calcula el final a partir del inicio. Sync recibe
un intervalo de comienzo, con sus instantes normalizados a UTC. El cambio de
fecha, duración, modalidad, compañía o estado actualiza la misma sesión. El
estado se modifica explícitamente, sin deducirlo del paso del tiempo.

Cancelar conserva la sesión visible como cancelada. Retirar comunica una baja
explícita y conserva su identidad para la sincronización. Los nombres de
acompañantes, sensaciones, ejercicios, series, pesos y repeticiones no forman
parte de este primer recorrido. La propuesta anterior de nombres y sensaciones
queda aplazada respecto al alcance simplificado acordado.

El [plan de gimnasio](deporte.md) recoge los subpuntos de implementación. El
backend y la interfaz de la fuente están implementados; la habilitación de su
esquema y su publicación en Sync siguen pendientes.

El desnivel de senderismo es el positivo acumulado, medido en metros ascendidos,
no la diferencia de altura entre inicio y final ni el descenso acumulado.
Las unidades y precisión de distancia y la definición de tiempo de carrera se
concretarán en el contrato. La regla de dos decimales de las notas no se aplica
automáticamente a estas métricas.

Hevy se contempla como integración futura del proyecto personal. No se utiliza
su API ni se añaden ahora ejercicios, series, pesos o repeticiones al alcance.
La referencia a Strava describe el tipo de información de carrera, sin requerir
un conector actual. Registrar actividades frecuentes no supone todavía patrones
de repetición automática. Para gimnasio ya se admite planificar sesiones futuras;
el alcance concreto de las demás disciplinas se cerrará al incorporarlas.

## Fuente personal: Otros

Contrato acordado el 23/11/2026; sustituye la propuesta de planes sociales.
El backend está implementado en `apps/personal`; su interfaz y la habilitación
central en Sync corresponden a los siguientes subpuntos. Puede representar ir a comprar,
una cita con el peluquero o quedar con amigos mediante el mismo recurso.

| Dato | Alcance |
|---|---|
| Asunto | Obligatorio. |
| Día | Obligatorio. |
| Hora | Opcional; se introduce en horario de Madrid. |
| Duración | Opcional, en minutos enteros positivos; requiere hora de comienzo. |
| Personas | Lista opcional de nombres, sin cuentas ni invitaciones. |
| Estado | Pendiente, realizado o cancelado. |

Sin hora se exporta un día; con hora y sin duración, un instante; con duración,
un intervalo. El tipo central previsto es `personal.event` con rol `start` y
estados `pending`, `completed`, `cancelled`. La duración central se obtiene del
intervalo. Cancelar mantiene el registro; retirar comunica una baja explícita.

La exportación ofrece el contrato canónico común para el lector
`standard.activities`. Ubicación, descripción, recurrencias, mapas e invitaciones
no forman parte del primer recorrido. El plan está en [US-25](backlog.md#us-25--incorporar-el-bloque-otros-para-compromisos-personales).

### API de compromisos personales

El backend escucha en `127.0.0.1:3106`, dispone de `/healthz` con comprobación de
PostgreSQL y usa una cuenta propia con token Bearer de 64 caracteres hexadecimales.
Solo se guarda la huella SHA-256 del token. No se usan cookies para esta fuente.

| Método | Ruta en Personal | Comportamiento |
|---|---|---|
| POST | `/api/v1/events` | Crear un compromiso propio. |
| GET | `/api/v1/events` | Listar activos; `limit` 1–50, `offset` no negativo. |
| GET | `/api/v1/events/export` | Listar propios incluidas retiradas. |
| GET | `/api/v1/events/:id` | Obtener un activo propio. |
| PATCH | `/api/v1/events/:id` | Editar parcialmente, completar o cancelar. |
| DELETE | `/api/v1/events/:id` | Retirada lógica idempotente. |
| GET | `/api/v1/activities/export` | Operaciones canónicas v1, incluidas retiradas. |

El día sin hora se conserva en `on_date`. Si se conoce la hora, se comunica
`started_at` con zona explícita y `on_date:null`; el instante ya contiene el día.
`duration_minutes` es null o un entero positivo hasta 2147483647, solo con hora.
El final calculado debe permanecer entre los años 1 y 9999. No se guarda un
`end_at` independiente. Todas las fechas se devuelven sin hora inventada o en UTC.

`title` se recorta y admite 1–200 caracteres. `people` es una lista opcional
(por defecto vacía) de hasta 50 nombres recortados, no vacíos y de hasta 100
caracteres. No representa invitaciones ni cuentas. `status` usa `pending` por
defecto y admite `completed` o `cancelled`; no cambia por el paso del tiempo.

PATCH conserva los campos omitidos y comprueba el estado final en una única
sentencia SQL. Cambiar de día sin hora a instante requiere borrar `on_date` con
null. Volver a un día sin hora exige borrar `started_at` y cualquier duración.
Solo los tres campos temporales admiten null; `people:[]` elimina los nombres.
Una edición sin cambios conserva `updated_at`; editar siempre conserva el ID.
Cancelar mantiene el compromiso visible. DELETE lo retira; repetir DELETE
conserva la fecha de retirada. Un ID ajeno y uno inexistente devuelven el mismo
404. No se aceptan `account_id`, `tenant_id`, `end_at` ni fechas técnicas del cliente.

La exportación canónica usa `personal.event`, `external_id=events:<id>` y
colección lógica `activities`. Los detalles contienen exclusivamente `people`.
Los registros activos son sobres `upsert` completos y los retirados sobres
`retire` con identidad y fecha. Se pagina en orden `created_at DESC, id DESC`,
incluyendo retiradas; la ausencia no se interpreta como baja. Las lecturas
concurrentes con altas pueden necesitar una segunda sincronización para converger.

### Arranque de la fuente personal

El bloque `PERSONAL_*` está en `.env.example`. El usuario ya preparó tres valores
distintos: contraseña administradora, contraseña de aplicación y token de la
cuenta de demostración. No se deben copiar credenciales a documentación o al chat.

Desde la raíz del repositorio:

```bash
docker compose up -d --wait personal-db
docker compose build personal sync
docker compose run --rm --no-deps \
  --volume "$PWD/apps/personal:/app" personal npm run migrate:up
docker compose up -d --wait personal
```

Prepara la cuenta sin imprimir el token ni pasarlo como argumento:

```bash
set -o pipefail
node --env-file=.env -e 'process.stdout.write(process.env.PERSONAL_DEMO_TOKEN ?? "")' \
  | docker compose exec -T personal npm run account:demo
```

Repetir conserva la cuenta y no reactiva una cuenta deshabilitada. Se muestran
solo ID, nombre y enabled. Después actualiza el portal y el gateway:

```bash
docker compose up -d sync gateway
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

En `https://localhost:8443/api/docs`, selecciona **Otros · fuente externa** y
autoriza `PersonalBearer` con tu token personal (sin el prefijo Bearer).
El gateway publica solo las rutas de negocio indicadas bajo `/personal` y el
OpenAPI en `/api/docs/personal/openapi.json`; no expone sus rutas internas.

### Comprobación del backend personal

1. GET events debe devolver 200 con un array vacío si la cuenta es nueva.
2. Crea un día sin hora con el ejemplo de Swagger: 201 y campos temporales null
   excepto `on_date`. Consulta después el listado para comprobar persistencia.
3. Edita el mismo ID con `{ "on_date": null, "started_at": "2026-11-25T10:00:00+01:00" }`:
   debe conservar ID y devolver el instante UTC, sin final.
4. Añade `{ "duration_minutes": 30, "people": ["Ana"] }`: comprueba el final
   calculado. Repetir la misma edición conserva `updated_at`.
5. Prueba volver a día sin hora dejando una duración: 422. Vuelve correctamente
   enviando día y borrando inicio y duración con null en la misma petición.
6. Marca `completed` o `cancelled`; sigue visible. Retira: 204, listado normal
   vacío y exportación con el mismo ID y su retirada. Repite DELETE: 204.
7. Comprueba el sobre v1 en GET activities/export, sin datos de cuenta ni token.

La validación local incluye compilación, lint, formato, contrato temporal y
esquemas Swagger sin escuchar en un puerto ni acceder a bases reales. La suite
PostgreSQL contiene tres escenarios para ciclo de vida, aislamiento/autenticación
y restricciones. Se incluye en CI; no se da por ejecutada localmente. El agente
no ha utilizado Docker ni leído `.env`.

El 23/11/2026 el usuario aplicó las migraciones, arrancó Personal, preparó la
cuenta y confirmó GET 200 con un array vacío en Swagger. Después confirmó que
el recorrido funcional propuesto funciona, indicando que no realizó las últimas
comprobaciones. Se registra validación manual funcional del backend; las pruebas
finales de autenticación y paginación y el aislamiento entre dos cuentas no se
dan por comprobados manualmente. La ejecución de la suite PostgreSQL en CI
sigue pendiente de confirmar para este checkpoint.

Todavía no se habilita este tipo en Sync, ni se implementa su interfaz o su
política de recordatorios.

## Identidad y actualizaciones

Cada fuente debe ofrecer identificadores estables y recursos autorizados por
cuenta o credencial. Synkron obtiene el propietario del acceso comprobado y la
procedencia de la conexión. No acepta un propietario elegido libremente en el
cuerpo de una petición.

Los recursos deben poder distinguirse por fuente y colección o tipo, incluso si
un examen y una entrega comparten el mismo ID externo. Cambiar la fecha de un
plan o añadir una nota modifica el registro original. La siguiente sincronización
actualiza su representación central, sin crear otra actividad.

Los cambios se detectan durante revisiones solicitadas manualmente al principio.
No se requiere notificación inmediata desde las fuentes mediante webhooks. La
información de versión o última modificación y las huellas del contenido se
concretarán con el contrato de lectura y de comparación.

## Representación común y vista

Los campos de origen, la representación central y la vista son contratos
distintos. Sync conservará una parte común para identificar y situar la actividad
en el tiempo y su procedencia mediante columnas comunes, y los detalles necesarios
de cada tipo en `details` JSONB con validación específica, según
[ADR-009](decisiones.md#adr-009-modelo-híbrido-de-actividades). La parte común y las
reglas temporales figuran en [Modelo de actividades](modelo-actividades.md).
Los detalles de cada tipo, sus relaciones y los filtros todavía deben cerrarse.

El calendario mostrará juntas las actividades autorizadas del usuario y permitirá
consultar su detalle. Para el contenido académico se contempla resumir título,
abreviatura de asignatura y hora, con color para estado e intensidad para
obligatoriedad. La paleta y la presentación concreta siguen pendientes. La vista
no sustituye los campos semánticos ni elimina los detalles del input.

Los formularios de entrada alimentarán las fuentes mediante un backend
autorizado. El calendario inicial será de consulta y leerá la colección central
mediante la API de Synkron, sin necesitar contactar con cada fuente al abrirlo.

## Decisiones por cerrar antes de cada implementación

- Campos obligatorios, tipos y estados de cada recurso, sin cambiar el alcance
  funcional ya descrito.
- Escala de notas y base de ponderaciones; guardar o no fecha de publicación e
  historial de correcciones.
- Unidades de distancia, duración y planificación de las disciplinas deportivas
  restantes; gimnasio ya utiliza minutos y admite sesiones futuras y realizadas.
- Ampliaciones posteriores del bloque Otros; su contrato inicial ya está acordado.
- Identidades entre colecciones, relaciones y mapeos al modelo central; política
  si varias configuraciones importan el mismo recurso.
- Fechas sin hora, instantes con zona y duración sin valores redundantes.
- Contratos y permisos concretos de creación, modificación y lectura de fuentes.

Estas decisiones no implican que las fuentes o el calendario estén implementados.
