# Automation: alcance inicial

Diseño acordado el 19/11/2026. Las funciones descritas están pendientes de
implementación. Este documento concreta RF-10 a RF-13, RF-16 y RF-26.

## Responsabilidades

Automation decide cuándo actuar y conserva la configuración, las evaluaciones y
las solicitudes de acción. Tiene su propio servicio NestJS y PostgreSQL.

- Sync sigue siendo responsable de importar las fuentes y guardar actividades.
- Monitoring guarda los avisos y permite consultarlos y marcarlos como leídos.
- Synkron ofrece configuración, historial de automatizaciones y bandeja de avisos.

La comunicación utiliza API internas autenticadas y RabbitMQ. Ningún servicio
consulta directamente la base de otro. Toda acción queda limitada a la cuenta
propietaria; un identificador recibido por HTTP no acredita esa propiedad.

## Sincronizaciones programadas

Cada programación tiene nombre, definición de Sync, horario y estado habilitado.
La definición debe pertenecer a la misma cuenta.

Se admiten intervalos de 15, 30 o 60 minutos y una ejecución diaria a una hora
elegida. La zona inicial es Europe/Madrid. Los instantes se guardan en UTC;
una hora diaria se interpreta como hora local, respetando el horario estacional.

Tras una parada se solicita como máximo una ejecución de recuperación por
programación, agrupando las ocasiones omitidas. Después se calcula la siguiente
ocasión futura. No se lanza una ejecución por cada intervalo perdido.

Una ocasión aceptada tiene una identidad persistente. Reintentar su entrega a
Sync conserva esa identidad y no crea otra ejecución. Deshabilitar una
programación impide generar nuevas solicitudes; no cancela trabajos ya aceptados.

## Reglas por eventos

Automation recibe su propia copia de data.changed, sync.completed y sync.failed.
Las reglas pueden acotarse por fuente o tipo de actividad y combinar condiciones
mediante todas o alguna. Los campos y operadores estarán enumerados y validados;
no se admite código ni expresiones ejecutables aportadas por usuarios.

Ejemplos iniciales:

- Avisar cuando changed_fields incluya grade o schedule.
- Avisar de una retirada explícita.
- Avisar de una sincronización fallida.

Los eventos actuales identifican los campos modificados, pero no contienen sus
valores ni los anteriores. Cuando haga falta conocer el estado actual, se
consulta la API de Sync con autorización interna y ámbito de cuenta. Esa consulta
no permite reconstruir una transición histórica entre valores.

Las acciones son notify y start_sync. Se registra la evaluación y el estado de
cada acción, distinguiendo solicitud aceptada y resultado final. Los mensajes
duplicados no repiten sus efectos. Las acciones conservan su procedencia y tienen
un límite de encadenamiento para evitar bucles.

## Avisos y recordatorios

notify solicita un aviso a Monitoring. El aviso tiene propietario, mensaje,
procedencia, fecha y estado de lectura. Reenviar una misma solicitud no crea otro
aviso. La interfaz permite consultar la bandeja y marcar avisos como leídos.

Los recordatorios revisan las actividades actuales de Sync mediante su API;
no dependen de que llegue un evento nuevo desde Academic.

- Con vencimiento que incluye hora, se avisa al entrar en el plazo configurado,
  por ejemplo 24 horas antes.
- Con vencimiento que solo tiene fecha, se avisa a las 09:00 de Madrid del día
  anterior. Esto no asigna una hora de vencimiento a la actividad.
- Las entregas retiradas o entregadas no generan nuevos recordatorios pendientes.
- Cada recordatorio conserva una identidad que impide repetirlo en cada revisión.

## Interfaz

La sección de Automation tendrá sincronizaciones programadas, reglas por eventos,
recordatorios e historial. Los formularios ofrecerán opciones delimitadas y
permitirán activar y desactivar configuraciones. Los avisos se consultarán desde
la bandeja de Synkron, respaldada por Monitoring.

## Orden de desarrollo

1. Concretar el contrato y alinear requisitos y backlog.
2. Preparar el servicio, PostgreSQL, migraciones y autorización.
3. Programar solicitudes de sincronización a Sync sin duplicados.
4. Evaluar reglas por eventos y registrar sus acciones.
5. Entregar avisos a Monitoring y gestionar su lectura.
6. Generar recordatorios a partir de las actividades actuales.
7. Incorporar configuración, historial y bandeja al frontend.
8. Comprobar el recorrido completo, paradas y recuperación.

El primer recorrido será programación → solicitud a Sync → sincronización →
resultado visible en Monitoring. Las políticas exactas ante horas locales
inexistentes o repetidas, la primera ocasión al activar una programación y los
cambios de vencimiento se concretarán antes de implementar esas funciones.
