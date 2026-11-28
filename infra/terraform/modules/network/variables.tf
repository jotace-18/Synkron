variable "name" {
  description = "Nombre de la red virtual."
  type        = string
}

variable "location" {
  description = "Región de Azure para la red."
  type        = string
}

variable "resource_group_name" {
  description = "Grupo de recursos al que pertenece la red."
  type        = string
}

variable "address_space" {
  description = "Rangos de direcciones privadas de la red virtual."
  type        = list(string)
}

variable "subnets" {
  description = "Subredes, rangos privados y destino de la ruta general."
  type = map(object({
    address_prefixes       = list(string)
    default_route_next_hop = string
  }))
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
