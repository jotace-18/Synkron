# Entrada HTTPS local

Caddy recibe las peticiones en `https://localhost:8443`. Comparte la red de los
servicios y conserva las rutas al reenviarlas:

| Ruta | Destino |
| --- | --- |
| `/api/v1/auth` y sus subrutas | API de cuentas, puerto interno 3000. |
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
