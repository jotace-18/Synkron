output "disk_id" {
  description = "Identificador del disco de datos."
  value       = azurerm_managed_disk.this.id
}

output "lun" {
  description = "Número lógico del disco conectado a la máquina."
  value       = azurerm_virtual_machine_data_disk_attachment.this.lun
}
