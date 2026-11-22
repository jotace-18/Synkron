# Servicios de origen y actividades

Este documento define las entradas de la demostración. Describe requisitos de
producto; los modelos y rutas que todavía no existen no se presentan como código
implementado. Las decisiones abiertas se enumeran al final.

## Tres fuentes independientes

| Fuente | Responsabilidad |
|---|---|
| Académico | Agenda personal de entregas, exámenes, sesiones de trabajo y eventos académicos. |
| Deporte | Registro de gimnasio, fútbol, senderismo, carrera y otras actividades sencillas. |
| Planes sociales | Quedadas y planes personales con información opcional de lugar y participantes. |

Son servicios externos al motor de Synkron. En un proyecto personal pueden ser
módulos propios. No son los componentes internos Sync, Automation y Monitoring.
Cada fuente mantiene sus datos y persistencia, permite introducir y modificar
registros y ofrece una API de acceso autorizado. Synkron no lee sus bases de datos.

La API estática `fixtures/task-api` permite comprobar conexiones. El backend
`apps/academic` implementa la colección editable de entregas, con PostgreSQL,
autorización Bearer y borrado lógico. Su [contrato y arranque](../apps/academic/README.md)
describen las rutas disponibles. Los demás recursos académicos, las fuentes de
deporte y planes sociales y los formularios de entrada siguen pendientes.

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

| Dato | Alcance |
|---|---|
| Título | Identifica el examen en modo texto. |
| Asignatura | Asignatura correspondiente. |
| Temas | Tema o temas evaluados. |
| Parte | Teoría o prácticas. |
| Fecha y hora | Cuándo se celebra. |
| Ponderación | Opcional, si se conoce. |
| Estado | Valores concretos por cerrar. |
| Nota | Opcional, incorporable o corregible después, con máximo dos decimales. |

Actualizar una nota modifica el examen existente. La fecha del examen conserva
su significado y la fecha de modificación permite reconocer la actualización.
El evento que comunica ese cambio no es un segundo compromiso académico.
No se incluye cálculo de medias o expedientes por el hecho de guardar notas.

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
| Gimnasio | Título, fecha, hora, tipo de entrenamiento —push, pull, legs, upper, lower, etc.—, solo/acompañado, nombres opcionales y sensaciones opcionales. |
| Fútbol | Modalidad sala/7/11, posición, goles, asistencias, ubicación y distancia recorrida opcional. |
| Senderismo | Nombre de ruta, acompañantes opcionales, distancia, desnivel positivo acumulado y ubicación. |
| Carrera | Distancia y tiempo empleado. |
| Otros deportes | Registro básico y flexible para actividades poco frecuentes. |

Deporte y tipo de entrenamiento son datos distintos: gimnasio identifica el
deporte y `legs` describe la sesión. Ir acompañado sin facilitar nombres es
distinto de entrenar solo. Las sensaciones pueden registrarse opcionalmente;
no se ha acordado una escala numérica.

El desnivel de senderismo es el positivo acumulado, medido en metros ascendidos,
no la diferencia de altura entre inicio y final ni el descenso acumulado.
Las unidades y precisión de distancia y la definición de tiempo de carrera se
concretarán en el contrato. La regla de dos decimales de las notas no se aplica
automáticamente a estas métricas.

Hevy se contempla como integración futura del proyecto personal. No se utiliza
su API ni se añaden ahora ejercicios, series, pesos o repeticiones al alcance.
La referencia a Strava describe el tipo de información de carrera, sin requerir
un conector actual. Registrar actividades frecuentes no supone todavía patrones
de repetición automática. Se debe cerrar si el deporte registra solo sesiones
realizadas o también permite planificar sesiones futuras.

## Fuente de planes sociales

| Dato | Alcance |
|---|---|
| Título | Nombre de la quedada o plan. |
| Fecha | Día del plan. |
| Hora | Hora del plan. |
| Ubicación | Opcional. |
| Participantes | Lista opcional de nombres. |

La descripción opcional y un estado de cancelación son propuestas pendientes
de confirmar. La ubicación puede empezar como texto libre y los participantes
como nombres; no se ha solicitado un sistema de invitaciones, cuentas de
participantes o integración de mapas.

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
- Unidades de distancia, definición de duración y planificación de deporte.
- Descripción y cancelación en planes sociales.
- Identidades entre colecciones, relaciones y mapeos al modelo central; política
  si varias configuraciones importan el mismo recurso.
- Fechas sin hora, instantes con zona y duración sin valores redundantes.
- Contratos y permisos concretos de creación, modificación y lectura de fuentes.

Estas decisiones no implican que las fuentes o el calendario estén implementados.
