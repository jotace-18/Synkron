output "resource_group_name" {
  description = "Grupo de recursos del laboratorio."
  value       = azurerm_resource_group.lab.name
}

output "virtual_network_id" {
  description = "Identificador de la red virtual del laboratorio."
  value       = module.network.virtual_network_id
}

output "subnet_ids" {
  description = "Identificadores de las subredes del laboratorio."
  value       = module.network.subnet_ids
}
