# Infraestructura del laboratorio de Synkron

Esta configuración define el grupo de recursos del laboratorio y módulos de
red, cómputo y almacenamiento. Utiliza el almacenamiento preparado por el [bootstrap](../../bootstrap/README.md),
con la clave independiente `lab.tfstate`. El bootstrap conserva su propia clave
`bootstrap.tfstate`.

El laboratorio se despliega en Austria East. El almacenamiento del estado del
bootstrap permanece en Denmark East; ambos pueden estar en regiones distintas.

## Topología y acceso

| Recurso | Configuración |
| --- | --- |
| Región predeterminada | `austriaeast`; comprobar las regiones permitidas de la suscripción. |
| Grupo | `rg-synkron-lab`. |
| Red virtual | `vnet-synkron-lab`, `10.42.0.0/16`. |
| Subred de entrada | `snet-public`, `10.42.1.0/24`, ruta general hacia `Internet`. |
| Subred privada | `snet-private`, `10.42.2.0/24`, ruta general de descarte `None`. |

Ambas subredes tienen desactivada la salida implícita de Azure, una tabla de rutas
y un grupo de seguridad asociados. La salida de la máquina utiliza un mecanismo explícito: la IP pública
asociada a su interfaz.

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

## Cómputo y persistencia

El módulo `compute` define una máquina `Standard_B2ls_v2` (2 vCPU y 4 GiB),
Ubuntu Server 24.04 LTS x64 Gen2, interfaz de red e IP pública Standard estática.
Utiliza la subred de entrada y autenticación SSH sin contraseña. La clave pública
se lee de `~/.ssh/synkron-lab.pub`; la privada permanece en el equipo administrador.

La máquina y el disco de datos se configuran en la zona `2` de Austria East:
la consulta de SKU de la suscripción mostró restricciones para las zonas `1`
y `3`. Las cuotas consultadas fueron 6 vCPU regionales y 10 de la familia Bsv2,
sin uso previo. Estas consultas no garantizan capacidad en el momento de crear.

El disco del sistema es Standard SSD LRS de 32 GiB. El módulo `storage` define
otro disco Standard SSD LRS de 32 GiB y su conexión en LUN 0. Es independiente
del recurso de máquina, pero un `terraform destroy` del entorno también lo
elimina: separar los recursos no constituye una copia de seguridad.

La plantilla `cloud-init.yaml.tftpl` instala herramientas básicas y ejecuta
`scripts/bootstrap.sh` como root en la VM. El script espera hasta 15 minutos al
disco SCSI de LUN 0, rechaza particiones y firmas distintas de ext4, y solo crea
ext4 si no detecta firmas. Conserva un ext4 existente, registra su UUID en
`/etc/fstab` y comprueba el montaje en `/srv/synkron`.

Docker y Compose se instalan desde los paquetes de Ubuntu. Docker utiliza
`/srv/synkron/docker`, con el almacén clásico de imágenes y rotación de logs
JSON de hasta tres archivos de 10 MB por contenedor, salvo configuración
específica. Su unidad systemd exige el montaje del disco. El script está
destinado exclusivamente a la VM; no debe ejecutarse en el equipo administrador.
No contiene credenciales de la aplicación.

## Preparar la configuración local

Ejecuta los comandos desde la raíz de `Synkron`, con Terraform 1.17.x, Azure CLI
y acceso al contenedor de estado del bootstrap:

```bash
az login
az account show --query '{Suscripcion:name,Estado:state}' --output table
az provider register --namespace Microsoft.Network --wait
az provider register --namespace Microsoft.Compute --wait
mkdir -p tmp/terraform
cp -n infra/terraform/environments/lab/terraform.tfvars.example \
  infra/terraform/environments/lab/terraform.tfvars
cp -n infra/terraform/environments/lab/backend.hcl.example \
  tmp/terraform/lab.backend.hcl
```

Antes de planificar, prepara la clave SSH del administrador en
`~/.ssh/synkron-lab` y `~/.ssh/synkron-lab.pub`, por ejemplo mediante
`ssh-keygen -t rsa -b 4096 -f ~/.ssh/synkron-lab -C synkron-lab` si todavía no
existe. No sobrescribas una clave existente.

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

El 28/11/2026 se desplegaron y destruyeron los 28 recursos del laboratorio en
Austria East. Los 23 de red se ampliaron con IP pública, interfaz, máquina,
disco de datos y conexión del disco. El disco del sistema está incluido en el
recurso de máquina y no cuenta como recurso Terraform separado.

Se verificaron SSH, `cloud-init status --wait` con resultado `done`, ext4 en
`/srv/synkron`, Docker activo utilizando el disco de datos y Compose
`2.40.3+ds1-0ubuntu1~24.04.1`. Un archivo en un volumen Docker sobrevivió a un
reinicio de la máquina. No se ha probado su conservación al sustituir la VM ni
se ha desplegado la aplicación completa en Azure.

El experimento de drift cambió desde el portal el puerto de `allow-http` de 80
a 8080. Terraform detectó un cambio, restauró 80 y después mostró `No changes`.
El teardown terminó con 28 recursos destruidos, estado del lab vacío y
`az group exists --name rg-synkron-lab` igual a `false`.

Las capturas, trazas, comandos de reproducción y límites de las comprobaciones
están en el [informe del hito 3](../../../../docs/hito3.md).
El bootstrap del estado permanece en Denmark East y puede generar consumo de
almacenamiento y operaciones; el teardown del lab no implica coste total cero.
