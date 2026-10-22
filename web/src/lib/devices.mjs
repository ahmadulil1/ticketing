// Join without deleting inventory records, including legacy duplicates.
export function deviceRows(devices, inventories) {
  const byDevice = new Map(devices.map(device => [device.device_id, device]));
  const linked = new Set(inventories.map(item => item.device_id).filter(Boolean));
  return [
    ...inventories.map(item => ({ ...byDevice.get(item.device_id), ...item, rowId: item.id, inventoryId: item.id })),
    ...devices.filter(device => !linked.has(device.device_id)).map(device => ({ ...device, rowId: device.device_id })),
  ];
}
