# Modelo común de actividades

La tabla de actividades, su persistencia, la importación de entregas académicas,
las consultas públicas, las ejecuciones y los eventos están implementados.
La importación de exámenes, sus vistas y recordatorios también están implementados.
Las necesidades de cada fuente se describen en
[Servicios de origen](servicios-origen.md).

## Parte común y detalles

Sync guarda la parte común en `sync.activities` y los detalles específicos en
`details`, un objeto JSONB validado según `type`. La parte común permite consultar
juntas las actividades sin exigir a un entrenamiento los campos de un examen.

| Campo interno | Tipo | Regla |
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
| `deleted_at` | `timestamptz`, nullable | Instante de retirada comunicado por la fuente; `null` si está activa. |

La conexión pertenece a `tenant_id`, también mediante integridad en la base.
Una clave foránea compuesta referencia propietario y conexión juntos. No hay
claves foráneas hacia las bases de datos de las fuentes.

Las ejecuciones y los eventos de outbox conservan las referencias necesarias
para seguir la sincronización. El calendario consulta las actividades, sin
reconstruir su contenido a partir de esos eventos.

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
| `social.plan` | Nombre previsto inicialmente para planes; todavía presente en código y pendiente de sustitución. |

El contrato de producto del 23/11/2026 amplía el tercer bloque a **Otros** y
propone `personal.event` para recados, citas y quedadas: asunto y día obligatorios,
hora y duración opcionales, personas opcionales y estados pendiente/realizado/cancelado.
Esta decisión está documentada en US-25; el nuevo tipo aún no está habilitado y
requiere actualizar el catálogo, las restricciones y las vistas durante su implementación.

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

La tabla tiene una restricción única sobre esa combinación. `external_id` se
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

La huella compara título, tipo, datos temporales, estado y detalles normalizados.
El orden de claves de los objetos no afecta al resultado; los instantes llegan
normalizados a UTC. Se conserva el orden de las listas. La identidad del origen
se comprueba por separado. Se excluyen ID central, marcas de sincronización y
fechas técnicas para que releer no simule un cambio de contenido.

`source_updated_at` ayuda al seguimiento, pero no sustituye la comparación si la
fuente no ofrece una versión fiable. `updated_at` central cambia si cambia el
contenido o el estado activo/retirado; `last_synced_at` puede avanzar aunque el
contenido sea igual.

Cada actualización y su evento pendiente se guardarán en una transacción. Una
nota añadida después mantiene el mismo examen o entrega. Los eventos contienen
referencias y nombres de campos modificados, no la nota ni el contenido personal
completo. Los cambios de formato de correspondencias también deberán provocar
una comparación explícita, sin duplicar identidades.

## Importación interna de entregas

`AcademicImportService.run` recupera la conexión guardada del propietario,
comprueba que está habilitada y descifra su credencial Bearer. Lee todas las
páginas del export académico y valida y transforma los registros antes de la
primera escritura. La colección lógica es `assignments` y el tipo normalizado
es `academic.assignment`.

Los detalles permitidos son asignatura, abreviatura, parte, obligatoriedad,
modalidad de trabajo, integrantes, ponderación con su referencia y nota. No se
copia arbitrariamente la respuesta del origen. Un vencimiento sin hora conserva
el día; un vencimiento con hora se convierte en un instante UTC.

Una marca explícita de borrado produce una retirada: conserva ID, contenido y
huella, y registra `deleted_at` con el instante comunicado por la fuente.
Repetirla solo refresca el seguimiento. Si nunca existió la actividad central,
se ignora esa retirada sin fabricar un registro. Una entrega que vuelve a
llegar activa se reactiva con el mismo ID, aunque su huella no haya cambiado.
Las consultas de actividades activas deberán filtrar `deleted_at IS NULL`.

El resultado contiene `connection_id`, `read`, `created`, `updated`, `unchanged`,
`retired` e `ignored`; no devuelve credenciales ni las entregas completas. La
primera importación, su repetición, la edición y la retirada se han comprobado
con Academic real, conservando el mismo ID central. La demostración utiliza una
entrega temporal que queda retirada en ambas bases. La reactivación está cubierta
por pruebas de integración.

Cada actividad se guarda en su propia transacción. Si falla la lectura o la
validación no se empieza a guardar; si falla la persistencia durante el lote,
se propaga el error y las actividades anteriores ya confirmadas permanecen.
El reintento reconoce las identidades existentes. En el recorrido asíncrono,
`RunProcessorService` aporta la reserva de ejecución y las escrituras guardan
sus eventos de outbox en la misma transacción. La aceptación de trabajos y el
resultado de la ejecución se gestionan fuera del servicio de importación.

## Contrato de exámenes

El conector es `academic.exams`, la colección de origen `exams` y el tipo
normalizado `academic.exam`. Su representación reutiliza la misma tabla,
identidad y comparación de contenido que las entregas.

| Campo central | Procedencia |
|---|---|
| `source_connection_id` | Conexión propia de la definición de sincronización. |
| `source_collection` | Literal `exams`. |
| `external_id` | `id` estable del examen en Academic. |
| `type` | Literal `academic.exam`. |
| `title` | `title` del examen. |
| `status` | `scheduled`, `completed` o `cancelled`, sin conversión automática por fecha o nota. |
| `source_updated_at` | `updated_at` del origen, normalizado a UTC. |
| `details` | Solo `course_name`, `course_abbreviation`, `topics`, `section`, `weight_percent`, `weight_basis` y `grade`, con las reglas del contrato académico. |

La asignatura es obligatoria; abreviatura y temas pueden ser nulos. La parte es
`theory` o `practice`, la nota admite 0 a 10 con dos decimales y la ponderación
usa porcentaje y referencia juntos o ambos nulos. Los detalles no incorporan
campos específicos de entregas, como obligatoriedad, integrantes o modalidad.

Un examen sin hora utiliza `exam_date` en el origen y este horario central:

```json
{
  "kind": "date",
  "role": "start",
  "date": "2026-12-02",
  "at": null,
  "end_at": null
}
```

Un examen con hora utiliza `exam_at`. Por ejemplo, las 09:00 de Madrid del
02/12/2026 se representan normalizadas así:

```json
{
  "kind": "instant",
  "role": "start",
  "date": null,
  "at": "2026-12-02T08:00:00.000Z",
  "end_at": null
}
```

Ambas formas indican celebración o comienzo (`start`). Este contrato no incluye
duración ni final del examen; `end_at` queda nulo. Campus interpreta la hora en
Madrid y Sync conserva los días sin hora, sin transformarlos a medianoche UTC.

La modificación de fecha, temas, estado o nota mantiene la identidad central.
El cambio de fecha se comunica en `changed_fields` como `schedule`; el de nota,
como `grade`. Repetir una sincronización sin cambios no genera otro evento.
La colección evita confundir una entrega y un examen con el mismo ID externo.

`cancelled` mantiene una actividad visible con ese estado. Solo una marca de
`deleted_at` en la exportación produce retirada central, con las mismas reglas
de identidad y conservación de contenido que las entregas.

Los recordatorios de exámenes se calcularán antes de su celebración, con la
antelación configurada cuando haya hora y a las 09:00 de Madrid del día anterior
cuando solo se conozca el día. Se excluirán realizados, cancelados, retirados y
exámenes pasados. Para fechas sin hora, el día se considera vigente hasta que
termine en Madrid, sin atribuir una hora de celebración. Las reglas de avisos
deberán permitir elegir exámenes explícitamente; las reglas existentes de
entregas conservarán su alcance.

### Preparación de Sync completada

`connector-catalog.ts` es el catálogo de conectores admitidos y relaciona cada
nombre con su colección, tipo de actividad y autenticación. Las definiciones,
la validación de solicitudes y la selección de trabajos soportados usan este
catálogo. El worker selecciona el importador mediante `ConnectorRegistryService`
a partir del conector y la colección capturados en la ejecución, sin releer una
definición que podría haber cambiado.

`ConnectorImportTransport` comprueba la conexión y credenciales y realiza la
lectura y transformación de origen. `ActivityImportPipeline` recibe operaciones
normalizadas y un contexto comprobado, sin depender de ese transporte. Valida el
conjunto completo antes de escribir: procedencia, identidad, campos comunes,
horario y esquema de estado y detalles del tipo. Comparte las altas y retiradas,
contadores y cancelación, y conserva los controles de cuenta y de posesión de la
ejecución durante las escrituras. El [contrato de entrada](entrada-estandarizada.md)
describe esta separación y la recepción directa que sigue pendiente.

Están registrados `academic.assignments` y `academic.exams`. Ambos comparten el
lector HTTP paginado, con límite de tamaño, comprobación de destino autorizado
y detección de identidades repetidas, y aportan validadores y transformaciones
específicas. La migración `012_add_exam_connector.sql` admite ambos pares de
conector y colección y conserva el historial anterior sin encolarlo de nuevo.
No se modifican conexiones, definiciones, actividades ni ejecuciones existentes.

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

La consulta autenticada ya permite listar y consultar actividades propias y
activas, filtrar por periodo, tipo y conexión y paginar. La selección temporal
conserva las fechas sin hora y considera los solapamientos y la zona del calendario.
El contrato está descrito en [API](api.md#consulta-de-actividades-centralizadas).

Exámenes implementados; para los demás tipos
siguen pendientes sus esquemas de `details`, estados y correspondencias de origen.
La implementación actual cubre la parte común, el recorrido asíncrono de entregas
académicas, las definiciones y ejecuciones y la lectura de actividades por HTTP.
