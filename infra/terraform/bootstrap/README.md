# Almacenamiento remoto del estado de Terraform

Este bootstrap prepara en Azure el almacenamiento del estado de Terraform:
un grupo de recursos dedicado, una cuenta StorageV2 Standard LRS, un contenedor
privado `tfstate` y un permiso de acceso para la identidad que ejecuta Terraform.
El laboratorio de Synkron utilizará una configuración y un archivo de estado
separados, para poder eliminar sus recursos conservando este almacenamiento.

La cuenta exige HTTPS y TLS 1.2, deshabilita acceso anónimo y autenticación con
claves compartidas, habilita el versionado y retiene los borrados de blobs y
contenedores durante siete días. El acceso a los datos utiliza Microsoft Entra ID. Azure
cifra el almacenamiento en reposo. El endpoint de red es público; el contenedor
requiere autenticación y el rol está limitado a ese contenedor.

El propio bootstrap guarda su estado en `bootstrap.tfstate` dentro de ese
contenedor. Para crear el almacenamiento por primera vez se empieza con estado
local y después se migra. Si el almacenamiento ya existe, sigue el apartado de
reutilización y conserva sus nombres y configuración.

## Requisitos y configuración

Los comandos se ejecutan desde la raíz de `Synkron`. Se necesitan Terraform
1.17.x, Azure CLI y una suscripción activa. La versión del proveedor se fija
mediante `versions.tf` y `.terraform.lock.hcl`.

Inicia sesión y comprueba que has seleccionado la suscripción correcta. Para la
creación inicial se requieren permisos para crear recursos y asignar el rol de
datos; en la comprobación realizada se utilizó el rol Propietario.

```bash
az login
az account show --query '{Suscripcion:name,Estado:state}' --output table
az provider register --namespace Microsoft.Storage --wait
az policy assignment list \
  --query "[].{Nombre:displayName,Parametros:parameters}" --output json
```

Elige una región admitida por la política de tu suscripción. `denmarkeast` es el
valor predeterminado comprobado para este entorno. Que una región muestre tamaños
de máquina o cuota de CPU no implica que permita desplegar recursos: las políticas
de ubicación se comprueban por separado.

Copia los ejemplos si todavía no tienes configuración local:

```bash
mkdir -p tmp/terraform
cp -n infra/terraform/bootstrap/terraform.tfvars.example \
  infra/terraform/bootstrap/terraform.tfvars
cp -n infra/terraform/bootstrap/backend.hcl.example \
  tmp/terraform/bootstrap.backend.hcl
```

Edita ambos archivos y sustituye `stsynkrontfexample` por el mismo nombre de
cuenta: entre 3 y 24 letras minúsculas y números, globalmente único. En
`terraform.tfvars` puedes ajustar región y nombre del grupo. Comprueba el nombre
antes de crear la cuenta, sustituyendo `NOMBRE_ELEGIDO` en el comando:

```bash
az storage account check-name --name NOMBRE_ELEGIDO --output json
git check-ignore infra/terraform/bootstrap/terraform.tfvars \
  tmp/terraform/bootstrap.backend.hcl
```

Los ejemplos y el lockfile de dependencias se versionan. La configuración real,
`.terraform/`, los estados, sus copias y los planes guardados en `tmp/` quedan
excluidos de Git. El estado y los planes pueden contener datos sensibles aunque
la terminal oculte algunos valores.

## Crear el almacenamiento por primera vez

Este recorrido corresponde a una instalación nueva, sin almacenamiento ni estado
previos. Desactiva temporalmente la declaración del backend remoto, porque su
cuenta y su contenedor todavía no existen:

```bash
mv infra/terraform/bootstrap/backend.tf \
  infra/terraform/bootstrap/backend.tf.disabled
terraform -chdir=infra/terraform/bootstrap init
terraform -chdir=infra/terraform/bootstrap fmt -check
terraform -chdir=infra/terraform/bootstrap validate
terraform -chdir=infra/terraform/bootstrap plan \
  -out=../../../tmp/terraform/bootstrap.tfplan
```

Revisa el plan: en una instalación nueva debe proponer cuatro altas, sin cambios
ni destrucciones. El comando siguiente aplica el plan guardado directamente:

```bash
terraform -chdir=infra/terraform/bootstrap apply \
  ../../../tmp/terraform/bootstrap.tfplan
```

Comprueba el acceso al contenedor con tu sesión, sustituyendo el nombre:

```bash
az storage blob list --account-name NOMBRE_ELEGIDO \
  --container-name tfstate --auth-mode login \
  --query 'length(@)' --output tsv
```

Antes de migrar el estado, el contenedor recién creado devuelve `0`. Si el acceso
devuelve un error de permisos, comprueba la asignación y su propagación antes de
continuar. Conserva el estado local mientras se resuelve el acceso.

## Migrar el estado al backend remoto

Conserva una copia local con permisos restringidos y restaura la declaración del
backend. `backend.tf.disabled` debe proceder del paso de creación anterior:

```bash
(
  umask 077
  cp -n infra/terraform/bootstrap/terraform.tfstate \
    tmp/terraform/bootstrap-antes-migracion.tfstate
)
mv infra/terraform/bootstrap/backend.tf.disabled \
  infra/terraform/bootstrap/backend.tf
terraform -chdir=infra/terraform/bootstrap init -migrate-state \
  -backend-config=../../../tmp/terraform/bootstrap.backend.hcl
```

Responde `yes` cuando Terraform pregunte si debe copiar el estado local al nuevo
backend. La clave del ejemplo es `bootstrap.tfstate`; las futuras configuraciones
del laboratorio deben utilizar otra clave para conservar estados independientes.

```bash
terraform -chdir=infra/terraform/bootstrap state list
terraform -chdir=infra/terraform/bootstrap plan
```

El listado debe conservar los cuatro recursos y la consulta de identidad. El plan
debe terminar con `No changes. Your infrastructure matches the configuration.`

## Reutilizar el backend desde otra copia

Conserva `backend.tf` y prepara los archivos locales con los nombres del entorno
existente. Utiliza la misma identidad de gestión del bootstrap; la asignación de
rol del código corresponde al usuario conectado. Para otra identidad, un
administrador debe conceder acceso al contenedor antes de inicializar el backend.

```bash
terraform -chdir=infra/terraform/bootstrap init \
  -backend-config=../../../tmp/terraform/bootstrap.backend.hcl
terraform -chdir=infra/terraform/bootstrap state list
terraform -chdir=infra/terraform/bootstrap plan
```

Este recorrido carga el estado remoto existente. Si el listado está vacío o el
plan propone recrear recursos, comprueba cuenta, contenedor y clave del backend
antes de aplicar cambios.

## Verificar el bloqueo del estado

Con todas las operaciones de Terraform cerradas, reserva el blob durante
60 segundos mediante Azure CLI y ejecuta inmediatamente un plan. Sustituye
`NOMBRE_ELEGIDO` por la cuenta del backend:

```bash
az storage blob lease acquire \
  --account-name NOMBRE_ELEGIDO \
  --container-name tfstate --blob-name bootstrap.tfstate \
  --auth-mode login --lease-duration 60 --output none &&
terraform -chdir=infra/terraform/bootstrap plan \
  -lock-timeout=5s -no-color \
  2>&1 | tee tmp/terraform/prueba-bloqueo-lease.txt
```

El resultado esperado es `Error acquiring the state lock` y
`state blob is already locked`. La reserva la crea Azure CLI, por lo que el aviso
`terraformlockid was empty` corresponde a la ausencia de metadatos de bloqueo
de Terraform. El contenido del archivo de estado se conserva.

Cuando hayan transcurrido 60 segundos desde la reserva, ejecuta:

```bash
terraform -chdir=infra/terraform/bootstrap plan -no-color \
  2>&1 | tee tmp/terraform/prueba-desbloqueo.txt
```

El plan debe adquirir el bloqueo y terminar sin cambios. La reserva caduca sola;
esta comprobación no necesita `force-unlock` ni desactivar el bloqueo. Los comandos
con `tee` conservan la salida para revisión manual; el código de salida de la
tubería por sí solo no certifica el resultado de Terraform.

## Comprobaciones realizadas

El 28/11/2026 se comprobaron los siguientes resultados en Azure:

| Comprobación | Resultado |
| --- | --- |
| Creación del bootstrap en `denmarkeast` | Cuatro recursos creados. Se reemplazó el grupo vacío del intento previo en una región restringida. |
| Acceso al contenedor mediante Entra ID | Listado correcto; contenedor inicialmente vacío. |
| Migración del estado | Backend `azurerm` configurado y estado copiado. |
| Consulta tras migrar | Cuatro recursos y consulta de identidad conservados. |
| Comparación con Azure | Plan sin cambios. |
| Reserva activa creada mediante Azure CLI | Terraform rechazó adquirir el bloqueo. |
| Reserva caducada | Nuevo plan sin cambios. |

La secuencia completa desde una copia nueva y la retirada final del bootstrap
quedan pendientes de reproducción. La prueba de reserva verifica que Terraform
respeta un bloqueo nativo existente y vuelve a operar tras su caducidad.

## Conservación y retirada del almacenamiento

Este bootstrap mantiene almacenamiento de blobs, versiones y operaciones mientras
exista; no crea máquinas virtuales. Su coste depende del uso de Azure Storage.
Los precios de discos gestionados de las máquinas no se aplican a esta cuenta.

El almacenamiento se conserva entre sesiones. La destrucción del laboratorio
debe ejecutarse desde su propia configuración y mantener disponible este backend.

Para retirar también el bootstrap al cerrar el proyecto, elimina primero los
recursos que dependan de él y conserva las copias necesarias de sus estados.
Después migra el estado del bootstrap a un backend local con
`terraform init -migrate-state`, retirando temporalmente `backend.tf` como en la
creación inicial. Comprueba el listado local, revisa un plan de destrucción y
destruye el bootstrap desde ese backend local. De esta forma el estado permanece
disponible mientras se elimina la cuenta que lo alojaba. La retirada debe revisar
también cualquier blob de otros entornos conservado en el contenedor.

## Referencias

- [Backend AzureRM de Terraform](https://developer.hashicorp.com/terraform/language/backend/azurerm).
- [Bloqueo del estado](https://developer.hashicorp.com/terraform/language/state/locking).
- [Reservas de blobs mediante Azure CLI](https://learn.microsoft.com/en-us/cli/azure/storage/blob/lease?view=azure-cli-latest).
- [Cifrado de Azure Storage](https://learn.microsoft.com/en-us/azure/storage/common/storage-service-encryption).
