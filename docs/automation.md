# Automation: alcance inicial

Diseño acordado el 19/11/2026 y actualizado el 22/11/2026. Este documento
concreta RF-10 a RF-13, RF-16 y RF-26. Los apartados 1 a 8 están cerrados para
el flujo de entregas académicas. La bandeja, el historial, la entrega real de
`start_sync` y el recorrido conjunto se han comprobado en Compose y navegador.
Las nuevas pruebas de PostgreSQL también han pasado en el entorno local. La
ejecución del nuevo workflow en GitHub queda pendiente de subir este checkpoint.

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

El proceso `automation-scheduler` entrega tanto las solicitudes programadas como
las acciones `start_sync`. Una acción usa su ID persistido como clave de
idempotencia y como `automation_action_id`. Los resultados de una sincronización
derivada conservan ese origen: pueden generar avisos, pero sus nuevas acciones
`start_sync` quedan `blocked` con código `chain_limit`. El despachador comprueba
también ese límite antes de entregar acciones pendientes antiguas.

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
- Los exámenes usan la fecha de celebración (`start`), con las mismas opciones de
  antelación. Solo se recuerdan los programados; los realizados, cancelados,
  retirados y pasados quedan excluidos. Para fechas sin hora, el día sigue vigente
  hasta que termine en Madrid.
- Las reglas de entregas conservan su filtro de `academic.assignment`. Los nuevos
  casos de exámenes filtran explícitamente `academic.exam` (alta, retirada, nota,
  fecha o estado).
- Cada recordatorio conserva una identidad que impide repetirlo en cada revisión.

## Interfaz

La sección Automatizaciones permite consultar, crear, editar y pausar
programaciones y reglas, además de configurar recordatorios. El editor de reglas
ofrece situaciones de entregas y exámenes y acciones de aviso o inicio de sincronización. Las reglas
con varias acciones o condiciones que el editor no representa se conservan y
pueden activarse o pausarse; su edición sigue disponible mediante la API.

El historial reúne solicitudes de programación, acciones de reglas y
recordatorios, filtrados por origen y estado. Una acción `accepted` confirma la
aceptación de la solicitud, no que la sincronización haya terminado. Incluye
intentos, siguiente reintento, motivos de fallo y accesos al resultado o actividad.

La cabecera ofrece una bandeja de avisos con contador de no leídos, filtros,
paginación, marcado de lectura y accesos a actividad o resultado. El contador se
actualiza cada 15 segundos mientras la página está visible. Monitoring mantiene
la propiedad, procedencia, deduplicación y primera fecha de lectura.

## Orden de desarrollo

1. Concretar el contrato y alinear requisitos y backlog.
2. Preparar el servicio, PostgreSQL, migraciones y autorización.
3. Programar solicitudes de sincronización a Sync sin duplicados.
4. Evaluar reglas por eventos y registrar sus acciones.
5. Entregar avisos a Monitoring y gestionar su lectura.
6. Generar recordatorios a partir de las actividades actuales.
7. Incorporar configuración, historial y bandeja al frontend.
8. Comprobar el recorrido completo, paradas y recuperación.

Se ha comprobado manualmente el recorrido programación → Sync → Monitoring y
la entrega, deduplicación, recuperación y cancelación de avisos y recordatorios.
Al activar un intervalo, la primera ocasión es un intervalo después; las horas
diarias inexistentes usan el primer minuto válido posterior y las repetidas
usan la primera ocurrencia. Cambiar de vencimiento permite un recordatorio con
otra identidad; desactivar los recordatorios cancela pendientes al revisarlos.

Para actualizar las tres últimas incorporaciones, sin migraciones nuevas:

```bash
docker compose up -d --build automation automation-scheduler web
docker compose up -d monitoring automation-consumer automation-notifications \
  sync-publisher sync-event-publisher sync-worker
```

Comprobación manual del 22/11/2026:

- La bandeja muestra avisos reales, permite marcarlos como leídos, actualiza el
  contador, filtra por lectura y abre el contexto de actividad o sincronización.
- El historial permite filtrar por origen y estado, consultar motivos de
  cancelación y abrir resultados en Monitoring.
- Una regla `start_sync` creada desde la interfaz produjo una acción aceptada
  después de una sincronización manual. El resultado derivado produjo otra
  acción bloqueada por `chain_limit`, evitando la siguiente sincronización.
- La regla de comprobación quedó pausada después de verificar ambas acciones.

Estas comprobaciones son evidencia manual; no se presentan como pruebas de CI.

## Revisión final del flujo de entregas

La recuperación se apoya en comprobaciones ya realizadas, conservando sus
identidades y resultados como evidencia:

| Escenario | Evidencia observada |
|---|---|
| Caída de Monitoring | Acción `a34cb148-3d8d-46bc-adb2-01eea4c8fd25`: pendiente con `monitoring_unavailable`, aceptada al tercer intento tras restaurar el servicio. |
| Reenvío de aviso ya leído | Aviso `155fc9b2-950e-4eac-9fab-03c0975ccaef`: mismo ID tras reenviar la acción, primera lectura conservada y contador sin incrementar. |
| Recordatorio sin hora | Acción `1aaea07c-bb04-4a0d-bea4-368870c01f5e`: fecha del día siguiente, aviso calculado a las 09:00 de Madrid y entrega aceptada. |
| Cancelación durante una caída | Acción `3c49e13e-466d-4c61-ad03-fb15a8c9c0ce`: pendiente mientras Monitoring estaba detenido y cancelada con `reminder_obsolete` después de sincronizar el estado `submitted`. |
| Límite de encadenamiento | Regla creada desde la interfaz: primera acción aceptada y siguiente bloqueada con `chain_limit`; regla pausada al finalizar. |

La comprobación conjunta se completó el 22/11/2026: regla de aviso por cambio de
vencimiento, edición de fecha en Campus y sincronización. Se comprobaron la fecha
centralizada, un único aviso, su actividad asociada y la acción aceptada en el
historial. La regla de comprobación se dejó pausada.

Las pruebas `notifications.e2e-spec.ts` de Monitoring e `history.e2e-spec.ts` de
Automation pasaron con PostgreSQL en Compose. Los checks locales de formato,
lint y tipos y las nueve pruebas unitarias de ambos servicios también pasaron.
Esto cierra el subpunto 8 y el flujo funcional de entregas; no supone el cierre de
las demás fuentes ni de todos los requisitos del Hito 2.

## Integración continua

El workflow incluye trabajos separados para Automation y Monitoring mediante
una matriz. Cada uno instala dependencias, comprueba formato y lint, compila,
ejecuta las pruebas unitarias y aplica sus migraciones en un PostgreSQL temporal
antes de ejecutar las pruebas de integración. Las imágenes de ambos servicios
también se revisan y construyen. La nueva ejecución en GitHub queda pendiente de
subir este checkpoint.

Las pruebas de PostgreSQL cubren la concurrencia del planificador, el origen de
acciones, la deduplicación de eventos y avisos, la primera lectura y el aislamiento
de cuentas en avisos e historial. Los nuevos fixtures usan cuentas aleatorias y
solicitudes no ejecutables por los procesos locales, y eliminan sus propias filas.
Las colas reales, las paradas de contenedores y la interfaz se comprueban
manualmente; no se incluyen RabbitMQ ni navegador en estos trabajos de CI.
