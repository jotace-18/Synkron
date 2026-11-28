output "virtual_machine_id" {
  description = "Identificador de la máquina virtual."
  value       = azurerm_linux_virtual_machine.this.id
}

output "public_ip_address" {
  description = "Dirección IP pública de la máquina."
  value       = azurerm_public_ip.this.ip_address
}

output "admin_username" {
  description = "Usuario administrador de la máquina."
  value       = azurerm_linux_virtual_machine.this.admin_username
}
