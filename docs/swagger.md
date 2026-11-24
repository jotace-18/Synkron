# Documentación interactiva de las API

El portal es `https://localhost:8443/api/docs`. Usa Swagger UI oficial y su
selector superior para cambiar de servicio. Cada backend genera su propio
OpenAPI a partir de las rutas de Nest y los contratos explícitos de sus cuerpos,
consultas y respuestas. El gateway reúne los documentos sin mezclar sus API.

## Servicios y autenticación

| Selector | Operaciones | Autenticación para probar |
|---|---|---|
| Cuentas y sesiones | CSRF, registro, acceso, sesión y cierre | Cookies del navegador; CSRF automático en escrituras, también antes del acceso. |
| Sync | Conexiones y prueba, definiciones, ejecuciones, actividades, fuentes y recepción directa | Sesión para gestión y consulta; `IngestionToken` solo para enviar y consultar entradas. |
| Automation | Programaciones, reglas, ajustes de recordatorios e historial | Sesión y CSRF automático en escrituras. |
| Monitoring | Resumen, resultados, cambios y bandeja de avisos | Sesión; CSRF automático al marcar un aviso como leído. |
| Otros · fuente externa | Compromisos personales: CRUD y exportación canónica | `PersonalBearer`, credencial propia e independiente de las demás fuentes. |
| Deporte · fuente externa | Sesiones de gimnasio: creación, consulta, exportación, edición parcial y retirada | `SportBearer`, credencial propia de la fuente deportiva. |
| Academic · fuente externa | Entregas y exámenes: creación, consulta, exportación, edición parcial y retirada | `AcademicBearer`, distinto de la sesión de Synkron y de `IngestionToken`. |

Las rutas de usuario existentes suman 65 operaciones HTTP. No se incluyen rutas
internas de autenticación entre servicios, ejecución de acciones ni creación
interna de avisos. Tampoco se presenta la ruta raíz de salud como una operación
de negocio ni se añaden operaciones CRUD que no existan en los controladores.

En **Authorize**, introduce únicamente el token que corresponda, sin anteponer
`Bearer`. Para operaciones con sesión, inicia sesión en Synkron desde el mismo
navegador o utiliza el login del grupo Cuentas. No copies cookies HttpOnly ni
necesitas introducir manualmente un CSRF. Las credenciales no se persisten al
recargar. **Logout** en Authorize elimina el Bearer de Swagger; cerrar la sesión
de Synkron requiere su operación de logout.

El selector y los endpoints requieren que estén disponibles sus servicios.
Si uno está apagado, su documento o sus peticiones pueden responder `502`; eso
no convierte la API de otro servicio en un sustituto.

## Descargar OpenAPI

| Servicio | Ruta en el gateway |
|---|---|
| Sync | `/api/docs/openapi.json` |
| Cuentas | `/api/docs/accounts/openapi.json` |
| Automation | `/api/docs/automation/openapi.json` |
| Monitoring | `/api/docs/monitoring/openapi.json` |
| Academic | `/api/docs/academic/openapi.json` |
| Deporte | `/api/docs/sport/openapi.json` |
| Otros | `/api/docs/personal/openapi.json` |

Cada backend sirve su JSON en `/api/docs/openapi.json`; el gateway encamina las
rutas de la tabla al servicio correspondiente. Swagger y sus recursos estáticos
se sirven desde Sync, sin CDN. La validación externa de esquemas y la carga de
configuración desde parámetros de URL están desactivadas.

Academic conserva sus rutas de origen `/api/v1/assignments` y `/api/v1/exams`.
Para probarlas desde el portal, su documento usa el servidor `/academic` y el
gateway elimina ese prefijo antes de enviarlas a Academic. Este acceso se limita
a las dos colecciones públicas y sus subrutas; `/academic/internal/...` sigue
bloqueado. Las llamadas de Academic y de recepción directa se realizan sin las
cookies de Synkron. El portal limita las pruebas al mismo origen y no sigue
redirecciones con credenciales.

## Arranque y comprobación

Desde la raíz del repositorio, con las migraciones de los servicios ya aplicadas:

```bash
docker compose up -d --build api sync automation monitoring academic sport personal
docker compose up -d gateway
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

Compose levanta las bases y demás dependencias declaradas. Los workers,
publicadores y consumidores se necesitan para ejecutar los recorridos
asíncronos, pero no para consultar los documentos.

1. Abre el portal y cambia entre los siete servicios. Cada uno debe mostrar sus
   propios grupos y un contrato descargable.
2. En Cuentas, consulta la sesión o inicia sesión con una cuenta de prueba.
3. En Sync, prueba una consulta de actividades o conexiones. Para una
   sincronización, envía exactamente `{}` y una clave de idempotencia estable.
4. En Automation, consulta ajustes o crea una programación/regla pausada usando
   IDs propios. El portal obtiene CSRF al ejecutar escrituras.
5. En Monitoring, consulta el resumen, los resultados y los avisos. Marcar un
   aviso como leído también utiliza el CSRF automático.
6. En Academic, introduce su credencial en `AcademicBearer` y prueba una consulta
   de entregas o exámenes. La URL de prueba debe empezar por `/academic/api/v1/`.
7. Para la recepción directa utiliza la
   [guía de entrada estandarizada](entrada-estandarizada.md#arranque-y-prueba-manual).

Los ejemplos contienen datos ficticios. Sustituye los identificadores y
credenciales de conexión antes de ejecutar escrituras. Los ejemplos de reglas
y programaciones se crean pausados para permitir revisar su configuración.

## Mantener el contrato

Los contratos están en `apps/<servicio>/src/docs/openapi.ts`; los esquemas
específicos de recepción directa permanecen en
`apps/sync/src/ingestions/ingestion-openapi.ts`. Los documentos descubren las
rutas desde Nest y aplican esos esquemas explícitos para las interfaces y uniones
que TypeScript no conserva en ejecución. No se publican automáticamente los
modelos recogidos de los controladores internos.

La prueba `src/docs/openapi.spec.ts` de cada servicio comprueba que todas sus
rutas públicas estén documentadas, que cada operación tenga respuesta y que sus
referencias de esquema se resuelvan. Genera el documento real con el escáner de
Swagger y dependencias simuladas, sin escuchar en un puerto ni acceder a bases
o servicios. Al añadir una operación, actualiza su contrato junto al controlador
y ejecuta esa prueba. Los límites y las reglas cruzadas de los DTO y servicios
siguen siendo la validación efectiva de las peticiones.

La compilación y las pruebas locales no sustituyen la comprobación de gateway,
TLS, selector y peticiones reales en el navegador. Ese recorrido se realiza en
el entorno de contenedores siguiendo los pasos anteriores.

El backend deportivo requiere su bloque `SPORT_*`, migraciones y cuenta propia.
Consulta la [guía de Sport](deporte.md#arranque-del-backend). El esquema `sport.gym` está habilitado tanto en la entrada directa como en el
lector canónico. La exportación `/sport/api/v1/activities/export` y la conexión
atómica `/api/v1/sync-sources` están documentadas en sus servicios respectivos.


El backend de Otros usa `/personal/api/v1/events` y exporta operaciones canónicas
en `/personal/api/v1/activities/export`. Consulta el
[arranque de la fuente personal](servicios-origen.md#arranque-de-la-fuente-personal).
El esquema `personal.event` está habilitado en Sync tras la migración 015, tanto
para recepción directa como para lectura con `standard.activities`. La conexión
desde la agenda ofrece un preset «Otros (Personal)» con su URL canónica; utiliza
la credencial personal y no el token deportivo.


## Cuentas de las fuentes

Los documentos de Academic, Sport y Personal incluyen `/api/v1/auth` para registro,
login, sesión, logout y gestión de credenciales personales de lectura. Cada fuente
tiene su cookie propia y exige CSRF y origen autorizado para las escrituras con
sesión. El Bearer de integración es distinto de la sesión del navegador y se exige
en las exportaciones; un token nuevo de Synkron no permite modificar datos.
Consulta [Cuentas de las fuentes](cuentas-fuentes.md).
