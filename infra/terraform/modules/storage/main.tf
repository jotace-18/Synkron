resource "azurerm_managed_disk" "this" {
  name                 = var.name
  location             = var.location
  resource_group_name  = var.resource_group_name
  zone                 = var.zone
  storage_account_type = "StandardSSD_LRS"
  create_option        = "Empty"
  disk_size_gb         = var.disk_size_gb
}

resource "azurerm_virtual_machine_data_disk_attachment" "this" {
  managed_disk_id    = azurerm_managed_disk.this.id
  virtual_machine_id = var.virtual_machine_id
  lun                = 0
  caching            = "None"
}
