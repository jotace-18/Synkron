output "resource_group_name" {
  description = "Grupo de recursos del estado de Terraform."
  value       = azurerm_resource_group.tfstate.name
}

output "storage_account_name" {
  description = "Cuenta de almacenamiento del estado de Terraform."
  value       = azurerm_storage_account.tfstate.name
}

output "container_name" {
  description = "Contenedor privado para los archivos de estado."
  value       = azurerm_storage_container.tfstate.name
}
    