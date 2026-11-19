# Monitoring: centro de mandos

## Objetivo

Permitir que cada usuario conozca el resultado de sus sincronizaciones,
consulte los cambios detectados e investigue los fallos desde Synkron.

Monitoring recibe eventos de RabbitMQ y conserva su propio historial.
No consulta directamente las bases de datos de otros servicios.

## Resumen

El panel muestra indicadores de las últimas 24 horas:

- Sincronizaciones completadas.
- Sincronizaciones fallidas.
- Actividades creadas, actualizadas y retiradas.
- Fecha y resultado de la última sincronización observada.

Los resultados se cuentan por ejecución. Los cambios se cuentan por evento
data.changed, diferenciando creadas, actualizadas y retiradas.

Los mensajes repetidos no incrementan los indicadores: se deduplican por
event_id. Dos eventos distintos sobre una misma actividad representan dos
cambios y se contabilizan por separado.

## Historial de sincronizaciones

Cada fila muestra:

- Fecha del resultado.
- Identificador de ejecución.
- Identificador de definición.
- Resultado: completada o fallida.
- Contadores de registros leídos, creados, actualizados, sin cambios,
  retirados e ignorados.

El historial permite filtrar por resultado y consultar páginas anteriores.

## Detalle de una ejecución

Al seleccionar una ejecución se muestran:

- Resultado y contadores.
- Código y mensaje seguro del error, si existe.
- Cambios relacionados: actividad, tipo de cambio y campos afectados.
- Eventos relacionados mediante correlation_id.

Los identificadores permiten relacionar el historial con los recursos de Sync.
No se copian credenciales ni el contenido personal completo de las actividades.

## Incidencias recientes

El panel destaca las sincronizaciones fallidas y permite abrir su detalle.

Un fallo pasado no significa que el servicio siga caído.
Una ejecución posterior correcta no elimina el fallo del historial.

## Alcance inicial

Se consumen data.changed, sync.completed y sync.failed.

La información puede aparecer con retraso respecto a Sync.
Se conserva la fecha del evento y la fecha de recepción en Monitoring.

El historial comienza con los eventos que reciba la nueva cola.
No se presupone que incluya ejecuciones anteriores a su creación.

Todos los datos y consultas quedan limitados al usuario autenticado.

## Ampliaciones posteriores

- Seguimiento de ejecuciones en cola y en curso.
- Duración de las sincronizaciones.
- Comprobaciones de salud de los servicios.
- Mensajes rechazados e incidencias de infraestructura.
- Resultados de Automation y avisos.
