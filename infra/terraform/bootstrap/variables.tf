variable "location" {
  description = "Región de Azure para almacenar el estado de Terraform."
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Grupo de recursos dedicado al estado de Terraform."
  type        = string
  default     = "rg-synkron-tfstate"
}

variable "storage_account_name" {
  description = "Nombre globalmente único de la cuenta de almacenamiento."
  type        = string

  validation {
    condition = can(
      regex("^[a-z0-9]{3,24}$", var.storage_account_name)
    )
    error_message = "Debe contener entre 3 y 24 caracteres: letras minúsculas y números."
  }
}
