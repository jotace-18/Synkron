# Guía de demostración desde una instalación nueva

Esta guía prepara Synkron en un ordenador sin las bases de datos del desarrollador.
No basta con clonar el repositorio e indicar su usuario: las cuentas, fuentes y
actividades se guardan en los volúmenes locales de Docker y no están en GitHub.

El recorrido es: configuración → bases de datos → migraciones → aplicaciones →
cuentas de las fuentes y Synkron → conexiones → sincronización.
Los comandos de terminal se ejecutan desde la raíz del repositorio. No se necesita usar la consola del navegador.

## 1. Requisitos y descarga

Se necesitan Git, Python 3, Docker Engine con Docker Compose v2 y un navegador.
Docker debe estar iniciado y el usuario debe poder ejecutar `docker compose`.
No hace falta instalar Node ni ejecutar `npm install` en el ordenador: las
compilaciones y migraciones se realizan dentro de Docker. Se necesita conexión
a Internet para descargar imágenes y dependencias durante la primera construcción.

```bash
git clone https://github.com/jotace-18/Synkron.git
cd Synkron
git switch main
docker compose version
python3 --version
```

Debe utilizarse una versión que incluya esta guía y `compose.migrations.yaml`.
Si ya existe una copia preparada, no repitas la generación de configuración:
consulta el apartado de reinicio. Los puertos 3001, 3002, 3101–3107, 5672,
15672 y 8443 deben estar disponibles según las publicaciones de `compose.yaml`.

## 2. Preparar la configuración local

El siguiente comando copia los valores de `.env.example`, genera una credencial
aleatoria diferente para cada marcador y crea `.env` con permisos de lectura y
escritura solo para su propietario. No sobrescribe un `.env` existente.

```bash
python3 - <<'PY'
from pathlib import Path
import os
import secrets

source = Path('.env.example').read_text()
lines = []
for line in source.splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        if value == 'replace-me-locally':
            line = f'{key}={secrets.token_hex(32)}'
    lines.append(line)
fd = os.open('.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write('\n'.join(lines) + '\n')
print('Configuración local creada; no se han mostrado las credenciales.')
PY

docker compose config --quiet
```

Conserva `.env` mientras existan los volúmenes: contiene las contraseñas de las
bases, las credenciales de las fuentes y la clave de cifrado de las conexiones.
No lo subas a GitHub. La entrada del navegador es `https://localhost:8443`;
`APP_ORIGIN` ya tiene ese valor. Los orígenes de lectura permitidos son Academic,
Sport y Personal en la red interna de Docker.

## 3. Arrancar bases de datos y RabbitMQ

```bash
docker compose up -d --wait api-db sync-db academic-db sport-db personal-db \
  monitoring-db automation-db rabbitmq
```

Espera a que termine correctamente. Los scripts de PostgreSQL crean los roles y
esquemas al inicializar los volúmenes; las tablas se crean en el paso siguiente.
Si aparece `ENOTFOUND ...-db`, comprueba que el contenedor de esa base esté
arrancado con `docker compose ps -a`.

## 4. Aplicar todas las migraciones

`compose.migrations.yaml` es un complemento para preparar las bases. Usa la etapa
`build` de los Dockerfiles, que incluye la herramienta de migraciones, y monta
las migraciones del repositorio. Sus imágenes tienen nombres propios para no
reemplazar las imágenes de ejecución. No debe usarse al arrancar la aplicación.

```bash
docker compose -f compose.yaml -f compose.migrations.yaml build \
  api sync academic sport personal monitoring automation

(
  set -e
  for service in api sync academic sport personal monitoring automation; do
    docker compose -f compose.yaml -f compose.migrations.yaml \
      run --rm --no-deps "$service"
  done
)
```

Cada servicio debe terminar sin errores. Se aplican las migraciones pendientes,
incluidas la entrada estandarizada y el bloque Otros. El bloque se detiene si
falla alguna; corrige el error antes de continuar. Repetirlo con la misma
configuración y versión no vuelve a aplicar las migraciones ya registradas.

## 5. Cuentas de las fuentes: preparación

Las fuentes tienen ahora registro e inicio de sesión propios. No hay que insertar
cuentas en SQL: después del arranque se crean desde las interfaces Campus, Sport
y Otros. Son cuentas distintas de Synkron y entre sí; pueden usar correos distintos.

Los valores `ACADEMIC_DEMO_TOKEN`, `SPORT_DEMO_TOKEN` y `PERSONAL_DEMO_TOKEN` se
conservan para compatibilidad con las antiguas cuentas de prueba y sus conexiones,
pero las interfaces ya no los inyectan. Crear una cuenta nueva no adopta los datos
de la cuenta demo. Para esta instalación nueva, no hace falta preparar esas cuentas.

## 6. Construir y arrancar las aplicaciones

La primera construcción puede tardar varios minutos, especialmente las descargas
de npm. Si termina con un error, no continúes hasta resolverlo.

```bash
docker compose build

docker compose run --rm --no-deps sync npm run rabbitmq:setup
docker compose run --rm --no-deps monitoring-setup

docker compose up -d --wait api sync academic sport personal monitoring automation \
  web academic-web sport-web personal-web

docker compose up -d sync-publisher sync-event-publisher sync-worker \
  monitoring-consumer automation-consumer automation-scheduler \
  automation-notifications automation-reminders

docker compose up -d --wait gateway
docker compose ps -a
```

Automation declara su cola al conectar su consumidor. Arranca los consumidores
antes de solicitar la primera sincronización. `monitoring-setup` y los servicios
de migración son procesos de preparación: no tienen que permanecer activos.
Si un servicio continuo termina o se reinicia repetidamente, revisa sus logs antes
de evaluar el recorrido. `Up` acredita que el proceso está ejecutándose; los
servicios sin healthcheck no tienen una comprobación funcional automática.

## 7. Configurar HTTPS y abrir las interfaces

Caddy genera una autoridad local propia para esta instalación:

```bash
mkdir -p tmp
docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt \
  tmp/synkron-local-ca.crt
```

En Firefox: `about:preferences#privacy` → Certificados → Ver certificados →
Autoridades → Importar. Selecciona `tmp/synkron-local-ca.crt` y habilita la
confianza para identificar sitios web. Usa el certificado de esta instalación,
no el de la máquina del desarrollador. [Detalle del gateway](../infra/gateway/README.md).

| Interfaz | Dirección |
|---|---|
| Synkron, acceso y calendario | <https://localhost:8443> |
| Campus: entregas y exámenes | <http://127.0.0.1:3103> |
| Sport: gimnasio | <http://127.0.0.1:3105> |
| Otros: compromisos personales | <http://127.0.0.1:3107> |
| Swagger: documentación de las API | <https://localhost:8443/api/docs> |

Abre cada interfaz de origen, crea tu cuenta e inicia sesión. La sesión es propia
de esa aplicación; cerrar sesión en una no cierra las de las demás. Cada cuenta
empieza vacía. La contraseña debe tener entre 8 y 128 caracteres.

## 8. Crear la cuenta de acceso a Synkron

En Synkron, selecciona registrarse y crea una cuenta local. Por ejemplo, para una
instalación de evaluación puedes usar `demo@example.com` y una contraseña elegida
por ti de al menos 8 caracteres. Después inicia sesión: registrarse no inicia
sesión automáticamente. No necesitas el usuario del desarrollador.

Si preparas personalmente el equipo de demostración, comunica a la profesora
el correo y la contraseña que hayas registrado en **ese entorno**. Una cuenta
recién creada tiene el calendario vacío hasta conectar y sincronizar sus fuentes.

## 9. Conectar los tres bloques a la cuenta nueva

Ya no hace falta ejecutar código en la consola ni usar un token demo:

1. En Campus, inicia sesión y pulsa **Acceso de Synkron**. Crea una credencial
   con un nombre reconocible, por ejemplo «Mi Synkron», y copia el valor que se
   muestra una sola vez.
2. En Synkron, con tu sesión iniciada, abre **Conectar una fuente externa**, elige
   **Académico (Campus: entregas y exámenes)** y pega la credencial. Se registran
   juntas las definiciones de entregas y exámenes de esa cuenta.
3. Repite el proceso en Sport, eligiendo Gimnasio (Sport) al conectar en Synkron.
4. Repite en Otros, eligiendo Otros (Personal).
5. El selector de sincronización mostrará los tres bloques. Pulsa Sincronizar todo
   cuando hayas creado las actividades del siguiente apartado.

Las credenciales solo permiten leer, se guardan cifradas en Synkron y se pueden
revocar en la fuente. Tras revocarlas, las siguientes lecturas fallan con 401;
no se borran las actividades ya sincronizadas. Para reemplazar una conexión activa
con otra credencial todavía hay que gestionar esa conexión existente: el formulario
rechaza el cambio con 409 y no sobrescribe el token en silencio. Una cuenta nueva
puede conectar directamente sus propias fuentes sin usar las del desarrollador.

Repetir una conexión con la misma credencial reutiliza la fuente activa. Si falla
la segunda definición de Académico, reintenta con la misma credencial: no duplica
la primera. No vuelvas a generar tokens para resolver un fallo de red.

## 10. Recorrido corto de evaluación

1. En Campus, crea una entrega y un examen para los próximos días. Puedes dejar
   el examen sin hora y la entrega con una hora conocida.
2. En Sport, crea una sesión de gimnasio con modalidad, duración y compañía.
3. En Otros, crea una cita con hora y duración o un recado con día sin hora.
4. En Synkron, pulsa Sincronizar todo. Espera a que terminen las ejecuciones y
   consulta el calendario en las fechas elegidas. Los eventos con hora se ordenan
   por inicio; los eventos sin hora aparecen al final de su día.
5. Abre los detalles y confirma los campos de cada tipo. Cambia un título en su
   fuente y sincroniza otra vez: se actualiza sin crear una actividad duplicada.
6. Repite sin cambios: el resultado debe contabilizar actividades sin cambios.
   Cancela un compromiso y comprueba su estado gris; retíralo en la fuente y
   comprueba que desaparece de la agenda tras sincronizar.
7. En Centro de mandos, actualiza y revisa los resultados, contadores y cambios.
   La recepción de eventos puede tardar unos segundos.
8. Opcionalmente, crea y activa una regla de aviso para un cambio de título,
   modifica ese título, sincroniza y actualiza Avisos. Pausa la regla al terminar.
   También puedes configurar una programación y pausarla después de probarla.

Las reglas y programaciones no se crean ni se activan por seguir esta guía.
Los recordatorios requieren habilitar su configuración; el flujo inicial queda
vacío para poder elegir los avisos y evitar acciones inesperadas.

## Reiniciar y conservar la demostración

Para detener conservando cuentas, configuración y actividades:

```bash
docker compose down
```

Para arrancar de nuevo con las mismas imágenes y los mismos volúmenes:

```bash
docker compose up -d --wait api-db sync-db academic-db sport-db personal-db \
  monitoring-db automation-db rabbitmq api sync academic sport personal \
  monitoring automation web academic-web sport-web personal-web

docker compose up -d sync-publisher sync-event-publisher sync-worker \
  monitoring-consumer automation-consumer automation-scheduler \
  automation-notifications automation-reminders

docker compose up -d --wait gateway
```

No añadas `-v` a `down` si quieres conservar los datos: elimina los volúmenes.
No regeneres `.env` ni las claves al reiniciar. Para actualizar a otra versión,
revisa y aplica primero las migraciones nuevas antes de arrancar sus procesos.
Si se cambia el token de una fuente, también deben actualizarse su cuenta y la
conexión de Sync; cambiar solo `.env` no cambia los datos persistidos.

## Alcance de esta guía y validación

La configuración auxiliar, las rutas, las variables y los bloques de preparación
se contrastan con el código del repositorio. Eso no acredita un arranque completo
real en un ordenador vacío. Antes de entregarla, reproduce los pasos en una copia
y un entorno de Docker independientes; no borres los volúmenes de tu demostración
actual para hacer esa comprobación. La publicación en GHCR y el despliegue público
no están incluidos: esta es una evaluación local con imágenes construidas desde
el repositorio.
