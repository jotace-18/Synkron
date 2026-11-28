variable "name" {
  description = "Nombre de la máquina virtual."
  type        = string
}

variable "location" {
  description = "Región de Azure."
  type        = string
}

variable "resource_group_name" {
  description = "Grupo de recursos de la máquina."
  type        = string
}

variable "subnet_id" {
  description = "Identificador de la subred de la máquina."
  type        = string
}

variable "vm_size" {
  description = "Tamaño de la máquina virtual."
  type        = string
}

variable "admin_username" {
  description = "Usuario administrador de la máquina."
  type        = string
}

variable "ssh_public_key" {
  description = "Contenido de la clave pública SSH del administrador."
  type        = string
}

variable "zone" {
  description = "Zona de disponibilidad de Azure."
  type        = string
}

variable "custom_data" {
  description = "Configuración cloud-init codificada en Base64."
  type        = string
  default     = null
}
