# Campus · Agenda académica

> La interfaz usa ahora registro y sesión propios. La inyección del token demo
> descrita en los pasos históricos se ha retirado. Consulta
> [Cuentas de las fuentes](../../docs/cuentas-fuentes.md).

Frontend externo de Academic, separado de la agenda centralizada de Synkron.
Utiliza React y TypeScript con una interfaz azul e índigo. Actualmente permite
listar, crear, editar y retirar entregas y exámenes, con secciones independientes. Dispone de contenedor e integración
en CI. La sección Asignaturas permite elegir una materia en un desplegable y consultar
su vista dedicada: resumen general, progreso de entregas, pendientes ordenadas
por vencimiento, exámenes programados, notas e historial plegable. La media
de notas es aritmética, no una calificación final ponderada. Muestra el catálogo aunque todavía no tenga actividad,
incorpora asignaturas antiguas fuera del catálogo y resume las entregas pendientes
y los exámenes programados. En las entregas pendientes, «Marcar como entregada»
abre un modal de confirmación y actualiza únicamente el estado. Tras confirmar,
la entrega pasa al historial y se actualizan los contadores y el progreso.
Si no se puede confirmar la operación, se ofrece comprobar los datos antes de
reintentar. «Nueva entrega» abre el formulario con la asignatura actual
preseleccionada, incluidas materias fuera del catálogo, y recarga el resumen al
guardar. Se puede cambiar la asignatura antes de crear la entrega. Al entrar
consulta de nuevo los datos de Academic. Las tablas de pendientes, próximos
exámenes e historial incluyen «Editar» y «Eliminar»: reutilizan los formularios
con los datos actuales y los diálogos de confirmación de retirada lógica.
Después de guardar o eliminar, se recargan los datos, las notas y el resumen de
la asignatura. Mientras se realiza una acción se bloquean las demás acciones
y el selector de asignatura.

## Arranque con Docker

Desde la raíz del repositorio, con ACADEMIC_DEMO_TOKEN configurado en .env:

```bash
docker compose up -d --build --wait academic-web
```

Abrir http://127.0.0.1:3103. Compose también arranca Academic y su base de datos.
Nginx sirve la interfaz y reenvía las peticiones de entregas y exámenes a Academic.
La credencial se incorpora en el servidor al arrancar; no se incluye en la
imagen ni en el código del navegador.

El endpoint /healthz comprueba que el servidor web responde.

## Desarrollo local

Desde la raíz del repositorio:

```bash
docker compose up -d --wait academic
npm --prefix apps/academic-web install
npm --prefix apps/academic-web run dev
```

Abrir http://127.0.0.1:5174. El servidor local reenvía únicamente las rutas de
entregas a Academic en 127.0.0.1:3101, utilizando ACADEMIC_DEMO_TOKEN del .env de
la raíz. Ese valor permanece en el servidor: no se utiliza un prefijo VITE_ ni
se incorpora al código del navegador. Las escrituras comprueban el origen.
Es una interfaz local para la cuenta académica de demostración.

El listado obtiene todas las páginas. Nueva entrega permite elegir directamente
la sigla de asignatura (DSS, DES, TID, CC, IC, PGPI o EOI), parte, obligatoriedad,
estado y vencimiento. El catálogo fijo de siglas y nombres completos se conserva
en src/assignments/courses.ts; no depende de las entregas existentes ni del
almacenamiento del navegador. Al guardar, sigla y nombre completo se envían juntos
y se persisten en Academic. Más detalles agrupa
modalidad individual/grupo, integrantes, nota y ponderación opcionales. Una nota
cero se conserva y una ponderación vacía no envía una referencia suelta.

Sin hora, el vencimiento conserva su fecha. Con hora, se interpreta en Madrid,
independientemente del huso del dispositivo. Una hora inexistente por cambio
estacional se rechaza; si se repite en otoño se utiliza la primera ocurrencia.
Tras confirmar el alta, se cierra el formulario y se recarga el listado. Si se
pierde la respuesta, se ofrece comprobar la lista antes de volver a crearla.

Editar abre el mismo formulario con todos los datos precargados. Solo se envían
los campos modificados por PATCH; guardar sin cambios no escribe en la API.
Una nota vacía elimina la nota, mientras que cero se conserva. Las asignaturas
antiguas fuera del catálogo pueden conservarse y los vencimientos sin cambios
mantienen su instante original, incluidos segundos y cambios de horario.

Retirar abre un diálogo que permite cancelar o confirmar. La confirmación envía
DELETE y retira lógicamente la entrega; después se recarga la tabla. El cambio
llegará a Synkron en la siguiente sincronización. Si la entrega ya no está
disponible o no se puede confirmar la operación, se ofrece comprobar el listado.

Comprobaciones locales:

```bash
npm --prefix apps/academic-web run lint
npm --prefix apps/academic-web run build
npm --prefix apps/academic-web test
```

El build no carga el token del .env de la raíz. En desarrollo, Vite configura
el proxy; en Docker, Nginx realiza esa función con la credencial de ejecución.
Las pruebas cubren datos opcionales/cero, fechas de Madrid y respuesta perdida.
También cubren edición parcial sin pérdida de datos, cambio de tipo de fecha y
los contratos PATCH/DELETE. Alta, edición y retirada reales se comprueban
manualmente en el navegador.
