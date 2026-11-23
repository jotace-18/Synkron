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
de backend, interfaz e integración central; el recorrido conjunto queda pendiente. `apps/sport` incorpora la API de gimnasio con
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
El backend está implementado en `apps/personal` y su interfaz en `apps/personal-web`;
el esquema central está habilitado en Sync con la migración 015. Puede representar ir a comprar,
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
un intervalo. El tipo central es `personal.event` con rol `start` y
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

El esquema de este tipo está habilitado en Sync con la migración 015. No se
implementa una política de recordatorios para Otros. La interfaz de origen se
describe a continuación.

### Interfaz de Otros

`apps/personal-web` mantiene la estructura de Campus y Sport con identidad rosa y ciruela,
barra lateral propia y formulario en dos columnas en escritorio. Se adapta a una
columna en pantallas estrechas y conserva la tabla dentro de un área desplazable.

El formulario permite asunto, día obligatorio, hora opcional, duración opcional,
estado y personas (un nombre por línea, hasta 50). Muestra una vista previa del
día, horario y final. La duración solo se habilita cuando hay hora; al quitarla,
se elimina también la duración. La edición envía los cambios y las anulaciones
temporales necesarias en el mismo PATCH. No inventa horas para días sin hora ni
cambia los segundos o milisegundos de un instante original si no se edita su hora.

El listado ofrece páginas de 20 compromisos, con consulta adicional para saber
si existe página siguiente. Permite editar, marcar realizado mediante el editor,
cancelar y retirar con confirmación. Hay estados de carga, lista vacía, error y
reintento, bloqueo de acciones durante escrituras y recuperación del foco.

Una respuesta incierta de escritura obliga a comprobar la lista antes de volver
a intentarlo; no se reenvían creaciones automáticamente. El usuario distingue
cancelación, que conserva el compromiso visible, de retirada, que lo oculta.

Con Personal migrado y la cuenta ya preparada, desde la raíz:

```bash
npm --prefix apps/personal-web ci
docker compose up -d --build --wait personal-web
```

Abre `http://127.0.0.1:3107` o `http://localhost:3107`. Se reutiliza
`PERSONAL_DEMO_TOKEN` de la raíz, sin otra credencial. Nginx añade el Bearer en el
servidor, elimina cookies y restringe las escrituras al origen de esta interfaz.
Solo se reenvía `/api/v1/events`; los demás caminos `/api/` devuelven 404. El token
no se incorpora al JavaScript del navegador.

Para desarrollo con Vite y el backend Personal arrancado:

```bash
npm --prefix apps/personal-web run dev
```

Vite escucha en `http://127.0.0.1:5176` y reenvía a `127.0.0.1:3106`. La credencial
se lee solo para el servidor de desarrollo; la compilación no carga el `.env`
de la raíz. El preview de Vite no configura este proxy autenticado.

El usuario aprobó la apariencia rosa/ciruela y confirmó el alta de un compromiso
sin hora. La edición y las siguientes acciones se comprobarán junto a Synkron:


1. Crear un compromiso con asunto y día sin hora; recargar y comprobar persistencia.
2. Editar para añadir hora y comprobar la vista previa y el listado en Madrid.
3. Añadir duración y dos personas; comprobar el final y conservar el mismo ID.
4. Quitar la hora: debe limpiarse la duración y volver a mostrar «Sin hora».
5. Marcar realizado o cancelar: el compromiso sigue visible con su estado.
6. Retirar y confirmar: desaparece del listado. Comprobar también Volver y Escape
   en el diálogo para no ejecutar la retirada.
7. Probar una hora inexistente por cambio de horario y un nombre demasiado largo.
8. Revisar formulario en pantalla estrecha y paginación si hay más de 20 registros.

La compilación, lint y cuatro pruebas de formulario, reloj, paginación y cliente
HTTP se verifican localmente sin arrancar servicios. La imagen y `nginx -t` están
incluidos en CI. El usuario confirmó el arranque y la apariencia en su navegador;
la validación local del agente no acredita el recorrido manual completo. El punto 4 implementa su integración con Synkron;
el punto 5 implementa el detalle de personas/duración y las reglas guiadas.
El usuario confirma la presentación y da por válidos los chequeos finales de Otros.

### Conectar Otros con Synkron

La integración utiliza `standard.activities`, sin un conector específico de
Personal ni nuevas dependencias. Reutiliza `PERSONAL_DEMO_TOKEN` para la lectura
por cuenta; no se configura otro token si se utiliza este recorrido. La recepción
directa por POST sigue disponible con su propio IngestionToken y la misma
validación, pero no hay que configurar ambos recorridos para los mismos datos.

Con las bases migradas de las fuentes y sus cuentas ya preparadas:

```bash
docker compose up -d --wait sync-db personal-db
docker compose build personal sync sync-worker sync-publisher sync-event-publisher web
docker compose run --rm --no-deps \
  --volume "$PWD/apps/sync:/app" sync npm run migrate:up
docker compose up -d personal personal-web api rabbitmq academic sport \
  sync sync-worker sync-publisher sync-event-publisher \
  monitoring monitoring-consumer automation web gateway
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

La migración nueva es **015_add_personal_event** de Sync. No hay otra migración
de Personal para este paso. Compose añade el origen interno Personal a la lista
autorizada en Sync y el worker, conservando los orígenes configurados; no es
necesario editar el `.env` existente para añadir este origen.

1. Entra en `https://localhost:8443`, Mi agenda → Conectar una fuente externa.
2. Selecciona **Otros (Personal)**. Se preparan nombre, conector
   `standard.activities` y URL `http://personal:3000/api/v1/activities/export`.
3. Introduce tu credencial personal, sin compartirla ni publicarla en el chat,
   y conecta. Se guarda cifrada; un reintento de la misma configuración devuelve
   la misma conexión y definición. No se reactiva ni sobrescribe una conexión
   existente con otra credencial.
4. Crea un compromiso desde `http://localhost:3107` y pulsa **Sincronizar todo**
   en Synkron. Puedes seleccionar solo Otros para aislar su resultado durante
   una comprobación. Los demás orígenes conservan ejecuciones independientes.
5. Comprueba el título y la fecha en calendario y la ejecución en Monitoring.
   Sin cambios, repetir debe conservar ID y no duplicar actividades. Editar,
   cancelar y retirar se reflejan en la misma identidad central.

La conexión de una fuente no la consulta hasta solicitar la sincronización.
Si Personal está apagado o rechaza su Bearer, la ejecución falla de manera
visible y las otras fuentes del lote siguen su recorrido.

Se han añadido pruebas locales del contrato de los tres horarios, límites de
personas, restricción por fuente y rechazo del alias histórico. La suite CI
`personal-import.e2e-spec.ts` prepara conexión por cuenta y verifica el ciclo con
worker y persistencia reales y un lector simulado, incluyendo cancelación,
retirada, validación completa antes de escribir, aislamiento y eventos normales.
La suite de ingesta HTTP añade recepción directa con credencial de tipo limitado
a Personal y repetición idempotente. Esas suites PostgreSQL no se han ejecutado
localmente desde el agente. El usuario validó el recorrido conjunto el 23/11/2026: conexión de Otros,
aparición en calendario de un intervalo de 10:00 a 10:30, repetición sin duplicados,
edición a «Compra semanal» con final a las 10:45, vuelta a día sin hora y
cancelación visible en gris y tachada. Confirmó después una retirada en el
resultado de Monitoring. Esto no acredita la ejecución local de las suites
PostgreSQL ni la comprobación manual de aislamiento entre dos cuentas.

El punto 4 incluye la identificación básica «Otros» y el filtro del bloque. El
punto 5 añade la presentación completa y las plantillas por eventos descritas
a continuación. No se generan recordatorios para compromisos personales.

### Presentación y avisos de Otros en Synkron

El detalle central presenta **Duración** calculada del intervalo (sin otro campo
redundante) y **Personas**, con los nombres sincronizados. Un día o instante sin
intervalo muestra «Sin duración indicada»; una lista vacía muestra «Sin personas
indicadas», sin asumir que el compromiso es individual.

Otros pendiente utiliza rosa en el calendario, acorde a su interfaz de origen.
Realizado conserva el verde y cancelado el gris/tachado. El tipo y el estado se
indican también como texto en detalle y listado. La agenda conserva título,
sigla académica cuando existe y hora en las filas compactas del mes.

En la vista **Agenda**, el filtro **Otros** ofrece Cualquier estado, Pendientes,
Realizados y Cancelados.
Al cambiar de categoría se conserva el filtro de estado solo si es válido para
la nueva selección. En Todos los tipos, Pendientes reúne los estados pending;
No entregadas sigue limitado a entregas pendientes o en curso. Las opciones de
asignatura permanecen específicas del bloque académico.

En Automation hay seis nuevas plantillas, filtradas por `personal.event`:

- Alta o retirada de un compromiso de Otros.
- Cambio de asunto.
- Cambio de fecha, hora o duración (campo canónico `schedule`).
- Cambio de estado.
- Cambio de personas.

Las reglas se evalúan al sincronizar cambios; no constituyen una política de
recordatorios previos ni se activan automáticamente. Monitoring presenta los
campos Personas, Asunto, Fecha/hora/duración y Retirada con nombres legibles.
Los avisos reutilizan la bandeja y el enlace a la actividad existente.

Este punto modifica solo la web central; no requiere otra migración, token ni
reconstrucción de los backends. Con el recorrido de sincronización ya arrancado:

```bash
docker compose up -d --build --wait web
```

Recarga `https://localhost:8443` con Ctrl+Shift+R. Comprueba un compromiso activo
con 45 minutos y personas para ver ambos campos; un registro retirado ya no está
en el calendario. Verifica también un día sin hora, los tres estados y los
filtros. El usuario confirma la presentación y acepta las comprobaciones finales
el 23/11/2026; los siguientes pasos quedan como guía de reproducción.

Para probar un aviso, mantén los consumidores y el despachador activos:

```bash
docker compose up -d automation-consumer automation-notifications \
  monitoring monitoring-consumer
```

Primero crea y sincroniza un compromiso. Después crea una regla **Cambian las
personas de un compromiso de Otros**, con acción Avisar y un mensaje de prueba.
Actívala explícitamente, cambia las personas de ese compromiso en la fuente y
pulsa Sincronizar todo. Actualiza Avisos después de unos segundos: debe aparecer
el mensaje con enlace al compromiso. Repetir sin cambios no debe producir otro
aviso. Pausa la regla al terminar la prueba si no quieres conservarla activa.

La suite local de web cubre el detalle, la convivencia de filtros y la conversión
de las seis plantillas a condiciones y su posterior edición, junto a la regresión
académica/deportiva. No se ha arrancado Docker ni se han creado reglas reales
desde el agente para acreditar la comprobación manual.

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


## Ajustes comunes y aceptación de Otros (23/11/2026)

El usuario confirma la presentación y da por válidos los chequeos finales de
Otros. Se registra su aceptación; no se atribuye al agente la ejecución de las
pruebas manuales restantes. Quedan el checkpoint y su confirmación en CI.

La sincronización manual selecciona bloques: **Académico**, **Deporte** y
**Otros**, además de **Sincronizar todo**. Académico incluye todas sus
definiciones habilitadas, tanto entregas como exámenes. Cada bloque muestra un
resultado agregado y permite desplegar las ejecuciones individuales para revisar
fallos. Los reintentos conservan las claves y solicitudes ya aceptadas.

La clasificación utiliza los conectores académicos y las URL canónicas de las
fuentes Sport y Personal registradas, sin depender de sus nombres. Otras fuentes
canónicas permanecen en **Otras fuentes** y en Sincronizar todo. Las programaciones
y acciones de reglas mantienen su definición explícita guardada.

Las tarjetas de la agenda y el detalle distinguen Académico en violeta, Deporte
en naranja y Otros en rosa. Se conservan los colores semánticos de los estados,
incluidos completado en verde y cancelado en gris. El calendario mensual,
semanal y diario ordena primero por hora de inicio y deja al final las actividades
sin hora, con desempate estable por título e identidad.
