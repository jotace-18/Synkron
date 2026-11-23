# Entrada HTTPS local

Caddy recibe las peticiones en `https://localhost:8443`. Comparte la red de los
servicios y encamina sus API públicas:

| Ruta | Destino |
| --- | --- |
| `/api/v1/auth` y sus subrutas | API de cuentas, puerto interno 3000. |
| `/api/v1/automation` y sus subrutas | Automation, puerto interno 3000. |
| `/api/v1/monitoring`, `/api/v1/notifications` y sus subrutas | Monitoring, puerto interno 3000. |
| `/api/docs/{accounts,automation,monitoring,academic,sport}/openapi.json` | Documento del servicio indicado; se reescribe a `/api/docs/openapi.json`. |
| `/academic/api/v1/assignments`, `/academic/api/v1/exams` y sus subrutas | Academic; se elimina el prefijo `/academic`. |
| Resto de `/academic` y sus subrutas | Respuesta pública `404`. |
| `/sport/api/v1/gym-sessions` y sus subrutas | Sport; se elimina el prefijo `/sport`. |
| Resto de `/sport` y sus subrutas | Respuesta pública `404`. |
| Resto de `/api` y sus subrutas | Sync, puerto interno 3000. |
| `/internal` y sus subrutas | Respuesta pública `404`. |
| Resto | Frontend Nginx, puerto interno 8080. |

La comprobación interna de sesiones entre Sync y la API sigue utilizando el
puerto 3003 por la red de Docker. La autenticación y los permisos los comprueban
los backends. El gateway solo gestiona TLS y encaminamiento.

## Arranque y certificado

Configura `APP_ORIGIN=https://localhost:8443` en el `.env` local. Desde la raíz:

```bash
docker compose up -d --build --wait gateway
mkdir -p tmp
docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt tmp/synkron-local-ca.crt
curl --cacert tmp/synkron-local-ca.crt -i https://localhost:8443/healthz
```

Caddy usa su autoridad local mediante `tls internal`. Los volúmenes
`gateway-data` y `gateway-config` conservan su estado; el proceso se ejecuta
como usuario 1000. El healthcheck verifica HTTPS y la respuesta del frontend
utilizando ese certificado raíz.

En Firefox, abre `about:preferences#privacy`, entra en Certificados → Ver
certificados → Autoridades → Importar y selecciona `tmp/synkron-local-ca.crt`.
Activa la confianza para identificar sitios web y abre
`https://localhost:8443`. Esta importación configura Firefox; las pruebas de
terminal usan `--cacert`.

`skip_install_trust` evita instalar confianza automáticamente dentro del
contenedor. Solo se exporta el certificado público; los datos de la autoridad
permanecen en el volumen. `tmp/` está excluido de Git. Si se elimina la autoridad
local del volumen, será necesario importar el certificado nuevo.

## Verificación

Se han comprobado en local el frontend y `/healthz` por HTTPS, el endpoint
`/api/v1/auth/csrf` con `200`, `/api/v1/activities` sin sesión con `401`,
`/internal/auth/session` con `404` y una ruta API desconocida con `404`.
CI valida el Caddyfile con la misma imagen y el mismo usuario del servicio.

Los puertos HTTP locales de los backends y del frontend se mantienen para
comprobaciones directas. El navegador utilizará la entrada HTTPS común para las
funciones con sesión. La configuración de dominio y certificados públicos se
adaptará al entorno de despliegue; Terraform podrá preparar esa infraestructura.

## Portal de documentación

`/api/docs` sirve Swagger UI desde Sync. Las rutas exactas
`/api/docs/{accounts,automation,monitoring,academic,sport}/openapi.json` se encaminan al
documento público de cada backend. `/api/docs/openapi.json` conserva el documento
de Sync. La [guía del portal](../../docs/swagger.md) explica su arranque.

El gateway permite probar Academic bajo `/academic/api/v1/assignments` y
`/academic/api/v1/exams`, incluidas sus subrutas públicas, eliminando `/academic`
al reenviar. El resto de `/academic/*` devuelve 404. No se publica una ruta
genérica hacia sus endpoints internos. Después de modificar el Caddyfile con el
gateway ya arrancado, recarga su configuración:

```bash
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
```

La fuente deportiva publica su documento en `/api/docs/sport/openapi.json` y sus
operaciones de gimnasio bajo `/sport/api/v1/gym-sessions` y subrutas. Caddy elimina
`/sport` al reenviar; las demás rutas de ese prefijo devuelven 404. Sport utiliza
su propio Bearer y se levanta explícitamente para consultar su documento.
