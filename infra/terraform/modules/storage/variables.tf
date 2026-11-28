variable "name" {
  description = "Nombre del disco de datos."
  type        = string
}

variable "location" {
  description = "Región de Azure."
  type        = string
}

variable "resource_group_name" {
  description = "Grupo de recursos del disco."
  type        = string
}

variable "disk_size_gb" {
  description = "Capacidad del disco de datos en GiB."
  type        = number
}

variable "virtual_machine_id" {
  description = "Identificador de la máquina a la que se conecta el disco."
  type        = string
}

variable "zone" {
  description = "Zona de disponibilidad de Azure."
  type        = string
}
