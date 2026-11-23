# Primer recorrido deportivo: gimnasio

Contrato de producto acordado el 23/11/2026. El backend de la fuente deportiva
está implementado en `apps/sport`; quedan la interfaz y la integración con Sync.
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
3. **Interfaz de la fuente.** Formulario sencillo con los campos acordados,
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
