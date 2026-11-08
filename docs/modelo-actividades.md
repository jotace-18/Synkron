# Modelo común de actividades

Contrato de trabajo para la próxima implementación. Todavía no existe la tabla
de actividades ni una ruta de consulta que aplique este modelo. Las necesidades
de cada fuente se describen en [Servicios de origen](servicios-origen.md).

## Parte común y detalles

Sync guardará la parte común en `sync.activities` y los detalles específicos en
`details`, un objeto JSONB validado según `type`. La parte común permite consultar
juntas las actividades sin exigir a un entrenamiento los campos de un examen.

| Campo interno | Tipo previsto | Regla |
|---|---|---|
| `id` | UUID | Identidad de Synkron, generada por el backend. |
| `tenant_id` | UUID | Propietario obtenido del acceso comprobado. |
| `source_connection_id` | UUID | Conexión de origen del mismo propietario. |
| `source_collection` | Texto | Colección lógica estable del origen; no vacía, hasta 100 caracteres. |
| `external_id` | Texto | ID estable del registro en esa colección; no vacío, hasta 256 caracteres. |
| `type` | Texto | Tipo normalizado del catálogo siguiente. |
| `title` | Texto | Título no vacío, hasta 200 caracteres. |
| `time_kind` | Texto | `date`, `instant` o `interval`. |
| `time_role` | Texto | `deadline` para vencimiento o `start` para comienzo/fecha de actividad. |
| `on_date` | `date`, nullable | Día conocido sin hora. |
| `at` | `timestamptz`, nullable | Instante de vencimiento o comienzo, según `time_role`. |
| `end_at` | `timestamptz`, nullable | Final de un intervalo. |
| `status` | Texto, nullable | Estado validado para su tipo; no vacío si existe, hasta 32 caracteres. |
| `details` | JSONB | Objeto con campos permitidos para el tipo. |
| `source_updated_at` | `timestamptz`, nullable | Modificación comunicada por la fuente, cuando exista. |
| `content_hash` | Texto | Huella SHA-256 hexadecimal del contenido normalizado relevante. |
| `last_synced_at` | `timestamptz` | Última importación correcta de ese recurso. |
| `created_at` | `timestamptz` | Creación del registro central. |
| `updated_at` | `timestamptz` | Última modificación de su contenido central. |

La conexión deberá pertenecer a `tenant_id`, también mediante integridad en la
base. Al crear la migración se añadirá la clave compuesta necesaria en conexiones
para referenciar propietario y conexión juntos. No hay claves foráneas hacia las
bases de datos de las fuentes.

Las referencias a ejecuciones y sus eventos se incorporarán al implementar las
tablas de ejecuciones y outbox. El calendario no consulta esos eventos para
reconstruir el contenido de una actividad.

## Tipos iniciales

| `type` | Significado |
|---|---|
| `academic.assignment` | Entrega académica. |
| `academic.exam` | Examen. |
| `academic.work_session` | Sesión de estudio o trabajo. |
| `academic.event` | Otro evento académico. |
| `sport.gym` | Gimnasio. |
| `sport.football` | Fútbol. |
| `sport.hiking` | Senderismo. |
| `sport.running` | Carrera. |
| `sport.other` | Otro deporte. |
| `social.plan` | Quedada o plan social. |

El tipo normalizado no sustituye a la colección del origen. Cambiar una
correspondencia no debe producir una identidad distinta para el mismo recurso.
El deporte concreto de `sport.other` puede conservarse entre sus detalles.

`status` es opcional y sus valores se cerrarán con cada contrato de fuente. No
se convierte a un único booleano `completed` que pierda diferencias entre una
entrega, un examen y una sesión. Los esquemas de `details` se implementarán por
tipo, seleccionando los campos descritos en el contrato de origen; no se admitirá
una copia arbitraria del JSON recibido ni datos de autenticación.

## Identidad y repetición

La identidad externa se reconoce por:

```text
tenant_id + source_connection_id + source_collection + external_id
```

La tabla tendrá una restricción única sobre esa combinación. `external_id` se
conserva como texto: no se supone que todas las fuentes utilicen UUID, ni se
cambian mayúsculas o ceros iniciales.

- La primera importación crea el registro y su `id` central.
- Un cambio conserva ese `id` y actualiza el contenido.
- Una importación sin cambios solo actualiza el seguimiento de lectura; no crea
  otra actividad ni genera otro `data.changed`.
- Dos colecciones o conexiones diferentes pueden tener un registro `42` sin
  confundirse.

Para el alcance inicial, el contrato de definiciones evitará dos configuraciones
activas con correspondencias distintas para la misma conexión y colección.
Reactivar o sustituir una configuración mantendrá las identidades centrales.
El esquema de definiciones concretará esa restricción antes de permitir ejecutar
las importaciones; no se resolverán conflictos mediante sobrescrituras silenciosas.

## Tres formas temporales

La API presentará un objeto `schedule` con `kind`, `role`, `date`, `at` y `end_at`.
Esos valores corresponden a `time_kind`, `time_role`, `on_date`, `at` y `end_at`
de la tabla. Los campos que no correspondan se devuelven como `null`.

### Fecha sin hora

```json
{
  "kind": "date",
  "role": "deadline",
  "date": "2026-11-12",
  "at": null,
  "end_at": null
}
```

Por ejemplo, una entrega con vencimiento conocido solo por día. Se exige
`on_date` y se dejan `at` y `end_at` vacíos. No representa un instante a medianoche
ni afirma que la actividad dure todo el día. No se inventa una hora como 23:59.
El mismo formato con `role:start` sirve para un evento con fecha pero sin hora.

### Instante conocido

```json
{
  "kind": "instant",
  "role": "start",
  "date": null,
  "at": "2026-11-13T17:00:00Z",
  "end_at": null
}
```

Por ejemplo, un entrenamiento con hora de inicio conocida y sin final registrado.
Se exige `at` y se dejan `on_date` y `end_at` vacíos. `role:deadline` representa
una entrega con hora límite conocida.

### Intervalo conocido

```json
{
  "kind": "interval",
  "role": "start",
  "date": null,
  "at": "2026-11-10T16:00:00Z",
  "end_at": "2026-11-10T18:00:00Z"
}
```

Por ejemplo, dos horas reservadas para una práctica. Se exigen comienzo y final,
con `end_at` posterior a `at`, y `on_date` queda vacío. Un vencimiento no es un
intervalo: `interval` solo admite `role:start`.

Estas combinaciones se comprobarán en el backend y mediante restricciones de
tabla. Un dato temporal inválido se registra como error de importación; no debe
sustituir una actividad válida por un horario inventado.

## Zonas horarias y duración

Los instantes de entrada deben incluir `Z` o un desplazamiento explícito. Sync
los normaliza a UTC; la API devuelve el formato ISO con `Z`. La interfaz los
muestra en la zona del usuario. El nombre de zona de la fuente, cuando sea
necesario para el detalle, se conservará como dato autorizado; `timestamptz` no
conserva por sí solo el nombre original de zona.

Una fecha sin hora permanece como día sin conversión UTC. La consulta del
calendario deberá aplicar el intervalo de días también a esas fechas, además
de los límites de instantes que correspondan a la zona del usuario.

Si una fuente permite introducir comienzo y duración, su adaptación puede
calcular el final. No se exigirán tres valores redundantes. La duración deportiva
que describe tiempo en movimiento puede conservarse en `details`; no equivale
automáticamente al intervalo completo de la sesión. Su significado se cerrará
con el contrato deportivo.

## Comparación y cambios

La huella compara título, tipo, datos temporales, estado, detalles y referencias
normalizados. La normalización debe hacer estable el orden de claves de objetos
y las representaciones temporales. No ordena listas cuyos elementos tengan un
orden significativo. Se excluyen ID central, marcas de sincronización y fechas
técnicas para que releer no simule un cambio de contenido.

`source_updated_at` ayuda al seguimiento, pero no sustituye la comparación si la
fuente no ofrece una versión fiable. `updated_at` central solo cambia si cambia
el contenido; `last_synced_at` puede avanzar aunque el contenido sea igual.

Cada actualización y su evento pendiente se guardarán en una transacción. Una
nota añadida después mantiene el mismo examen o entrega. Los eventos contienen
referencias y nombres de campos modificados, no la nota ni el contenido personal
completo. Los cambios de formato de correspondencias también deberán provocar
una comparación explícita, sin duplicar identidades.

## Relaciones y límites de responsabilidad

Las sesiones de trabajo podrán conservar en sus detalles una referencia estable
al examen o entrega de su fuente. Esa referencia no es una copia de toda la
entrega ni una clave foránea a otra base. Si la actividad relacionada aún no se
ha importado, se conserva su procedencia; no se crea un recurso incompleto para
simular la relación. La forma exacta de esa referencia se fijará con el tipo.

La API de consulta no expone `tenant_id`, `content_hash` ni credenciales. El
propietario viene del acceso comprobado. La creación y edición se realizan en
las fuentes; la colección central la modifica el motor de Sync. El backend
filtra las actividades propias antes de paginar y de devolver detalles.

Quedan para las próximas implementaciones los esquemas de `details`, los valores
de estado por tipo, el contrato completo de correspondencias, las consultas y
filtros temporales y las tablas de definiciones/ejecuciones. Este documento cierra
la parte común y las combinaciones temporales, no implementa esas funciones.
