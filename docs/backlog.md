# Trabajo previsto

Estas historias recogen las funciones y el trabajo de desarrollo. Falta publicarlas como Issues y añadirlas al tablero de GitHub.

Todas son de prioridad inicial. US-01 a US-13 se sitúan en el Hito 2; US-14 en el 3; US-15 en el 4 y US-16 en el 5. El [seguimiento del Hito 1](hito-1.md) recoge lo necesario para preparar el proyecto.

## US-01 — Registrarse e iniciar sesión

Requisitos: RF-01; CU-01.

Como usuario, quiero acceder con una cuenta propia para proteger mis configuraciones.

Criterios de aceptación:

- Una contraseña válida permite iniciar sesión; una inválida no concede acceso.
- Ninguna respuesta incluye contraseña ni hash.
- Cerrar sesión y caducar el acceso funciona según la solución elegida.

Tareas:

- [ ] Elegir cómo gestionar las cuentas y sesiones (ADR-005).
- [ ] Crear registro e inicio de sesión con contraseñas protegidas.
- [ ] Probar acceso, expiración y ausencia de secretos.

## US-02 — Mantener separados los datos de cada cuenta

Requisitos: RNF-04; RD-02; RN-01, RN-02.

Como usuario, quiero acceder únicamente a mis recursos para mantener la privacidad.

Criterios de aceptación:

- Dos cuentas pueden crear recursos independientes.
- Usar un ID ajeno no permite leer, modificar ni ejecutar ese recurso.
- Los mensajes conservan la cuenta propietaria.

Tareas:

- [ ] Aplicar autorización en cada servicio.
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

- [ ] Preparar las tablas para guardar conexiones.
- [ ] Implementar API y protección de secretos.
- [ ] Probar validaciones y autorización.

## US-04 — Comprobar una conexión

Requisitos: RF-03; RIC-08, RIC-09; RNF-02; CU-03.

Como usuario, quiero probar una conexión para detectar errores antes de sincronizar.

Criterios de aceptación:

- La prueba limita cuánto espera y cuántos datos recibe.
- Destinos internos y redirecciones inseguras se bloquean.
- Las pruebas locales solo acceden a servicios autorizados por el administrador.

Tareas:

- [ ] Comprobar la resolución del dominio y las direcciones permitidas.
- [ ] Añadir la ruta de comprobación con respuesta sin datos sensibles.
- [ ] Probar fallos, esperas excesivas y bloqueo de direcciones internas.

## US-05 — Configurar una sincronización

Requisitos: RF-04, RF-06, RF-21; RI-03, RI-13; RD-14; CU-04.

Como usuario, quiero relacionar origen, destino y campos para adaptar formatos sin escribir código.

Criterios de aceptación:

- Origen y destino pertenecen al usuario.
- La relación entre campos conserva el título y la fecha de una tarea en el formato del destino.
- Comparar con una revisión anterior distingue información nueva, modificada y sin cambios.
- Configuraciones no válidas se rechazan antes de ejecutar.

Tareas:

- [ ] Definir el formato admitido y los datos de la sincronización.
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

- [ ] Guardar la ejecución y su mensaje pendiente; añadir el proceso que la realiza.
- [ ] Preparar las colas y confirmar los mensajes procesados.
- [ ] Probar el recorrido y la recuperación de mensajes tras un fallo.

## US-07 — Evitar duplicados

Requisitos: RF-07; RD-11; CU-11.

Como usuario, quiero repetir una solicitud de forma controlada para evitar tareas o registros duplicados.

Criterios de aceptación:

- La misma clave y contenido devuelven la ejecución existente; otro contenido con esa clave se rechaza.
- Dos procesos simultáneos o un mensaje repetido no realizan la misma acción dos veces.
- El destino de pruebas permite actualizar por identificador; si un envío no se puede repetir con seguridad, queda pendiente de revisión.

Tareas:

- [ ] Definir cómo identificar las solicitudes y cuánto conservar sus claves.
- [ ] Registrar mensajes procesados y controlar ejecuciones simultáneas.
- [ ] Probar mensajes repetidos y respuestas perdidas después de guardar un dato.

## US-08 — Revisar resultados y errores

Requisitos: RF-08; RI-04, RI-09; CU-10.

Como usuario, quiero consultar una ejecución para saber qué se procesó y por qué falló.

Criterios de aceptación:

- El detalle muestra estado, fechas, cantidades y referencia de seguimiento.
- Los errores indican la causa sin mostrar datos sensibles.
- Solo el propietario puede consultar la ejecución.

Tareas:

- [ ] Añadir la consulta y su vista en el panel.
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

Como usuario, quiero ver actividad y consumo para supervisar mis integraciones.

Criterios de aceptación:

- La vista muestra cambios personales, sincronizaciones y avisos, y filtra por periodo, tipo y estado.
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

- Un comando inicia servicios, RabbitMQ, base de datos y aplicaciones simuladas con redes y volúmenes.
- Las imágenes separan preparación y ejecución y usan un usuario sin permisos de administrador.
- La comprobación automática (CI) revisa el código, ejecuta pruebas y publica las imágenes con su versión en GitHub Container Registry.

Tareas:

- [ ] Crear Dockerfiles, Compose y env de ejemplo.
- [ ] Añadir revisiones de código y pruebas automáticas.
- [ ] Comprobar que los datos se conservan y las imágenes se construyen y publican sin secretos.

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

## Ampliaciones después del primer flujo

Revisiones programadas (RF-16), reintentos (RF-17), recuperación de mensajes fallidos (RF-18) y acciones HTTP (RF-19) tendrán historias propias. La cancelación (RF-20) es opcional. Guardar las solicitudes, controlar duplicados y mostrar fallos forma parte de la versión inicial.

