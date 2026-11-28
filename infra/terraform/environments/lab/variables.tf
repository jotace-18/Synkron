variable "location" {
  description = "Región de Azure para el laboratorio."
  type        = string
  default     = "austriaeast"
}

variable "resource_group_name" {
  description = "Grupo de recursos de la infraestructura de Synkron."
  type        = string
  default     = "rg-synkron-lab"
}

variable "admin_cidr" {
  description = "IPv4 pública autorizada para administrar el laboratorio."
  type        = string

  validation {
    condition = (
      can(cidrnetmask(var.admin_cidr)) &&
      endswith(var.admin_cidr, "/32")
    )
    error_message = "Debe indicar una única IPv4 válida con máscara /32."
  }
}
