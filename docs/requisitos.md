# Requisitos

RF describe funciones; RI, la información necesaria; RD, cómo se guardan los datos; RIC, cómo se comunican las partes; RNF, las condiciones de seguridad y funcionamiento.

La prioridad indica si pertenece a la versión inicial, a una mejora posterior o a una ampliación opcional. Los códigos permiten relacionar los requisitos con los [casos de uso](casos-de-uso.md).

## Funciones

| Código | Qué debe permitir | Prioridad |
|---|---|---|
| RF-01 | Crear una cuenta con correo y contraseña, iniciar sesión y cerrarla invalidándola en el servidor. | Inicial |
| RF-02 | Añadir, consultar, modificar y desactivar conexiones propias. | Inicial |
| RF-03 | Probar una conexión sin mostrar credenciales ni acceder a direcciones prohibidas. | Inicial |
| RF-04 | Elegir fuente, recursos y correspondencia de campos para incorporar actividades a la colección central de Sync. | Inicial |
| RF-05 | Ejecutar sincronizaciones manuales en segundo plano. | Inicial |
| RF-06 | Adaptar nombres de campos, rutas y tipos básicos de datos. | Inicial |
| RF-07 | Reconocer datos ya procesados y actualizar la actividad central existente sin duplicarla al repetir solicitudes o mensajes. | Inicial |
| RF-08 | Guardar estado, duración, cantidades procesadas y errores. | Inicial |
| RF-09 | Comunicar resultados y cambios mediante eventos con una versión de formato. | Inicial |
| RF-10 | Crear, modificar, activar y desactivar reglas. | Inicial |
| RF-11 | Combinar condiciones con comparaciones y «todas» o «alguna» (`AND`/`OR`). | Inicial |
| RF-12 | Crear avisos e iniciar otra sincronización como acciones. | Inicial |
| RF-13 | Guardar qué reglas se comprobaron y qué acciones se realizaron. | Inicial |
| RF-14 | Consultar y filtrar cambios, operaciones y avisos. | Inicial |
| RF-15 | Consultar estadísticas de uso. | Inicial |
| RF-16 | Programar sincronizaciones. | Después |
| RF-17 | Reintentar fallos temporales cuando sea seguro. | Después |
| RF-18 | Revisar y recuperar mensajes que no pudieron procesarse. | Después |
| RF-19 | Enviar peticiones a través de conexiones autorizadas. | Después |
| RF-20 | Cancelar o reintentar manualmente cuando el estado lo permita. | Opcional |
| RF-21 | Detectar datos nuevos o modificados y comunicar `data.changed` después de confirmar su escritura. | Inicial |
| RF-22 | Consultar juntas las actividades propias de distintas fuentes en una agenda o calendario, con filtros y detalle de procedencia. | Inicial |
| RF-23 | Disponer de fuentes académica, deportiva y de planes sociales editables y persistentes para demostrar el recorrido completo. | Inicial |
| RF-24 | Conservar los detalles necesarios de cada tipo y las relaciones de origen al normalizar actividades, incluidas actualizaciones posteriores de notas. | Inicial |
| RF-25 | Sincronizar hacia destinos externos además de la colección central. | Después |

El destino inicial es interno a Sync. No se requiere una segunda conexión externa
para importar actividades. Los tipos y campos de las tres fuentes se describen en
[Servicios de origen](servicios-origen.md); las decisiones marcadas como pendientes
se cerrarán antes de implementar sus validaciones. Este alcance está definido
funcionalmente, pero todavía no está implementado.

La parte común, identidad y reglas temporales se concretan en
[Modelo de actividades](modelo-actividades.md), con columnas compartidas y
detalles JSONB validados por tipo. Su esquema no equivale todavía a una migración
o a un endpoint disponible.

## Información

| Código | Información que se necesita |
|---|---|
| RI-01 | Identificador, propietario, fechas y estado de cada recurso. |
| RI-02 | Nombre, dirección, tipo de acceso, estado y última prueba de una conexión. Nunca su secreto completo. |
| RI-03 | Fuente, colección o tipo de recurso, correspondencias con actividades centrales, control de duplicados, límites y programación cuando se añada. |
| RI-04 | Estado, fechas, duración, intento, cantidades, referencia de seguimiento y error de una ejecución. |
| RI-05 | Evento de origen, condiciones, acciones ordenadas y resultado de una regla. |
| RI-06 | Actividad por usuario, tipo, estado y periodo. |
| RI-07 | Operaciones, datos procesados, tiempos y errores acumulados por periodo. |
| RI-08 | Origen, importancia, mensaje y estado de lectura de un aviso. |
| RI-09 | Código, categoría, mensaje seguro y posibilidad de reintento de un error. |
| RI-10 | Quién realizó una acción, sobre qué recurso, cuándo y con qué resultado. |
| RI-11 | Versión de la API, mensajes, formato de datos y aplicación. |
| RI-12 | Instantes guardados en UTC y mostrados en la zona horaria del usuario. |
| RI-13 | Referencia del registro modificado, tipo de cambio, campos afectados, fecha y ejecución de origen. |
| RI-14 | Identificador y correo de la cuenta, y fechas de creación, última actividad y caducidad de la sesión. Sin contraseñas ni identificadores secretos de sesión. |
| RI-15 | Actividad central: propietario, identidad, fuente y recurso externo, título, información temporal, tipo, estado cuando corresponda, detalles autorizados y última sincronización. |
| RI-16 | Datos académicos, deportivos y sociales definidos en los contratos de origen, sin reducirlos a las etiquetas que muestra el calendario. |

El panel reunirá conexiones, sincronizaciones, ejecuciones, reglas, historial,
avisos, uso y una vista conjunta de actividades personales. La colección de
actividades de Sync es distinta del historial operativo de Monitoring. Cada vista
mostrará solo los datos de la cuenta. Los formularios de demostración introducirán
y actualizarán datos en las fuentes; la agenda central inicial será de consulta.

## Comunicación

| Código | Condición | Prioridad |
|---|---|---|
| RIC-01 | Usar HTTP y JSON, con rutas bajo `/api/v1`. | Inicial |
| RIC-02 | Las tareas en segundo plano devuelven `202`, identificador y dirección de consulta (`Location`). | Inicial |
| RIC-03 | Los errores siguen el mismo formato, Problem Details. | Inicial |
| RIC-04 | Cada servicio valida la sesión consultando al componente de acceso mediante una comunicación interna autenticada, según ADR-005. | Inicial |
| RIC-05 | Cada servicio comprueba a quién pertenece el recurso. | Inicial |
| RIC-06 | Los mensajes comparten estructura e identifican su versión. | Inicial |
| RIC-07 | Recibir otra vez un mensaje no repite una acción ya realizada. | Inicial |
| RIC-08 | Las llamadas externas tienen límites de duración, tamaño y redirecciones. | Inicial |
| RIC-09 | Se comprueba que el dominio y sus redirecciones no lleven a direcciones prohibidas. | Inicial |
| RIC-10 | Los listados se dividen en páginas y se limita la cantidad de peticiones. | Inicial |
| RIC-11 | El panel accede a los servicios mediante la API pública. | Inicial |
| RIC-12 | Documentar formatos de API y eventos con OpenAPI y JSON Schema. | Después |
| RIC-13 | Verificar la firma de los avisos entrantes por webhook. | Opcional |

## Datos

| Código | Condición | Prioridad |
|---|---|---|
| RD-01 | Usar identificadores únicos que no revelen datos personales. | Inicial |
| RD-02 | Guardar siempre el propietario, identificado internamente por `tenant_id`. | Inicial |
| RD-03 | Cada backend utiliza exclusivamente su propia instancia de PostgreSQL, en un contenedor con credenciales, migraciones y volumen persistente independientes. | Inicial |
| RD-04 | Cifrar las credenciales o guardarlas en un almacén de secretos. | Inicial |
| RD-05 | Guardar las contraseñas mediante Argon2id, con una sal aleatoria por contraseña y un coste ajustado al entorno. | Inicial |
| RD-06 | Definir qué estados y cambios de estado admite una ejecución. | Inicial |
| RD-07 | Conservar la relación entre operaciones, su origen y sus intentos. | Inicial |
| RD-08 | Guardar solo el contenido personal necesario. | Inicial |
| RD-09 | Guardar errores sin datos sensibles y con formato común. | Inicial |
| RD-10 | Registrar los cambios de estructura de la base para poder aplicarlos de nuevo. | Inicial |
| RD-11 | Impedir en la base de datos los duplicados que corresponda controlar. | Inicial |
| RD-12 | Poder ajustar cuánto tiempo se conserva la información. | Después |
| RD-13 | Permitir el borrado o anonimización conforme al RGPD. | Después |
| RD-14 | Conservar referencias y huellas del contenido para reconocer cambios entre revisiones. | Inicial |
| RD-15 | Guardar cuentas y sesiones en tablas propias del componente de acceso; exigir correos únicos y registrar caducidad e invalidación de las sesiones. | Inicial |
| RD-16 | Guardar las actividades centrales en Sync y reconocer la procedencia por propietario, conexión, colección/tipo e ID externo, sin confundir recursos de distintas fuentes. | Inicial |
| RD-17 | Guardar juntos la actividad nueva o modificada y el evento pendiente que comunica el cambio. | Inicial |
| RD-18 | Distinguir valores desconocidos de cero; las notas opcionales admiten como máximo dos decimales y pueden actualizarse sobre el recurso existente. | Inicial |

## Seguridad y funcionamiento

| Código | Condición |
|---|---|
| RNF-01 | No incluir secretos en Git, respuestas, mensajes ni registros técnicos. |
| RNF-02 | Bloquear direcciones internas, del propio servidor y de configuración del proveedor cloud. Las pruebas locales solo admiten destinos autorizados expresamente. |
| RNF-03 | Ejecutar contenedores con un usuario sin permisos de administrador y solo los permisos necesarios. |
| RNF-04 | Comprobar con pruebas que una cuenta no accede a recursos de otra. |
| RNF-05 | La ruta de salud `/healthz` comprueba el servicio y sus dependencias. |
| RNF-06 | Objetivo inicial: el 95 % de las respuestas de la API en menos de 500 ms, sin contar la duración de las tareas en segundo plano. |
| RNF-07 | Un fallo externo no bloquea la API ni hace perder una solicitud aceptada. |
| RNF-08 | Registros técnicos en JSON con fecha, nivel, servicio y referencia de operación. |
| RNF-09 | Medir peticiones por segundo, tiempos p95/p99, errores y trabajo procesado. |
| RNF-10 | Poder iniciar el entorno local con un comando de Compose. |
| RNF-11 | Crear la infraestructura con Terraform. |
| RNF-12 | Alojar infraestructura y datos bajo jurisdicción del RGPD. |
| RNF-13 | Comprobar formatos, calidad de código y pruebas automáticamente con cada cambio. |
| RNF-14 | Identificar las versiones de la API y sus cambios incompatibles. |
| RNF-15 | Controlar gasto, identificar recursos y comprobar su eliminación cuando dejen de usarse. |
| RNF-16 | Limitar los intentos de acceso por cuenta y por dirección de origen, con mensajes que no revelen si una cuenta existe. |
| RNF-17 | Usar cookies de sesión protegidas por HTTPS, HttpOnly y SameSite; comprobar origen y token CSRF en las peticiones del navegador que cambian datos. |

Los tiempos p95 y p99 son los que no supera el 95 % y el 99 % de las peticiones. La carga y el entorno de medida se fijarán antes de comprobar el objetivo de rendimiento.

## Criterios de aplicación

La cuenta se obtiene del acceso verificado, no de un campo que se pueda cambiar libremente. Las contraseñas, claves y parámetros sensibles no se devuelven en consultas.

La sesión se renueva con un identificador nuevo al iniciar sesión. Su caducidad inicial es de 30 minutos sin actividad y un máximo de 12 horas desde su creación, comprobados en el servidor. Cerrar sesión invalida el acceso para nuevas peticiones, pero no cancela tareas ya aceptadas. Si el componente de acceso no puede verificar la sesión, se rechaza la petición.

Una misma solicitud con la misma clave identifica la ejecución existente; si cambia su contenido, se rechaza por conflicto. El control de duplicados abarca las solicitudes, los mensajes y las actividades importadas en ejecuciones sucesivas. Una actividad conserva su identidad aunque cambie su fecha, título o nota.

Los cambios se detectan en cada revisión. Al principio serán manuales; la programación se añadirá después. La colección central es el destino inicial y conserva la última información sincronizada. Las retiradas se propagan a partir de marcas explícitas de las fuentes, conservando la identidad central; no se deducen de registros ausentes en una respuesta. No se incluyen edición de vuelta desde el calendario ni conectores reales de Hevy o Strava en este alcance.

El historial distingue entre pedir una acción y completarla. En el destino interno se utilizan transacciones y restricciones para reconocer lo ya guardado. Si se incorpora escritura a destinos externos, se deberá tratar también el resultado incierto de los envíos. Alojar en la UE no sustituye los controles de acceso, conservación y borrado.

## Cierre del Hito 2

La entrega debe completar la implementación funcional inicial: tres fuentes
editables, actividades centralizadas, Sync, Automation, Monitoring, cuentas y
sesiones, frontend y comunicación entre componentes. También requiere pruebas,
persistencia, migraciones, imágenes, Compose reproducible y CI con publicación
en GHCR. Los checkpoints parciales no cierran el hito. Las funciones posteriores
u opcionales conservan su prioridad y la infraestructura y el despliegue se
trabajan después. En este hito se mantiene solo CI, sin CD.

