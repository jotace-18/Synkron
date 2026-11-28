resource "azurerm_virtual_network" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = var.address_space
}

resource "azurerm_subnet" "this" {
  for_each = var.subnets

  name                 = "snet-${each.key}"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = each.value.address_prefixes

  default_outbound_access_enabled = false
}

resource "azurerm_route_table" "this" {
  for_each = var.subnets

  name                = "rt-${each.key}"
  location            = var.location
  resource_group_name = var.resource_group_name
}

resource "azurerm_route" "default" {
  for_each = var.subnets

  name                = "default"
  resource_group_name = var.resource_group_name
  route_table_name    = azurerm_route_table.this[each.key].name
  address_prefix      = "0.0.0.0/0"
  next_hop_type       = each.value.default_route_next_hop
}

resource "azurerm_subnet_route_table_association" "this" {
  for_each = var.subnets

  subnet_id      = azurerm_subnet.this[each.key].id
  route_table_id = azurerm_route_table.this[each.key].id
}
