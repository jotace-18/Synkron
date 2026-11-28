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

module "compute" {
  source = "../../modules/compute"
  zone   = "2"

  name                = "vm-synkron-lab"
  location            = azurerm_resource_group.lab.location
  resource_group_name = azurerm_resource_group.lab.name
  subnet_id           = module.network.subnet_ids["public"]
  vm_size             = "Standard_B2ls_v2"
  admin_username      = "synkron"
  ssh_public_key      = file(pathexpand("~/.ssh/synkron-lab.pub"))

  depends_on = [module.network]

  custom_data = base64encode(templatefile(
    "${path.module}/cloud-init.yaml.tftpl",
    {
      bootstrap_script_base64 = filebase64(
        "${path.module}/scripts/bootstrap.sh"
      )
    }
  ))
}

module "storage" {
  source = "../../modules/storage"
  zone   = "2"

  name                = "disk-synkron-lab-data"
  location            = azurerm_resource_group.lab.location
  resource_group_name = azurerm_resource_group.lab.name
  disk_size_gb        = 32
  virtual_machine_id  = module.compute.virtual_machine_id

}
