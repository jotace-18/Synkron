# Decisiones de diseño

El diseño de Synkron busca que las sincronizaciones, las reglas y el seguimiento de actividad puedan funcionar por separado. Estas decisiones organizan ese trabajo y explican cómo se guardan los datos y se controlan los fallos.

## ADR-001. Separación de responsabilidades

Sync conecta las fuentes y mantiene las actividades centralizadas y las ejecuciones. Automation comprueba las reglas y solicita acciones. Monitoring reúne el historial de cambios, resultados y avisos. El calendario consulta las actividades de Sync mediante la entrada API.

Esta separación permite modificar una parte sin concentrar toda la lógica en la misma aplicación. También permite dedicar más recursos a las sincronizaciones cuando aumenta el trabajo. El panel utiliza una entrada API común para acceder a las funciones de cada servicio.

## ADR-002. Trabajo en segundo plano

Una sincronización puede tardar más que una consulta del panel. Por eso, la solicitud se guarda y el trabajo continúa en segundo plano, mientras el usuario puede consultar su estado.

RabbitMQ reparte las tareas entre los procesos de Sync y comunica los cambios a Automation y Monitoring mediante colas separadas. Las consultas y la configuración se realizan por HTTP.

Cada servicio lleva el seguimiento de los mensajes que procesa para que una interrupción o una repetición no haga perder el trabajo ni duplique una acción ya realizada.

## ADR-003. Base de datos independiente por servicio

Cada backend tendrá su propia instancia de PostgreSQL en un contenedor independiente: Sync, Automation, Monitoring y el componente de cuentas y sesiones de la entrada API. Cada instancia tendrá credenciales, migraciones y un volumen persistente propios.

Esta decisión sustituye la instancia compartida con tablas y permisos separados, para aplicar la indicación docente de mantener una base de datos por servicio. La separación permite gestionar el ciclo de vida y los fallos de cada base por separado, a cambio de mayor consumo de memoria y más componentes que mantener. Compartir el host sigue siendo una dependencia común.

Cada backend solo accede a su propia base de datos. Los servicios intercambian información mediante la API y los mensajes; no utilizan consultas, claves foráneas ni transacciones entre bases. Los workers de un servicio utilizan la misma base que su backend. El frontend consume la API y no necesita una base propia.

## ADR-004. Control de duplicados

Las solicitudes y los mensajes tienen identificadores que permiten reconocer lo que ya se ha procesado. La comparación con revisiones anteriores ayuda a distinguir los datos nuevos de los que no han cambiado.

El destino inicial es la base de Sync. La identidad de una actividad conserva propietario, conexión, colección o tipo de recurso e identificador externo. Las transacciones y las restricciones que se definan impedirán que repetir una importación cree otra actividad. La actividad y su evento pendiente de cambio se guardan juntos.

Si en una ampliación se envía información a otra aplicación, también se dependerá de sus capacidades. Si pudo guardar un dato pero no respondió, el envío solo podrá repetirse cuando se reconozca la operación. Ese caso no forma parte del primer destino interno.

El historial permite seguir estas situaciones y conocer qué parte de una operación llegó a completarse.

## ADR-005. Acceso a la información personal

Las cuentas son propias de Synkron y se crean con correo y contraseña. El correo es único y las contraseñas se guardan mediante Argon2id, que permite comprobarlas sin conservarlas en texto legible. No se utiliza un proveedor externo de acceso en la primera versión.

El componente de acceso, desarrollado con NestJS e incluido en la entrada API, gestiona las cuentas y las sesiones en su propia instancia de PostgreSQL. El navegador recibe un identificador aleatorio mediante una cookie `HttpOnly`, `Secure` y `SameSite=Lax`, sin acceso desde JavaScript y solo enviada por HTTPS. El panel y la API se publican bajo el mismo origen.

Al iniciar sesión se genera un identificador nuevo. La sesión caduca tras 30 minutos sin actividad o, como máximo, a las 12 horas de su creación. Cerrar sesión la invalida en el servidor y elimina la cookie; no basta con borrarla del navegador. Estos tiempos son configurables.

Sync, Automation y Monitoring consultan la validez de la sesión al componente de acceso mediante una comunicación interna autenticada. Si no pueden comprobarla, no conceden acceso. Después verifican que el recurso pertenece a la cuenta identificada, sin confiar en un usuario o propietario enviado libremente por el cliente. Las tablas de cuentas y sesiones solo las modifica el componente de acceso.

Las peticiones del navegador que cambian datos, incluidos registro, inicio y cierre de sesión, comprueban el origen y un token contra peticiones no autorizadas (CSRF). Se limitan los intentos de acceso por cuenta y por dirección de origen, y los errores de inicio de sesión no distinguen entre un correo inexistente y una contraseña incorrecta.

Las credenciales de conexiones, las contraseñas y los identificadores de sesión no aparecen en respuestas JSON, eventos ni registros técnicos. Las tareas ya aceptadas conservan su propietario y no se cancelan por cerrar sesión.

Referencias: [gestión de sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [protección de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) de OWASP. Los valores de configuración previstos están en [.env.example](../.env.example); no contienen credenciales reales.

## ADR-006. Tecnologías de la aplicación

Los servicios utilizan NestJS con TypeScript. Su organización en módulos permite separar las funciones de cada servicio, validar las peticiones y probar su comportamiento. Sync, Automation y Monitoring se ejecutan por separado y se comunican mediante HTTP y RabbitMQ.

El panel utiliza React con TypeScript y Vite. React permite organizar las pantallas en componentes y TypeScript ayuda a comprobar los datos que manejan tanto el panel como los servicios. Vite prepara el entorno de desarrollo y genera los archivos del panel para su publicación.

Synkron dispone de panel y API para gestionar conexiones, sincronizaciones, reglas, historial y una vista centralizada de actividades. Las fuentes intercambian datos por sus API, con persistencia independiente. En la demostración local sus implementaciones de ejemplo se incluirán en Compose para poder reproducir el recorrido completo.

## ADR-007. Centralización de actividades de varias fuentes

La demostración se organiza en tres servicios de origen: académico, deporte y planes sociales. Cada uno conserva su modelo y permite introducir y actualizar datos. Sync los consulta, transforma los campos seleccionados y mantiene actividades consultables en su propia base. El destino inicial no requiere otra aplicación ni una conexión externa adicional.

El frontend ofrece una agenda o calendario de consulta sobre esa colección. Los formularios de entrada alimentan los servicios de origen. Las correcciones se hacen en la fuente y se reflejan al sincronizar; no se incluye escritura de vuelta desde el calendario en el alcance inicial.

Esta organización conserva el motor como módulo reutilizable de integración. Los detalles de un examen o entrenamiento pertenecen a su servicio; el motor adapta contratos y reconoce actualizaciones. La publicación de una nota no crea otro examen, y un cambio de fecha no duplica un plan.

Se mantienen separados los contratos de entrada, la representación común y la presentación. Los campos confirmados y las decisiones todavía abiertas figuran en [Servicios de origen](servicios-origen.md). Los colores y la abreviatura de una asignatura no se guardan como sustitutos de los datos semánticos.

Hevy se contempla para el proyecto personal futuro; la integración con su API no se implementa ahora. Strava se ha utilizado como referencia del tipo de datos de carrera, sin acordar un conector actual. La planificación automática de entrenamientos tampoco se deduce de que una actividad sea frecuente.

## ADR-008. Cierre funcional del Hito 2

El objetivo de cierre es tener implementado el alcance inicial acordado: fuentes editables, Sync, Automation, Monitoring, autenticación, frontend y su integración. El trabajo se verificará por incrementos, pero una primera sincronización visible es un checkpoint intermedio.

Además de la funcionalidad se completarán persistencia, migraciones, seguridad, pruebas, imágenes, orquestación local, CI y publicación en GHCR. Las ampliaciones expresamente posteriores u opcionales siguen separadas. El trabajo de infraestructura y despliegue vendrá después; no se añade CD al flujo actual.

## ADR-009. Modelo híbrido de actividades

Sync almacenará una parte común de cada actividad en columnas de PostgreSQL y
los detalles específicos en un campo `details` JSONB, validado según el tipo.
Identidad, propietario, procedencia, título e información temporal permitirán
consultas conjuntas; las notas académicas, el entrenamiento o los participantes
se conservarán sin convertirlos en campos obligatorios para todos los tipos.

Este modelo permite consultar la agenda de varias fuentes y ampliar detalles de
un tipo sin cambiar el significado de los demás. JSONB no implica admitir campos
arbitrarios ni guardar la respuesta completa de origen. El backend seleccionará
y validará lo permitido para cada tipo, manteniendo secretos fuera de actividades
y eventos.

Una restricción de identidad y la comparación del contenido deben distinguir
creación, actualización y ausencia de cambios. La huella incluirá los datos
normalizados relevantes; no considerará un cambio de contenido la mera fecha de
la última sincronización. Actividad y evento pendiente se guardarán juntos.

Se mantienen diferenciadas las fechas sin hora, los instantes y los intervalos,
y el significado de vencimiento frente a comienzo. Los valores de estado no se
reducen automáticamente a un booleano común para todos los tipos. Las columnas
comunes, identidad y restricciones temporales se concretan en
[Modelo de actividades](modelo-actividades.md). Relaciones y esquemas de `details`
se cerrarán con cada tipo de origen. Esta decisión es de diseño y aún no está
aplicada en el código.

## ADR-010. Borrado de entregas y exportación de su estado

Las entregas académicas se eliminan mediante una marca `deleted_at`. El listado,
detalle y edición habituales trabajan con registros activos; la exportación
autenticada conserva también las marcas de borrado de la cuenta. Se mantiene el
ID y se actualiza `updated_at` al eliminar, para que una sincronización posterior
pueda reconocer la retirada sin interpretar una página incompleta como un borrado.
Repetir la eliminación propia conserva las fechas y devuelve `204`.

La exportación ofrece la última versión de cada entrega mediante paginación,
no un historial de eventos ni una instantánea entre peticiones. El borrado lógico
y su contrato de origen están implementados en académico. El motor de Sync debe
incorporar después la interpretación de esas marcas y su efecto en el calendario.
No se añade una política de purga o restauración a este alcance inicial.
