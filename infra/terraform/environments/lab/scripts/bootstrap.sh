#!/usr/bin/env bash
set -Eeuo pipefail

trap 'echo "Error en bootstrap, línea $LINENO" >&2' ERR

if [[ "$EUID" -ne 0 ]]; then
  echo "Este script debe ejecutarse como root dentro de la VM." >&2
  exit 1
fi

disk_link="/dev/disk/azure/scsi1/lun0"
mount_dir="/srv/synkron"

echo "Esperando al disco de datos conectado en LUN 0..."

deadline=$((SECONDS + 900))

until [[ -b "$disk_link" ]]; do
  if (( SECONDS >= deadline )); then
    echo "El disco de datos no apareció en 15 minutos." >&2
    exit 1
  fi
  sleep 5
done

disk_device="$(readlink -f "$disk_link")"

echo "Disco de datos detectado: $disk_device"
lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS "$disk_device"

device_count="$(lsblk -nr -o NAME "$disk_device" | wc -l)"

if [[ "$device_count" -ne 1 ]]; then
  echo "El disco contiene particiones u otros dispositivos asociados." >&2
  echo "Se detiene la preparación para no modificarlos." >&2
  exit 1
fi

mounted_at="$(findmnt -rn -S "$disk_device" -o TARGET || true)"

if [[ -n "$mounted_at" && "$mounted_at" != "$mount_dir" ]]; then
  echo "El disco ya está montado en otra ubicación: $mounted_at" >&2
  exit 1
fi

signatures="$(wipefs --no-act --noheadings --output TYPE "$disk_device")"

case "$signatures" in
  "")
    if [[ -n "$mounted_at" ]]; then
      echo "El disco está montado pero no se reconoce su formato." >&2
      exit 1
    fi

    echo "Disco sin firmas reconocidas: creando ext4..."
    mkfs.ext4 -L synkron-data "$disk_device"
    ;;
  "ext4")
    echo "El disco ya contiene ext4; se conserva su contenido."
    ;;
  *)
    echo "El disco contiene un formato inesperado: $signatures" >&2
    echo "No se modificará." >&2
    exit 1
    ;;
esac

disk_uuid="$(blkid -s UUID -o value "$disk_device")"

if [[ -z "$disk_uuid" ]]; then
  echo "No se pudo obtener el UUID del sistema de archivos." >&2
  exit 1
fi

mkdir -p "$mount_dir"

# Evitar modificar una entrada existente que apunte a otro disco.
existing_source="$(
  awk -v target="$mount_dir" \
    '$1 !~ /^#/ && $2 == target { print $1 }' /etc/fstab
)"

if [[ -n "$existing_source" && "$existing_source" != "UUID=$disk_uuid" ]]; then
  echo "Ya existe otra configuración en fstab para $mount_dir." >&2
  exit 1
fi

if [[ -z "$existing_source" ]]; then
  printf 'UUID=%s %s ext4 defaults,nofail,x-systemd.device-timeout=90s 0 2\n' \
    "$disk_uuid" "$mount_dir" >> /etc/fstab
fi

systemctl daemon-reload

if ! mountpoint -q "$mount_dir"; then
  mount "$mount_dir"
fi

mounted_uuid="$(findmnt -rn -M "$mount_dir" -o UUID)"

if [[ "$mounted_uuid" != "$disk_uuid" ]]; then
  echo "El disco montado en $mount_dir no es el esperado." >&2
  exit 1
fi

echo "Disco de datos montado correctamente en $mount_dir"

mkdir -p "$mount_dir/docker"
mkdir -p /etc/docker
mkdir -p /etc/systemd/system/docker.service.d

cat > /etc/docker/daemon.json <<EOF
{
  "data-root": "$mount_dir/docker",
  "features": {
    "containerd-snapshotter": false
  },
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

cat > /etc/systemd/system/docker.service.d/storage.conf <<EOF
[Unit]
RequiresMountsFor=$mount_dir
ConditionPathIsMountPoint=$mount_dir
EOF

systemctl daemon-reload

export DEBIAN_FRONTEND=noninteractive

apt-get -o DPkg::Lock::Timeout=300 install -y \
  docker.io \
  docker-compose-v2

systemctl enable docker.service
systemctl restart docker.service

docker_root="$(docker info --format '{{.DockerRootDir}}')"

if [[ "$docker_root" != "$mount_dir/docker" ]]; then
  echo "Docker no está utilizando el disco de datos esperado." >&2
  exit 1
fi

docker compose version

echo "Preparación de Synkron completada correctamente."