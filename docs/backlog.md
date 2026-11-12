# Trabajo previsto

Estas historias resumen las funciones y el trabajo de desarrollo. El seguimiento actualizado está en las [Issues](https://github.com/jotace-18/Synkron/issues) y en el [tablero de GitHub](https://github.com/users/jotace-18/projects/1).

Esta revisión del diseño no modifica el seguimiento remoto. La correspondencia
de las nuevas historias y cambios de alcance con Issues y Project deberá revisarse
al actualizar ese seguimiento.

US-01 a US-13 y US-17 a US-19 forman parte de la implementación inicial que debe
quedar completa en el Hito 2. US-14 corresponde a infraestructura, US-15 al
despliegue posterior y US-16 a la validación de funcionamiento y rendimiento,
con comprobaciones básicas desde el desarrollo y medidas finales en despliegue.
El flujo actual incluye CI, sin CD.

Las tareas marcadas solo acreditan su alcance concreto. La autenticación y las
operaciones actuales de conexiones están probadas; esto no cierra el frontend,
los demás servicios ni el hito. El alcance de entrada se detalla en
[Servicios de origen](servicios-origen.md).

## US-01 — Registrarse e iniciar sesión

Requisitos: RF-01; CU-01.

Como usuario, quiero acceder con una cuenta propia para proteger mis configuraciones.

Criterios de aceptación:

- Una contraseña válida permite iniciar sesión; una inválida no concede acceso.
- Ninguna respuesta incluye contraseña ni hash.
- Cerrar sesión invalida la sesión en el servidor; también se rechazan sesiones caducadas.
- La cookie está protegida y las peticiones que cambian datos comprueban origen y token CSRF.

Tareas:

- [x] Definir cuentas propias y sesiones en PostgreSQL (ADR-005).
- [x] Crear registro e inicio de sesión con contraseñas protegidas en la API.
- [x] Crear cierre de sesión y comprobación de la cuenta actual.
- [x] Probar acceso, expiración, cierre de sesión, CSRF y ausencia de secretos en el backend.

## US-02 — Mantener separados los datos de cada cuenta

Requisitos: RNF-04; RD-02; RN-01, RN-02.

Como usuario, quiero acceder únicamente a mis recursos para mantener la privacidad.

Criterios de aceptación:

- Dos cuentas pueden crear recursos independientes.
- Usar un ID ajeno no permite leer, modificar ni ejecutar ese recurso.
- Los mensajes conservan la cuenta propietaria.

Tareas:

- [x] Aplicar autorización de sesiones y propiedad a las operaciones actuales de API y Sync.
- [ ] Extender la autorización a las actividades, Automation, Monitoring y las fuentes editables.
- [ ] Comprobar la cuenta propietaria en los mensajes internos.
- [ ] Probar lecturas y escrituras cruzadas.

## US-03 — Añadir una conexión segura

Requisitos: RF-02; RI-02; RD-04; CU-02.

Como usuario, quiero guardar una conexión reutilizable para configurar integraciones sin repetir credenciales.

Criterios de aceptación:

- Se crean y modifican nombre, URL y autenticación.
- Las consultas omiten secretos y parámetros sensibles.
- Deshabilitar conserva historial y bloquea nuevas ejecuciones.

Tareas:

- [x] Preparar las tablas y migraciones para guardar conexiones.
- [x] Crear y listar conexiones propias, con paginación y cifrado de Bearer.
- [x] Probar validaciones y autorización de esas operaciones.
- [ ] Añadir detalle, edición y desactivación, conservando historial y permisos.

## US-04 — Comprobar una conexión

Requisitos: RF-03; RIC-08, RIC-09; RNF-02; CU-03.

Como usuario, quiero probar una conexión para detectar errores antes de sincronizar.

Criterios de aceptación:

- La prueba limita cuánto espera y cuántos datos recibe.
- Destinos internos y redirecciones inseguras se bloquean.
- Las pruebas locales solo acceden a servicios autorizados por el administrador.

Tareas:

- [x] Aplicar una lista explícita de orígenes controlados de Docker.
- [x] Añadir la ruta de comprobación con respuesta sin datos sensibles.
- [x] Probar fallos, límites de tiempo y tamaño, redirecciones y destinos fuera de la lista.
- [ ] Guardar la fecha y el resultado de la última prueba.
- [ ] Completar la política de resolución y direcciones antes de admitir dominios públicos arbitrarios.

## US-05 — Configurar una sincronización

Requisitos: RF-04, RF-06, RF-21; RI-03, RI-13; RD-14; CU-04.

Como usuario, quiero relacionar una fuente y sus campos con las actividades centrales de Synkron sin escribir código.

Criterios de aceptación:

- La conexión de origen pertenece al usuario y el destino es la colección central de Sync.
- La relación entre campos conserva título, información temporal, procedencia y detalles necesarios de cada tipo.
- Comparar con una revisión anterior distingue información nueva, modificada y sin cambios.
- Configuraciones no válidas se rechazan antes de ejecutar.

Tareas:

- [x] Documentar parte común, identidad y formas temporales de las actividades.
- [ ] Cerrar los detalles por tipo, relaciones y definición de importación.
- [ ] Implementar correspondencias de campos y comparación de contenido.
- [ ] Probar rutas, tipos y referencias inválidas.

## US-06 — Iniciar una sincronización

Requisitos: RF-05, RF-08, RF-09; RIC-02; CU-05.

Como usuario, quiero solicitar una ejecución en segundo plano para seguir trabajando mientras se procesan los datos.

Criterios de aceptación:

- La solicitud devuelve su identificador y la dirección para consultar el estado.
- La solicitud se guarda antes de aceptarla y pasa de pendiente a en curso y terminada o fallida.
- El resultado produce un evento y puede consultarse en Sync.

Tareas:

- [x] Implementar aceptación `202` con ejecución y trabajo pendiente en una transacción PostgreSQL.
- [ ] Añadir publicador, Rabbit y worker; actualmente los trabajos permanecen en `queued`.
- [ ] Preparar las colas y confirmar los mensajes procesados.
- [ ] Probar el recorrido y la recuperación de mensajes tras un fallo.

## US-07 — Evitar duplicados

Requisitos: RF-07; RD-11; CU-11.

Como usuario, quiero repetir una solicitud de forma controlada para evitar tareas o registros duplicados.

Criterios de aceptación:

- La misma clave y contenido devuelven la ejecución existente; otro contenido con esa clave se rechaza.
- Dos procesos simultáneos o un mensaje repetido no realizan la misma acción dos veces.
- Reimportar el mismo recurso actualiza su actividad central; un examen y una entrega o dos fuentes distintas no se confunden por compartir un ID externo.
- Las actividades y los avisos no se duplican por repetir mensajes o ejecuciones.

Tareas:

- [x] Implementar identidad de solicitudes por cuenta, clave y definición, con conflicto y conservación ligada al historial.
- [x] Definir identidad de actividades por cuenta, conexión, colección e ID externo.
- [ ] Completar conflictos entre configuraciones y deduplicación del procesamiento de mensajes.
- [ ] Registrar mensajes procesados y controlar ejecuciones simultáneas.
- [ ] Probar mensajes repetidos, concurrencia e interrupciones después de guardar actividades.

## US-08 — Revisar resultados y errores

Requisitos: RF-08; RI-04, RI-09; CU-10.

Como usuario, quiero consultar una ejecución para saber qué se procesó y por qué falló.

Criterios de aceptación:

- El detalle muestra estado, fechas, cantidades y referencia de seguimiento.
- Los errores indican la causa sin mostrar datos sensibles.
- Solo el propietario puede consultar la ejecución.

Tareas:

- [x] Implementar consulta de ejecución propia con estado, fechas, contadores y errores seguros.
- [ ] Añadir su vista en el panel.
- [ ] Unificar el formato de errores y las medidas de cada ejecución.
- [ ] Probar resultados correctos, parciales y fallidos.

## US-09 — Crear automatización por evento

Requisitos: RF-10; RI-05; CU-07.

Como usuario, quiero definir una regla por evento para recibir avisos o iniciar acciones cuando cambie mi información.

Criterios de aceptación:

- La regla admite cambios de datos y resultados de sincronización, con condiciones y acciones válidas.
- Una regla deshabilitada no inicia nuevas ejecuciones.
- Las referencias a sincronizaciones son del mismo usuario.

Tareas:

- [ ] Preparar el formato y las tablas de las reglas.
- [ ] Implementar API y validación de referencias.
- [ ] Probar activación, edición y permisos.

## US-10 — Combinar condiciones

Requisitos: RF-11; RN-09; CU-08.

Como usuario, quiero combinar condiciones para ejecutar acciones solo cuando corresponda.

Criterios de aceptación:

- Se pueden comparar datos y exigir todas las condiciones o al menos una.
- No se evalúa código aportado por usuarios.
- Los mensajes repetidos no repiten acciones y las reglas no forman cadenas sin límite.

Tareas:

- [ ] Definir las comparaciones admitidas y cómo comprobarlas.
- [ ] Guardar la ejecución e impedir que se repita la misma acción.
- [ ] Probar datos incorrectos, repeticiones y reglas que se activen entre sí.

## US-11 — Ejecutar acciones internas

Requisitos: RF-12, RF-13; CU-08.

Como usuario, quiero notificar o iniciar otra sincronización para automatizar el paso siguiente.

Criterios de aceptación:

- `notify` crea un aviso para su propietario.
- `start_sync` solicita una sincronización válida de la misma cuenta.
- Una solicitud de acción y su finalización se distinguen en el historial.

Tareas:

- [ ] Definir mensajes, registro de peticiones pendientes e identificadores de acción.
- [ ] Procesar las solicitudes de aviso e inicio de sincronización.
- [ ] Probar evento, condición, acción y resultado.

## US-12 — Consultar actividad y uso

Requisitos: RF-14, RF-15; RI-06 a RI-08; CU-09, CU-13.

Como usuario, quiero ver el historial y consumo para supervisar mis integraciones.

Criterios de aceptación:

- La vista muestra el historial de cambios, sincronizaciones y avisos, y filtra por periodo, tipo y estado. La colección de actividades del calendario se consulta por separado en Sync.
- Las estadísticas coinciden con las operaciones realizadas, incluso con mensajes repetidos.
- El panel indica cuándo la actividad todavía se está actualizando.

Tareas:

- [ ] Guardar actividad y estadísticas por usuario.
- [ ] Crear la API y el panel web.
- [ ] Probar filtros, mensajes repetidos y permisos.

## US-13 — Reproducir el entorno local

Requisitos: RNF-03, RNF-10, RNF-13.

Como desarrollador, quiero levantar y verificar el sistema para trabajar sobre un entorno reproducible.

Criterios de aceptación:

- Un comando inicia los backends, el frontend, RabbitMQ, una instancia de PostgreSQL por backend y las tres fuentes de demostración editables con su persistencia, redes y volúmenes.
- Cada backend solo accede a su base, con credenciales, migraciones y volumen persistente independientes.
- Las imágenes que requieren compilación separan preparación y ejecución; todas usan un usuario sin permisos de administrador.
- La comprobación automática (CI) revisa el código, ejecuta pruebas y publica las imágenes con su versión en GitHub Container Registry.

Tareas:

- [x] Crear Dockerfiles, Compose y env para API, Sync y la fuente estática actual.
- [x] Configurar las bases de API y Sync con redes privadas, roles y volúmenes propios.
- [x] Añadir CI de pruebas y construcción para esos componentes y la API ficticia actual.
- [ ] Incorporar Automation, Monitoring, RabbitMQ, frontend y las tres fuentes editables.
- [ ] Completar sus bases, migraciones y configuración sin compartir credenciales.
- [ ] Publicar todas las imágenes necesarias en GHCR identificadas por SHA o versión.
- [ ] Verificar arranque y migraciones desde copia limpia, persistencia y ausencia de secretos.

## US-14 — Preparar el alojamiento

Requisitos: RNF-11, RNF-15.

Como administrador, quiero preparar el alojamiento desde código para reproducirlo y controlar costes.

Criterios de aceptación:

- Terraform define red, recursos de ejecución y almacenamiento; su estado se guarda de forma remota y segura.
- Se puede detectar y corregir un cambio manual que no coincida con lo definido en código.
- Se documenta destrucción de recursos y gasto previsto.

Tareas:

- [ ] Elegir proveedor, región y presupuesto.
- [ ] Preparar Terraform y evitar cambios simultáneos en su estado.
- [ ] Guardar las comprobaciones de creación, cambio manual, detección, corrección y eliminación.

## US-15 — Desplegar una versión validada

Requisitos: RNF-11, RNF-12; RNF-03.

Como administrador, quiero publicar una versión cuando supere las pruebas para actualizar con controles de seguridad.

Criterios de aceptación:

- La publicación automática se activa después de superar las comprobaciones de `main`.
- Antes de publicar se comprueba que el alojamiento coincida con lo definido en código.
- Se usan permisos mínimos, secretos y la región requerida por el enunciado.

Tareas:

- [ ] Automatizar la publicación reemplazando los contenedores de forma controlada.
- [ ] Usar `terraform plan -detailed-exitcode` y decidir cómo actuar si detecta cambios.
- [ ] Documentar permisos, secretos y ubicación.

## US-16 — Comprobar funcionamiento y rendimiento

Requisitos: RNF-05, RNF-08, RNF-09.

Como administrador, quiero medir salud y carga para conocer los límites del despliegue.

Criterios de aceptación:

- Las comprobaciones de salud revisan también las dependencias y los registros técnicos usan JSON.
- Una prueba mide peticiones por segundo, tiempos de respuesta p95/p99, errores y recursos utilizados.
- La documentación final incluye reproducción, despliegue, URL y release v1.0.0.

Tareas:

- [ ] Añadir salud, registros técnicos y medidas desde el principio.
- [ ] Crear carga reproducible con escenario y datos documentados.
- [ ] Analizar resultados y publicar release al completar el proyecto.

## US-17 — Mantener las tres fuentes de actividades

Requisitos: RF-23, RF-24; RI-16; CU-15, CU-17.

Como usuario, quiero introducir y actualizar datos académicos, deportivos y
sociales en sus servicios para alimentar Synkron con actividades propias.

Criterios de aceptación:

- Académico permite entregas, exámenes, sesiones de estudio/trabajo y eventos generales con los campos descritos en el contrato de origen.
- Deporte conserva los datos comunes y los específicos de gimnasio, fútbol, senderismo y carrera; otros deportes admiten un registro sencillo.
- Planes sociales admite título, fecha/hora, ubicación y participantes opcionales; las propuestas adicionales se cierran antes de implementarse.
- Los datos persisten al reiniciar. Solo se exponen los registros autorizados por cuenta o credencial.
- Cada registro mantiene su ID al modificarse. Las notas opcionales pueden añadirse después con máximo dos decimales.
- Las sesiones de estudio pueden relacionarse con entregas o exámenes, sin compartir su estado de finalización.

Tareas:

- [ ] Cerrar validaciones y estados pendientes de [Servicios de origen](servicios-origen.md).
- [x] Implementar la API académica de entregas: validación, autorización por cuenta, creación, listado, detalle y edición completa.
- [x] Implementar borrado lógico de entregas y exportación autenticada con marcas de borrado para Sync.
- [x] Validar la migración de borrado y los nuevos escenarios de ciclo de vida contra PostgreSQL en el entorno local.
- [ ] Implementar persistencia y API de creación, modificación y lectura de cada fuente.
- [ ] Añadir formularios de entrada sencillos y acceso autorizado sin secretos en el navegador.
- [ ] Probar cambios, permisos, notas desconocidas/cero y persistencia.

## US-18 — Centralizar y actualizar actividades

Requisitos: RF-04, RF-06, RF-07, RF-21, RF-24; RI-15; RD-16, RD-17; CU-05, CU-17.

Como usuario, quiero reunir las actividades de mis fuentes y conservar sus
actualizaciones y procedencia para consultarlas en un espacio común.

Criterios de aceptación:

- Sync guarda las actividades en su propia base, con propietario, fuente, recurso externo y detalles autorizados.
- Modificar un horario, una nota o los datos de una sesión actualiza la misma actividad central.
- Dos recursos distintos con el mismo ID externo no se mezclan; repetir una revisión sin cambios no genera nuevas actividades ni avisos.
- Cada cambio y su evento pendiente se guardan juntos antes de comunicarse.
- Se distinguen fechas sin hora de instantes con zona, sin inventar horarios desconocidos.

Tareas:

- [x] Documentar campos comunes y reglas temporales en [Modelo de actividades](modelo-actividades.md).
- [x] Crear y probar la migración de actividades y sus restricciones de identidad/propiedad.
- [ ] Cerrar los esquemas de detalles y relaciones de cada tipo.
- [x] Implementar la correspondencia de entregas académicas, la identidad común, la huella y la actualización transaccional por actividad.
- [x] Guardar las marcas explícitas de retirada y permitir la reactivación conservando la identidad central.
- [x] Integrar conexión guardada, lectura paginada, validación, transformación y persistencia de entregas; comprobar la primera importación y su repetición con Academic real.
- [x] Completar la demostración manual de actualización y retirada con Academic real, conservando el mismo ID y comprobando la repetición sin cambios.
- [ ] Ampliar las correspondencias a las demás colecciones y fuentes.
- [ ] Guardar cada cambio y su evento pendiente juntos mediante outbox.
- [ ] Excluir las actividades retiradas de la futura consulta de actividades activas.
- [ ] Añadir lectura autenticada y paginada de actividades propias.
- [ ] Probar dos fuentes, actualizaciones, relaciones, repeticiones y accesos cruzados.

## US-19 — Consultar la agenda y el calendario

Requisitos: RF-22; RI-12, RI-15, RI-16; RIC-11; CU-16.

Como usuario, quiero ver juntas mis actividades académicas, deportivas y sociales
para consultar mis compromisos y su procedencia.

Criterios de aceptación:

- La vista reúne las actividades de la cuenta y permite filtrar por periodo, fuente y tipo.
- El detalle conserva la información necesaria de cada tipo y sus relaciones.
- Abrir la vista consulta lo ya centralizado, sin leer de nuevo todas las fuentes.
- La vista inicial es de consulta; las modificaciones se hacen en el origen y llegan al sincronizar.
- Títulos, abreviaturas, colores e intensidad representan los datos semánticos sin sustituirlos. La presentación concreta se fija al implementar el frontend.
- Conexiones, ejecuciones, reglas, historial y avisos también disponen de sus vistas funcionales.

Tareas:

- [ ] Completar React, API general, sesiones y origen HTTPS común.
- [ ] Implementar agenda/calendario, filtros, detalles y estados de carga/error.
- [ ] Conectar las vistas de gestión, ejecución, reglas y seguimiento.
- [ ] Probar desde el navegador creación en fuente, importación, consulta conjunta y actualización posterior.

## Ampliaciones posteriores

Revisiones programadas (RF-16), reintentos (RF-17), recuperación de mensajes fallidos (RF-18), acciones HTTP (RF-19) y sincronización hacia destinos externos (RF-25) tendrán historias propias. La cancelación de ejecuciones (RF-20) es opcional y distinta de modificar el estado de un compromiso en su fuente. Hevy y Strava no se integran ahora. Guardar solicitudes, centralizar actividades, controlar duplicados y mostrar fallos forma parte de la implementación inicial que debe completarse en el Hito 2.

