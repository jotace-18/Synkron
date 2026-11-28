resource "azurerm_resource_group" "lab" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    project     = "synkron"
    environment = "lab"
  }
}

module "network" {
  source = "../../modules/network"

  name                = "vnet-synkron-lab"
  location            = azurerm_resource_group.lab.location
  resource_group_name = azurerm_resource_group.lab.name
  address_space       = ["10.42.0.0/16"]
  admin_cidr          = var.admin_cidr

  subnets = {
    public = {
      address_prefixes       = ["10.42.1.0/24"]
      default_route_next_hop = "Internet"
    }
    private = {
      address_prefixes       = ["10.42.2.0/24"]
      default_route_next_hop = "None"
    }
  }
}
