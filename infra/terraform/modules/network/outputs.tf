output "virtual_network_id" {
  description = "Identificador de la red virtual."
  value       = azurerm_virtual_network.this.id
}

output "subnet_ids" {
  description = "Identificadores de las subredes por nombre."
  value = {
    for name, subnet in azurerm_subnet.this : name => subnet.id
  }
}
