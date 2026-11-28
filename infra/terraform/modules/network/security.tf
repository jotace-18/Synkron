resource "azurerm_network_security_group" "this" {
  for_each = var.subnets

  name                = "nsg-${each.key}"
  location            = var.location
  resource_group_name = var.resource_group_name
}

resource "azurerm_network_security_rule" "deny_inbound" {
  for_each = var.subnets

  name                        = "deny-unmatched-inbound"
  priority                    = 4096
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.this[each.key].name
}

resource "azurerm_subnet_network_security_group_association" "this" {
  for_each = var.subnets

  subnet_id                 = azurerm_subnet.this[each.key].id
  network_security_group_id = azurerm_network_security_group.this[each.key].id
}

resource "azurerm_network_security_rule" "web" {
  for_each = {
    http  = { port = "80", priority = 100 }
    https = { port = "443", priority = 110 }
  }

  name                        = "allow-${each.key}"
  priority                    = each.value.priority
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = each.value.port
  source_address_prefix       = "Internet"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.this["public"].name
}

resource "azurerm_network_security_rule" "ssh" {
  name                        = "allow-ssh-admin"
  priority                    = 120
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "22"
  source_address_prefix       = var.admin_cidr
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.this["public"].name
}


resource "azurerm_network_security_rule" "deny_outbound" {
  for_each = var.subnets

  name                        = "deny-unmatched-outbound"
  priority                    = 4096
  direction                   = "Outbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.this[each.key].name
}

resource "azurerm_network_security_rule" "public_outbound" {
  for_each = {
    web = {
      priority    = 100
      protocol    = "Tcp"
      ports       = ["80", "443"]
      destination = "Internet"
    }
    dns_tcp = {
      priority    = 110
      protocol    = "Tcp"
      ports       = ["53"]
      destination = "AzurePlatformDNS"
    }
    dns_udp = {
      priority    = 120
      protocol    = "Udp"
      ports       = ["53"]
      destination = "AzurePlatformDNS"
    }
    ntp = {
      priority    = 130
      protocol    = "Udp"
      ports       = ["123"]
      destination = "Internet"
    }
  }

  name                        = "allow-${each.key}-outbound"
  priority                    = each.value.priority
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = each.value.protocol
  source_port_range           = "*"
  destination_port_ranges     = each.value.ports
  source_address_prefix       = "*"
  destination_address_prefix  = each.value.destination
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.this["public"].name
}
