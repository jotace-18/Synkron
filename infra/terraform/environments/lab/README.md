# Red del laboratorio de Synkron

Esta configuración define el grupo de recursos del laboratorio y un módulo de
red. Utiliza el almacenamiento preparado por el [bootstrap](../../bootstrap/README.md),
con la clave independiente `lab.tfstate`. El bootstrap conserva su propia clave
`bootstrap.tfstate`.

## Topología y acceso

| Recurso | Configuración |
| --- | --- |
| Región predeterminada | `denmarkeast`; comprobar las regiones permitidas de la suscripción. |
| Grupo | `rg-synkron-lab`. |
| Red virtual | `vnet-synkron-lab`, `10.42.0.0/16`. |
| Subred de entrada | `snet-public`, `10.42.1.0/24`, ruta general hacia `Internet`. |
| Subred privada | `snet-private`, `10.42.2.0/24`, ruta general de descarte `None`. |

Ambas subredes tienen desactivada la salida implícita de Azure, una tabla de rutas
y un grupo de seguridad asociados. La salida de la futura máquina requiere un
mecanismo explícito, como una IP pública asociada a su interfaz.

Las reglas de denegación de prioridad 4096 preceden a los permisos predeterminados
de Azure. La subred de entrada permite estas excepciones:

| Dirección | Tráfico permitido |
| --- | --- |
| Entrada | TCP 80 y 443 desde Internet; TCP 22 desde `admin_cidr`, una IPv4 `/32`. |
| Salida | TCP 80 y 443 hacia Internet; UDP 123 hacia Internet. |

El DNS de plataforma de Azure permanece disponible mediante su dirección
especial `168.63.129.16`: este tráfico está exento de las reglas NSG generales.
La etiqueta `AzurePlatformDNS` se utiliza para denegarlo explícitamente; no
admite reglas `Allow`.

La subred privada queda reservada para una separación futura de recursos. El
alojamiento inicial previsto mantiene aplicaciones y bases de datos en una misma
máquina, con redes Docker independientes. La política cloud no sustituye el
aislamiento entre contenedores. Azure conserva comunicaciones especiales de
plataforma, descritas en su [documentación de red](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16).

## Preparar la configuración local

Ejecuta los comandos desde la raíz de `Synkron`, con Terraform 1.17.x, Azure CLI
y acceso al contenedor de estado del bootstrap:

```bash
az login
az account show --query '{Suscripcion:name,Estado:state}' --output table
az provider register --namespace Microsoft.Network --wait
mkdir -p tmp/terraform
cp -n infra/terraform/environments/lab/terraform.tfvars.example \
  infra/terraform/environments/lab/terraform.tfvars
cp -n infra/terraform/environments/lab/backend.hcl.example \
  tmp/terraform/lab.backend.hcl
```

Edita `terraform.tfvars` con una región admitida y tu IPv4 pública seguida de
`/32`. La IP del ejemplo está reservada para documentación. Si cambia la IP de
tu conexión, actualiza este valor y revisa el plan antes de aplicar la regla SSH.
En `tmp/terraform/lab.backend.hcl`, introduce la cuenta del bootstrap y conserva
`key = "lab.tfstate"` para gestionar los recursos de este entorno.

```bash
terraform -chdir=infra/terraform/environments/lab init \
  -backend-config=../../../../tmp/terraform/lab.backend.hcl
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/lab validate
terraform -chdir=infra/terraform/environments/lab plan
```

Los archivos reales, la configuración interna de Terraform y los planes guardados
en `tmp/` quedan excluidos de Git. Se versionan los ejemplos y el lockfile de
proveedores.

## Estado de comprobación

El 28/11/2026 se comprobaron inicialización, formato, validación y despliegue en
Azure. La configuración gestiona 23 recursos: un grupo, una red, dos subredes,
dos tablas, dos rutas, cuatro asociaciones de subred, dos grupos de seguridad
y nueve reglas.

El plan posterior refrescó los 23 recursos y terminó con
`No changes. Your infrastructure matches the configuration.` Los identificadores
de red y subredes están definidos como salidas.

La conectividad efectiva, el acceso SSH, el comportamiento de las reglas y la
destrucción deben verificarse durante el despliegue de la aplicación. La
configuración actual no crea máquinas, discos ni direcciones IP públicas.
