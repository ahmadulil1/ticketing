// Join tanpa menghapus baris inventaris, termasuk duplikat lama.
// Group milik device: device_specs.lokasi.
// Satu baris = satu perangkat; semua nomor inventaris device dikumpulkan di `inventories`.
export function deviceRows(devices, inventories) {
  const byDevice = new Map(devices.map(device => [device.device_id, device]));
  const byInventoryDevice = new Map();
  for (const item of inventories) {
    if (!item.device_id) continue;
    const list = byInventoryDevice.get(item.device_id);
    if (list) list.push(item);
    else byInventoryDevice.set(item.device_id, [item]);
  }
  const rows = [];
  for (const device of devices) {
    const invList = (byInventoryDevice.get(device.device_id) || []).slice().sort((a, b) =>
      String(a.no_inventaris || "").localeCompare(String(b.no_inventaris || ""))
    );
    const primary = invList[0];
    rows.push({
      ...device,
      lokasi: device.lokasi ?? primary?.lokasi ?? null,
      no_inventaris: primary?.no_inventaris || null,
      inventoryId: primary?.id || null,
      inventories: invList.map(i => ({ id: i.id, no_inventaris: i.no_inventaris, lokasi: i.lokasi, catatan: i.catatan })),
      rowId: device.device_id,
    });
  }
  // Aset tanpa device tetap tampil, tapi tanpa group.
  for (const item of inventories) {
    if (item.device_id) continue;
    rows.push({
      ...item,
      lokasi: null,
      inventoryId: item.id,
      inventories: [{ id: item.id, no_inventaris: item.no_inventaris, lokasi: item.lokasi, catatan: item.catatan }],
      rowId: item.id,
    });
  }
  return rows;
}
