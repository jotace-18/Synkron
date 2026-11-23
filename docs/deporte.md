# Primer recorrido deportivo: gimnasio

Contrato de producto acordado el 23/11/2026. El backend de la fuente deportiva
está implementado en `apps/sport` y su interfaz en `apps/sport-web`; queda la
integración con Sync.
El esquema `sport.gym` todavía no está habilitado en la entrada común.

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

Se habilitará `sport.gym` con `schedule.kind=interval` y `schedule.role=start`.
El comienzo y el final se comunican como instantes con zona y se normalizan a
UTC; `schedule.date` es null. La duración visible se obtiene de ese intervalo,
sin mantener otro valor central independiente que pueda contradecirlo.

Los estados serán `scheduled`, `completed` y `cancelled`. Los detalles conservarán
la modalidad y la selección solo/acompañado. El origen utiliza `started_at`, `duration_minutes`, `training_mode`, `accompanied`
y `status`. Los detalles centrales previstos son `training_mode` y `accompanied`;
la duración se obtiene del intervalo. La API de origen está documentada en
[Swagger](swagger.md), seleccionando «Deporte · fuente externa».

La identidad sigue siendo cuenta, conexión, colección e identificador externo.
La fuente utilizará la recepción autenticada de actividades: la cuenta y la
procedencia vendrán de su credencial y no del cuerpo JSON. Las credenciales se
mantendrán en el backend de la fuente, fuera del navegador.

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
4. **Integración con la entrada estandarizada.** Registrar el esquema de
   `sport.gym`, permitirlo en las fuentes de entrada, conectar el envío de la
   fuente deportiva y actualizar ejemplos y Swagger. Reutilizar worker,
   idempotencia, persistencia y eventos existentes.
5. **Presentación y seguimiento en Synkron.** Calendario, filtros y detalle con
   modalidad, duración y compañía. Reutilizar Monitoring y las reglas por
   eventos. Los recordatorios actuales son académicos: los avisos previos para
   gimnasio requieren acordar su política y no se añaden implícitamente.
6. **Comprobación y cierre.** Recorrido de alta, edición, repetición sin duplicado,
   cancelación y retirada; comprobar aislamiento entre cuentas. Añadir solo las
   pruebas necesarias para las nuevas reglas y realizar la comprobación real
   del recorrido. Actualizar la guía de arranque y dejar un checkpoint.

Después de este recorrido se priorizan planes sociales, antes de ampliar todas
las disciplinas deportivas o las actividades académicas pendientes.

## Comprobación del backend

El [arranque del backend](#arranque-del-backend) utiliza las variables `SPORT_*`,
sus migraciones y una cuenta deportiva propia. Esta fase no conecta todavía
sesiones con el calendario de Synkron.

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

Este frontend mantiene sesiones en la fuente deportiva. Su publicación en Sync
y su aparición en el calendario pertenecen a los siguientes subpuntos. El usuario confirmó el 23/11/2026 que la interfaz se abre en el entorno local y
aprobó su aspecto visual. Las pruebas de creación, recarga, edición, cancelación
y retirada desde esta interfaz aún no se han confirmado; la validación previa
del backend desde Swagger y las cuatro pruebas automatizadas del frontend no
se registran como sustituto de ese recorrido.
