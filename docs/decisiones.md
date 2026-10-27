# Decisiones de diseño

El diseño de Synkron busca que las sincronizaciones, las reglas y el seguimiento de actividad puedan funcionar por separado. Estas decisiones organizan ese trabajo y explican cómo se guardan los datos y se controlan los fallos.

## ADR-001. Separación de responsabilidades

Sync se ocupa de conectar servicios y sincronizar información. Automation comprueba las reglas y solicita acciones. Monitoring reúne los cambios, resultados y avisos.

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

Al enviar información a otra aplicación también se depende de sus capacidades. Si pudo guardar un dato pero no respondió, el envío solo se repite automáticamente cuando pueda hacerse sin duplicarlo. En otro caso, se conserva el resultado incierto para revisión.

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

Synkron dispone de su propio panel y API para gestionar conexiones, sincronizaciones, reglas y actividad. Las aplicaciones conectadas intercambian información con Synkron mediante sus API, sin compartir sus bases de datos ni formar parte de su despliegue.
