# Servicio académico

Agenda académica de origen de Synkron, con NestJS y PostgreSQL. La API de entregas
permite crear, consultar, editar todos sus datos y eliminar registros conservando
una marca para sincronizar el borrado. Exámenes, sesiones de trabajo, eventos
generales y formularios de entrada se incorporarán después.

## Preparación local

Desde la raíz de Synkron, usa la versión de Node de `.nvmrc`, instala dependencias
y configura las variables `ACADEMIC_DB_*` de `.env.example` en `.env`.

```bash
npm --prefix apps/academic ci
docker compose up -d --wait academic-db
docker compose run --rm --no-deps \
  --volume "$PWD/apps/academic:/app" \
  academic npm run migrate:up
docker compose up -d --build --wait academic
curl -i http://127.0.0.1:3101/healthz
```

Las migraciones se aplican antes de arrancar la versión nueva. PostgreSQL tiene
esquema `academic`, volumen persistente, red privada y usuario de aplicación.
El healthcheck devuelve `200` con `database: "up"`, o `503` si la conexión falla.

## Cuenta de demostración

Genera una credencial con `openssl rand -hex 32` y guárdala en `.env` como
`ACADEMIC_DEMO_TOKEN`; el marcador de `.env.example` es ficticio. Es una credencial
de la cuenta académica, distinta de la sesión de Synkron. El servidor guarda
únicamente su SHA-256 y rechaza cuentas deshabilitadas con el mismo `401` que una
credencial desconocida. El token no se devuelve en las respuestas.

Este comando crea la cuenta desde la raíz del repositorio. Repetirlo con el mismo
token conserva el ID y no reactiva una cuenta deshabilitada:

```bash
set -o pipefail
node --env-file=.env <<'NODE' | docker compose exec -T academic-db sh -c 'PGPASSWORD="$ACADEMIC_DB_PASSWORD" psql -h 127.0.0.1 -P pager=off -U "$ACADEMIC_DB_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
const { createHash } = require('node:crypto');
const token = process.env.ACADEMIC_DEMO_TOKEN;
if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
  throw new Error('ACADEMIC_DEMO_TOKEN debe contener 64 caracteres hexadecimales');
}
const hash = createHash('sha256').update(token).digest('hex');
process.stdout.write(`
  INSERT INTO academic.accounts (name, token_hash)
  VALUES ('Cuenta académica de demostración', '${hash}')
  ON CONFLICT (token_hash)
  DO UPDATE SET token_hash = EXCLUDED.token_hash
  RETURNING id, name, enabled;
`);
NODE
```

Las rutas de datos exigen `Authorization: Bearer <token>`; `/healthz` es público.

## Rutas de entregas

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/v1/assignments` | `201` con la entrega creada. |
| `GET` | `/api/v1/assignments` | `200`, array paginado de entregas activas propias. |
| `GET` | `/api/v1/assignments/export` | `200`, array paginado que incluye las marcas de borrado propias. |
| `GET` | `/api/v1/assignments/:id` | `200` con el detalle activo propio. |
| `PATCH` | `/api/v1/assignments/:id` | `200` con la entrega actualizada. |
| `DELETE` | `/api/v1/assignments/:id` | `204`, sin cuerpo. |

Listados y exportación aceptan `limit` entre 1 y 50 (20 por defecto) y `offset`
entre 0 y `Number.MAX_SAFE_INTEGER` (0 por defecto). Ordenan por
`created_at DESC, id DESC`, filtran por cuenta antes de paginar y devuelven `[]`
al superar el último resultado. No mantienen una instantánea entre peticiones;
las inserciones concurrentes pueden desplazar páginas.

Las respuestas correctas llevan `Cache-Control: no-store`. Los IDs deben ser
UUID v4. Un ID o datos inválidos producen `422`; una entrega ajena e inexistente
devuelven el mismo `404`. El propietario procede del guard. No se admiten
`account_id`, `id`, `created_at`, `updated_at` o `deleted_at` en el cuerpo.

## Campos y reglas

| Campo | Regla |
|---|---|
| `title` | Obligatorio; texto no vacío, máximo 200 caracteres. |
| `course_name` | Obligatorio; máximo 150 caracteres. |
| `course_abbreviation` | Opcional, máximo 20 caracteres; `null` si se desconoce. |
| `section` | `theory`, `practice` o `seminar`. |
| `mandatory` | Booleano real. |
| `due_date` / `due_at` | Exclusivamente fecha `YYYY-MM-DD` o instante ISO con zona explícita. |
| `status` | `pending`, `in_progress` o `submitted`; creación por defecto `pending`. |
| `work_mode` | `individual` o `group`; creación por defecto `individual`. |
| `group_members` | Nombres opcionales para grupos; lista vacía para individual; por defecto `[]`. |
| `weight_percent` / `weight_basis` | Porcentaje 0–100 y referencia `course` o `section`, o ambos `null`. |
| `grade` | Opcional; 0–10, máximo dos decimales. |

Los textos y nombres se recortan y se rechazan los vacíos. Las notas no se
redondean y los números no se aceptan como cadenas. Un cero es un dato conocido,
distinto de `null`. La regla de dos decimales corresponde a notas, no a porcentajes.
No se calculan medias ni equivalencias entre ponderación de bloque y asignatura.

Una fecha sin hora conserva el día sin inventar medianoche o 23:59. Los instantes
se devuelven en UTC. La condición de vencida se deriva del plazo, la zona de
visualización y el estado; no sustituye al progreso como estado persistido.

Creación mínima:

```json
{
  "title": "Preparar la entrega",
  "course_name": "Cloud Computing",
  "course_abbreviation": "CC",
  "section": "practice",
  "mandatory": true,
  "due_date": "2026-12-01"
}
```

## Edición parcial

Todos los campos de negocio son editables. Omitir un campo conserva su valor;
`null` solo retira un dato nullable. La petición vacía produce `422`. PostgreSQL
comprueba la combinación final de campos en la misma operación: un error no
modifica ningún dato enviado. Las actualizaciones de campos independientes
conservan sus cambios concurrentes sin reescribir una copia antigua de la fila.

Cambiar de día a instante requiere limpiar la representación anterior:

```json
{
  "due_date": null,
  "due_at": "2026-12-01T18:00:00+01:00"
}
```

Cambiar de un grupo con integrantes a individual requiere vaciar la lista:

```json
{
  "work_mode": "individual",
  "group_members": []
}
```

Para retirar una ponderación se envían ambos campos como `null`. Si ya existe
una referencia, se puede modificar solo el porcentaje y conservarla. Una nota
posterior mantiene el ID y `created_at`. `updated_at` avanza solo al cambiar el
contenido; repetir valores o expresar el mismo instante con otro desplazamiento
conserva esa fecha.

## Borrado y exportación para Sync

`DELETE` establece `deleted_at` y actualiza `updated_at`. Repetir una eliminación
propia devuelve `204` conservando las fechas. La fila mantiene su ID y datos;
no se expone restauración ni purga en este alcance.

Las entregas eliminadas desaparecen del listado normal; detalle y edición
devuelven `404`. La exportación conserva la última versión de todas las entregas
propias: `deleted_at: null` en activas y una fecha en eliminadas. No es un
historial de todos los cambios ni un feed incremental por cursor.

Sync debe leer el array raíz de `/api/v1/assignments/export` y reflejar las marcas
de borrado en su colección central. Ese motor sigue pendiente; el servicio
proporciona el contrato de origen. La integración autorizará el origen
`http://academic:3000` en `SYNC_ALLOWED_CONNECTION_ORIGINS` y utilizará una
conexión Bearer guardada en Sync.

## Comprobaciones

Desde la raíz:

```bash
npm --prefix apps/academic run lint
npm --prefix apps/academic run build
npm --prefix apps/academic test -- --runInBand

docker compose up -d --wait academic-db
docker compose run --rm --no-deps \
  --volume "$PWD/apps/academic:/app" \
  academic npm run migrate:up
docker compose run --rm --no-deps \
  --volume "$PWD/apps/academic:/app" \
  academic npm run test:e2e -- --runInBand
```

Las pruebas crean cuentas y entregas temporales y limpian solo sus registros.
Comprueban permisos, formatos, cambios simultáneos, consistencia de datos,
borrado y exportación con PostgreSQL real. CI aplica todas las migraciones sobre
una base vacía y ejecuta las suites antes de comprobar la imagen Docker.
