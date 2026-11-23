# Primer recorrido deportivo: gimnasio

Contrato de producto acordado el 23/11/2026. El backend de la fuente deportiva
está implementado en `apps/sport` y su interfaz en `apps/sport-web`. La integración
con Sync y el esquema común `sport.gym` están implementados. El usuario validó
el recorrido real Sport → Sync → calendario → Monitoring el 23/11/2026, tras
reconstruir los servicios y aplicar la migración 014.

## Datos y comportamiento acordados

| Dato | Regla |
|---|---|
| Fecha y hora | Inicio obligatorio, introducido en horario de Madrid. |
| Duración | Minutos enteros positivos; el final se calcula a partir del inicio. |
| Modalidad | Push, pull, leg, upper, lower u otros. |
| Compañía | Solo o acompañado, sin nombres. |
| Estado | Programado, realizado o cancelado; admite sesiones futuras y pasadas. |
| Título | Automático según la modalidad: «Gimnasio · Push», por ejemplo. |

La sesión conserva su identificador al editarla. Cancelar mantiene el registro;
retirar comunica una baja explícita. Las sesiones no se marcan realizadas
solo porque haya pasado su hora. No se incorporan métricas de ejercicios,
cronómetro, planificación automática ni integraciones con Hevy o Strava.

## Representación en la entrada común

Se habilita `sport.gym` con `schedule.kind=interval` y `schedule.role=start`.
El comienzo y el final se comunican como instantes con zona y se normalizan a
UTC; `schedule.date` es null. La duración visible se obtiene de ese intervalo,
sin mantener otro valor central independiente que pueda contradecirlo.

Los estados son `scheduled`, `completed` y `cancelled`. Los detalles conservarán
la modalidad y la selección solo/acompañado. El origen utiliza `started_at`, `duration_minutes`, `training_mode`, `accompanied`
y `status`. Los detalles centrales son `training_mode` y `accompanied`;
la duración se obtiene del intervalo. La API de origen está documentada en
[Swagger](swagger.md), seleccionando «Deporte · fuente externa».

La identidad sigue siendo cuenta, conexión, colección e identificador externo.
Sport expone operaciones canónicas por HTTP y Sync las consulta con el conector
genérico `standard.activities`. La cuenta deportiva procede de SportBearer;
la cuenta Synkron y la conexión proceden de la sesión y la configuración de Sync,
nunca del JSON de la actividad. El mismo esquema también admite recepción directa
por POST con IngestionToken, sin un endpoint diferente para gimnasio.

## Subpuntos de trabajo

1. **Contrato de producto — completado.** Datos, modalidad, compañía, estados,
   título automático y representación temporal acordados.
2. **Backend de la fuente deportiva — completado y validado manualmente.**
   Persistencia y API autorizada para crear,
   consultar, editar y retirar sesiones. Calcular el final y mantener los IDs.
   Documentar sus operaciones en Swagger.
3. **Interfaz de la fuente — implementada y aspecto visual aprobado.**
   Formulario sencillo con los campos acordados,
   listado y acciones de edición/retirada, con identidad visual propia de una
   aplicación externa.
4. **Integración con la entrada estandarizada — implementada.** Registrar el esquema de
   `sport.gym`, permitirlo en las fuentes de entrada, conectar la exportación canónica de la
   fuente deportiva y actualizar ejemplos y Swagger. Reutilizar worker,
   idempotencia, persistencia y eventos existentes.
5. **Presentación y seguimiento en Synkron — implementados.** Calendario, filtros y detalle con
   modalidad, duración y compañía. Reutilizar Monitoring y las reglas por
   eventos. Los recordatorios actuales son académicos: los avisos previos para
   gimnasio requieren acordar su política y no se añaden implícitamente.
6. **Comprobación y cierre — recorrido real validado; aislamiento automatizado pendiente de CI.** Recorrido de alta, edición, repetición sin duplicado,
   cancelación y retirada; comprobar aislamiento entre cuentas. Añadir solo las
   pruebas necesarias para las nuevas reglas y realizar la comprobación real
   del recorrido. Actualizar la guía de arranque y dejar un checkpoint.

Después de este recorrido se prioriza el bloque **Otros** para recados, citas y
quedadas (US-25), antes de ampliar todas las disciplinas deportivas o las
actividades académicas pendientes.

## Comprobación del backend

El [arranque del backend](#arranque-del-backend) utiliza las variables `SPORT_*`,
sus migraciones y una cuenta deportiva propia. La integración central requiere
además la configuración de la fuente descrita más adelante.

Validación manual confirmada el 23/11/2026 desde Swagger por HTTPS: migraciones
aplicadas, cuenta deportiva habilitada, listado inicial vacío (`200`), creación
(`201`) con título e intervalo UTC calculados, edición (`200`) conservando ID y
recalculando el final, cancelación visible y retirada (`204`) oculta en el listado
y conservada en export con `deleted_at`. El usuario confirmó el resultado de las
pruebas manuales. La suite HTTP/PostgreSQL automatizada y su escenario de dos
cuentas no se dan por ejecutados en local con esta confirmación.

## Arranque del backend

Copia el bloque `SPORT_*` de [`.env.example`](../.env.example) a tu `.env`. Genera
valores distintos con `openssl rand -hex 32` para las dos contraseñas de base de
datos y para `SPORT_DEMO_TOKEN`. Desde la raíz del repositorio:

```bash
npm --prefix apps/sport ci
docker compose up -d --wait sport-db
docker compose build sport
docker compose run --rm --no-deps \
  --volume "$PWD/apps/sport:/app" sport npm run migrate:up
docker compose up -d --wait sport
```

Prepara la cuenta sin imprimir el token:

```bash
set -o pipefail
node --env-file=.env -e 'process.stdout.write(process.env.SPORT_DEMO_TOKEN ?? "")' \
  | docker compose exec -T sport npm run account:demo
```

Repetir la preparación conserva la cuenta y no reactiva una cuenta deshabilitada.
El backend escucha en `http://127.0.0.1:3104`; `/healthz` comprueba PostgreSQL.
Para disponer del selector actualizado y las rutas nuevas del gateway:

```bash
docker compose up -d --build sync
docker compose up -d gateway
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

En `https://localhost:8443/api/docs`, selecciona «Deporte · fuente externa» y
autoriza `SportBearer` con el token deportivo, sin el prefijo `Bearer`. Las seis
operaciones de gimnasio y sus ejemplos están documentados allí. La fecha y hora
se envían en `started_at` con zona explícita; `duration_minutes` es un entero
positivo, `training_mode` utiliza `other` para Otros y `accompanied` es booleano.
Título y final se calculan automáticamente.

## Interfaz deportiva

La aplicación `apps/sport-web` utiliza la estructura de Campus con una paleta
terracota/naranja y una identidad deportiva propia. Ofrece formulario en dos
columnas, título y final calculados en la vista previa, listado paginado, edición
y confirmaciones separadas para cancelar y retirar. Todos los horarios se
introducen y muestran en Madrid. La edición conserva un instante original con
segundos o milisegundos cuando no se cambia la fecha/hora.

Las respuestas inciertas de escritura piden comprobar la lista antes de repetir
la operación; no se reenvían creaciones automáticamente. Hay estados de carga,
lista vacía, error y reintento, y el diseño se adapta a pantallas estrechas.

### Arranque de la interfaz

Reutiliza `SPORT_DEMO_TOKEN` del `.env` de la raíz; no requiere otra credencial.
Con la base migrada y la cuenta deportiva preparada:

```bash
npm --prefix apps/sport-web ci
docker compose up -d --build --wait sport-web
```

Abre `http://127.0.0.1:3105` o `http://localhost:3105`. Compose levanta Sport y su
base si están parados. Nginx añade el Bearer al reenviar las peticiones; el token
no se incorpora al JavaScript ni se introduce en la interfaz. La configuración
local restringe las escrituras al origen de esta aplicación.

Para desarrollo con Vite, mantén `sport` arrancado y ejecuta:

```bash
npm --prefix apps/sport-web run dev
```

La dirección de desarrollo es `http://127.0.0.1:5175`. Solo el servidor Vite de
desarrollo lee la credencial; la compilación no carga el `.env` de la raíz.

### Comprobación manual de la interfaz

1. Crea un entrenamiento e identifica el título, horario y duración calculados.
2. Recarga y comprueba que la sesión persiste en el listado.
3. Edita la duración, modalidad o compañía y comprueba que se conserva la sesión.
4. Cancela desde la fila y confirma: la sesión debe seguir visible como Cancelado.
5. Retira desde la fila y confirma: la sesión debe desaparecer del listado.
6. Prueba una hora inexistente por cambio de horario y una duración inválida.
7. Comprueba formulario y listado en una pantalla estrecha. Si tienes más de
   veinte sesiones, comprueba también la paginación.

Este frontend mantiene sesiones en la fuente deportiva. Los cambios se incorporan
a Synkron cuando se consulta su exportación canónica con «Sincronizar todo» o una
sincronización individual/programada. El usuario confirmó el 23/11/2026 que la interfaz se abre en el entorno local y
aprobó su aspecto visual. Posteriormente confirmó creación, edición, cancelación
y retirada desde Sport y su reflejo en Synkron. La recarga, validación temporal,
pantalla estrecha y paginación no se registran como comprobaciones manuales
completadas con esa confirmación.


## Conectar gimnasio con Synkron

No requiere nuevas dependencias, contraseñas ni otro token: reutiliza tu
`SPORT_DEMO_TOKEN`. No publiques ese valor en el repositorio ni en una conversación.
La aplicación deportiva conserva su cuenta independiente de la cuenta Synkron.

Desde la raíz, con las variables existentes configuradas:

```bash
docker compose up -d --wait sync-db sport-db
docker compose build sync sync-worker sync-publisher sync-event-publisher sport web
docker compose run --rm --no-deps \
  --volume "$PWD/apps/sync:/app" sync npm run migrate:up
docker compose up -d api rabbitmq academic sport sync sync-publisher sync-worker sync-event-publisher web gateway
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

Si quieres ver también Monitoring y ejecutar reglas, mantén sus servicios ya
configurados (`monitoring`, `monitoring-consumer`, `automation` y los procesos
Automation que utilices). No es necesario activar recordatorios académicos para
sincronizar gimnasio. La nueva integración no necesita otra preparación RabbitMQ.

1. Inicia sesión en `https://localhost:8443` y abre **Mi agenda**.
2. Despliega **Conectar una fuente externa**. Los valores iniciales son
   `standard.activities` y `http://sport:3000/api/v1/activities/export`.
3. Introduce tu credencial deportiva en el campo de contraseña y pulsa
   **Conectar fuente**. Se crean conexión y definición en una transacción; la
   credencial se guarda cifrada y no se devuelve. El campo de credencial se vacía al guardar.
   Conectar no consulta todavía el origen: los errores de lectura/autorización
   se presentan al sincronizar. Una credencial distinta para una fuente ya creada
   devuelve conflicto para evitar cambiar de cuenta de origen silenciosamente;
   la gestión de rotación de credenciales queda fuera de este formulario.
4. Crea una sesión en Sport si no tienes sesiones activas. Pulsa **Sincronizar
   todo**, seleccionado por defecto. También puedes elegir solo gimnasio.
5. Comprueba su intervalo, modalidad, duración y compañía en el detalle central.
   Un gimnasio programado se distingue en naranja; realizado en verde y cancelado
   en gris. El filtro Deporte permite seleccionar esos tres estados.
6. Repite sin cambios: debe conservar ID y no duplicar la sesión. Edita duración,
   modalidad o compañía en Sport y sincroniza: cambia la misma actividad.
7. Cancela y sincroniza: permanece visible cancelada. Retira y sincroniza:
   desaparece del calendario. En Monitoring aparecen los resultados y los eventos
   normales de esa definición.

### Contrato de lectura reutilizable

`GET /api/v1/activities/export` requiere SportBearer y devuelve un array paginado
con `limit` y `offset`. Cada elemento tiene el mismo sobre v1 de la entrada
estandarizada: `upsert` completo o `retire` explícito. El identificador es
`gym_sessions:<id>`; la colección central es `activities`. El prefijo evita
colisiones al incorporar otras disciplinas al mismo endpoint.

El conector `standard.activities` sirve para cualquier fuente que ofrezca ese
contrato. No contiene reglas de gimnasio ni mapea tablas de Sport. Lee páginas
con 20 registros, máximo 100 páginas y 64 KiB por página, timeout de tres segundos
por petición, sin seguir redirecciones y solo hacia orígenes autorizados. Valida
la exportación completa antes de comenzar a guardar; un ID repetido invalida la
lectura. Una ausencia en la exportación no implica retirada. El listado usa el
orden estable de Sport; los cambios concurrentes durante la paginación pueden
requerir una segunda sincronización para converger, sin inferir bajas.

Compose autoriza explícitamente `http://sport:3000` tanto en Sync como en su
worker, junto a los orígenes configurados. Otros orígenes necesitan autorización
explícita. La entrada directa por POST sigue disponible; no mezcles mecanismos
con procedencias distintas para una misma cuenta externa si quieres evitar
representaciones duplicadas.

### Alcance de «Sincronizar todo»

Consulta todas las definiciones de lectura habilitadas de la cuenta. Cada fuente
conserva su ejecución, resultado y clave de idempotencia; un fallo no bloquea las
demás. Si no se confirma una solicitud, **Reintentar pendientes** conserva su
clave y no vuelve a solicitar las fuentes ya aceptadas. Los fallos de consulta
de estado se recuperan con **Volver a consultar**. No descubre servicios ni
credenciales por sí solo. Las fuentes de recepción directa ya reciben operaciones
por POST y no representan un origen consultable por este botón.

Monitoring, eventos y programaciones reutilizan el recorrido existente. La interfaz de reglas
ofrece plantillas de alta, retirada, cambio de horario/duración y cambio de estado
de gimnasio, filtradas por `payload.activity_type == sport.gym`, junto a las
plantillas académicas existentes. Los avisos previos
de gimnasio necesitan acordar su política y no se activan implícitamente.

### Validación de esta integración

Las comprobaciones locales cubren compilación, lint, pruebas con dependencias
simuladas, contrato canónico, límites del lector, aislamiento del lote ante
fallos y reintentos idempotentes. `test/gym-import.e2e-spec.ts` añade la comprobación
PostgreSQL de conexión concurrente, cifrado, separación de cuentas y ciclo de vida
con el worker/pipeline reales y un lector simulado; se ejecuta con la suite CI.
El agente no ejecutó PostgreSQL/HTTP real durante la implementación. El usuario
reconstruyó después los servicios, aplicó las migraciones y confirmó en su entorno:

- Conexión de Sport desde Synkron y ejecución de «Sincronizar todo».
- Alta de un entrenamiento programado para el miércoles y aparición en calendario.
- Repetición sin duplicados; edición a 75 minutos y acompañado sobre la misma actividad.
- Cancelación visible en gris y retirada que desaparece del calendario.
- Seguimiento en Monitoring: ejecución completada con dos registros leídos,
  uno sin cambios y uno retirado, y el evento de retirada relacionado.

Esta validación manual corresponde al 23/11/2026. No acredita la ejecución local
de la suite PostgreSQL, el escenario de dos cuentas, las reglas de aviso nuevas
ni los fallos simulados del lote; esos escenarios conservan sus pruebas y su
validación automatizada pendiente de CI.
