# Decisiones de diseño

El diseño de Synkron busca que las sincronizaciones, las reglas y el seguimiento de actividad puedan funcionar por separado. Estas decisiones organizan ese trabajo y explican cómo se guardan los datos y se controlan los fallos.

## ADR-001. Separación de responsabilidades

Sync se ocupa de conectar servicios y sincronizar información. Automation comprueba las reglas y solicita acciones. Monitoring reúne los cambios, resultados y avisos.

Esta separación permite modificar una parte sin concentrar toda la lógica en la misma aplicación. También permite dedicar más recursos a las sincronizaciones cuando aumenta el trabajo. El panel utiliza una entrada API común para acceder a las funciones de cada servicio.

## ADR-002. Trabajo en segundo plano

Una sincronización puede tardar más que una consulta del panel. Por eso, la solicitud se guarda y el trabajo continúa en segundo plano, mientras el usuario puede consultar su estado.

RabbitMQ reparte las tareas entre los procesos de Sync y comunica los cambios a Automation y Monitoring mediante colas separadas. Las consultas y la configuración se realizan por HTTP.

Cada servicio lleva el seguimiento de los mensajes que procesa para que una interrupción o una repetición no haga perder el trabajo ni duplique una acción ya realizada.

## ADR-003. Datos separados en PostgreSQL

PostgreSQL conserva las configuraciones y el historial. La infraestructura inicial comparte una base de datos para reducir coste y mantenimiento, pero cada servicio tiene sus propias tablas y permisos.

Los servicios intercambian información mediante la API y los mensajes, sin modificar las tablas de otro. Así se mantienen claras sus responsabilidades. Compartir la base también implica que una caída puede afectar a toda la plataforma.

## ADR-004. Control de duplicados

Las solicitudes y los mensajes tienen identificadores que permiten reconocer lo que ya se ha procesado. La comparación con revisiones anteriores ayuda a distinguir los datos nuevos de los que no han cambiado.

Al enviar información a otra aplicación también se depende de sus capacidades. Si pudo guardar un dato pero no respondió, el envío solo se repite automáticamente cuando pueda hacerse sin duplicarlo. En otro caso, se conserva el resultado incierto para revisión.

El historial permite seguir estas situaciones y conocer qué parte de una operación llegó a completarse.

## ADR-005. Acceso a la información personal

Cada cuenta dispone de sus propias conexiones, reglas e historial. La identificación del usuario determina qué recursos puede consultar y utilizar.

Los permisos se comprueban en cada servicio, además de en la entrada API. Las credenciales de las aplicaciones conectadas se guardan protegidas y no aparecen en las respuestas, los eventos ni los registros técnicos.
