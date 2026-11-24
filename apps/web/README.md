# Frontend de Synkron

Aplicación React y TypeScript creada con Vite. Incluye registro, inicio y cierre de sesión,
restauración al recargar, agenda básica y calendario con vistas Mes, Semana y Día.
El calendario ocupa el 90 % del ancho en escritorio, consulta todas las páginas
del periodo visible y muestra eventos compactos con título, sigla de asignatura,
tipo, parte y estado. El color principal distingue entregas (azul), exámenes (violeta), gimnasio
(naranja) y Otros (rosa), y se conserva al completar una actividad. Un indicador
con símbolo y color muestra el estado: pendiente, programado, en curso, hecho o
cancelado. Las canceladas quedan grises y tachadas; las entregas obligatorias
tienen un fondo más intenso. La leyenda explica ambas dimensiones. El día actual se resalta en azul. Al pulsar un evento o
un título de la agenda se consulta su detalle y se abre un modal con los datos
académicos, que puede cerrarse con el botón o Escape.
En Mes, cada actividad ocupa una fila dentro de su día, con título, sigla y hora
cuando hay espacio. Los textos largos usan puntos suspensivos;
la información completa sigue en el detalle. Las columnas no se ensanchan por su
contenido y la altura de cada semana crece con el día que contiene más filas.
Fechas y horas usan Europe/Madrid; las actividades sin hora conservan su fecha.
Las vistas semanal y diaria separan las actividades sin hora de las que tienen hora.
Anterior, Hoy y Siguiente actúan sobre la vista elegida; el cambio entre vistas
conserva la fecha de referencia. Pulsar el número de un día abre su vista diaria,
que consulta únicamente esa jornada.

La agenda permite filtrar por tipo (Académico, Deporte o Planes) y por estado
de entrega (entregadas o no entregadas). Al elegir Académico aparece el selector
de asignatura, con opciones obtenidas de todas las actividades activas.
La agenda obtiene todas las páginas antes de aplicar los filtros, para que no
se limiten a los primeros resultados. El calendario no tiene estos filtros.
El estado de entrega se aplica a las entregas académicas;
al elegir Deporte o Planes se restablece. Limpiar filtros recupera la vista completa.

Desde la raíz del repositorio, instala y arranca el entorno de desarrollo:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Vite permite revisar la presentación; muestra la dirección local, normalmente `http://127.0.0.1:5173`.

Para comprobar el código y compilar:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run build
npm --prefix apps/web test
```

La compilación genera los archivos estáticos en `dist`. La imagen Docker utiliza
Node para compilarlos y Nginx para servirlos como usuario sin privilegios.

Con la configuración local del proyecto preparada, arranca el contenedor:

```bash
docker compose up -d --build --wait web
```

La pantalla está disponible en `http://127.0.0.1:3102` y el estado del servidor en
`http://127.0.0.1:3102/healthz`. CI comprueba ESLint, compilación, Dockerfile y
construcción de la imagen.

La [entrada HTTPS común](../../infra/gateway/README.md) ya permite abrir la misma
pantalla en `https://localhost:8443` y encamina las peticiones de autenticación y
Sync. Para probar el acceso, utiliza esa entrada e importa su certificado local
en el navegador. El servidor de desarrollo de Vite todavía no tiene proxy API.

Para levantar el flujo completo y actualizar el frontend y la consulta de definiciones:

    docker compose up -d --wait api academic rabbitmq sync-publisher sync-event-publisher sync-worker
    docker compose up -d --build --wait sync web
    docker compose up -d --wait gateway

El navegador gestiona la cookie HttpOnly; React conserva la información pública
de sesión en memoria y la recupera con GET /api/v1/auth/session al recargar.
Cada acceso o cierre obtiene previamente un token CSRF nuevo. Los errores de
credenciales y los fallos de conexión se muestran en la interfaz.

Las pruebas del cliente usan el runner integrado de Node 24 y simulan fetch.
Comprueban sesión ausente frente a dependencia caída, renovación de CSRF entre
acceso y cierre, respuesta vacía de logout y errores de acceso. También se han
verificado en Firefox por HTTPS el error de contraseña, el acceso correcto, la
persistencia al recargar, el cierre y la ausencia de sesión tras otra recarga.
También comprueban fechas del calendario, paginación del periodo y caducidad de
sesión durante la carga, así como notas cero y datos opcionales en el detalle.
La presentación de actividades, el resaltado de hoy y el modal deben comprobarse
en el navegador tras reconstruir web.
El registro pide confirmar la contraseña, comprueba su longitud y presenta el
conflicto de correo duplicado. Crear una cuenta no inicia sesión: vuelve al acceso
con el correo ya rellenado. Una cuenta nueva no tiene actividades ni definiciones;
su configuración desde la web sigue pendiente.

Con una cuenta que ya tenga definiciones, «Sincronizar ahora» permite elegir una
habilitada, solicita la ejecución con CSRF y una clave de idempotencia, y consulta
su estado. Un reintento de solicitud usa la misma clave; un fallo de consulta
permite volver a consultar la ejecución existente. Al terminar, se recarga la agenda
o el calendario conservando fecha, vista y filtros de la agenda. La ejecución
continúa en el servidor si se cierra la página; su seguimiento visible actual se
mantiene en memoria mientras está abierta.

Se han revisado los estados de carga, vacío, errores con reintento y sesión
caducada, así como los estilos para pantallas pequeñas. La revisión visual final
corresponde al navegador: comprobar a unos 320 px, entrar y salir, abrir el modal,
crear una cuenta de prueba y solicitar una sincronización con la cuenta de demo.


## Exportar la agenda y el calendario

En Mi agenda, debajo del panel de sincronización, abre **Exportar agenda y
calendario**. Elige el formato, el periodo y los bloques Académico, Deporte y
Otros; todos están marcados al empezar. Desmarcar un bloque lo excluye tanto de
la lista como de la imagen y su leyenda. Si desmarcas todos, no se permite generar.

- **Lista para imprimir / PDF:** permite elegir un mes, una semana (seleccionando
  cualquiera de sus días; siempre de lunes a domingo) o un día. Puede incluir
  los detalles de cada actividad. Genera una vista previa por días, con títulos,
  fechas, tipos, estados y colores. Abrir lista / Guardar PDF abre un documento
  independiente; su botón de imprimir permite elegir Guardar como PDF en el
  navegador. También puede descargarse como HTML para abrirlo sin conexión.
- **Imagen · PNG / SVG** (opción inicial): permite elegir mes, semana o día.
  El mes usa un calendario de 2240 píxeles de ancho; la semana, un diseño de
  1600 píxeles con tarjetas por jornada de lunes a domingo; el día, una agenda
  de 1200 píxeles con horarios y detalles de cada actividad. Las imágenes llevan
  cabecera, resumen, colores por tipo y estados. No son capturas de la aplicación.
  Los títulos y las tarjetas crecen para mostrar todo el contenido. Pulsa
  **Crear imagen** y después **Descargar PNG**, o descarga SVG para ampliar sin
  perder nitidez. Si supera 32 millones de píxeles o el límite de dimensiones del
  PNG, se ofrece usar SVG sin eliminar actividades.

Se incluyen los datos ya sincronizados de los bloques seleccionados, incluso
realizados y cancelados; los filtros visuales de la agenda no se aplican. Se leen
todas las páginas de la API del periodo antes de habilitar las descargas. Las
actividades sin hora se colocan al final de cada día; los intervalos que abarcan
varios días aparecen en cada día correspondiente y el resumen cuenta identidades
únicas. Las horas se presentan en Europe/Madrid, incluidos los cambios de horario.

Cambiar la selección o actualizar la agenda requiere preparar de nuevo la vista
previa. La preparación se puede cancelar; una sesión caducada vuelve al acceso y
no entrega un archivo parcial. Las URLs temporales se liberan al preparar otra
exportación o desmontar el panel. Los documentos no incluyen credenciales ni IDs
internos y el contenido de las actividades se escapa antes de generar HTML o SVG.

Esta función se genera en el navegador sin dependencias nuevas ni migraciones.
Las pruebas locales cubren rangos, selección de bloques, paginación existente,
ordenación, intervalos, contenido escapado y los tres diseños con muchas actividades. La
impresión PDF y la descarga PNG deben comprobarse también en el navegador.
