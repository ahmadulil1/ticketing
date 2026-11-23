import { formatDate, formatMinutes } from "@/lib/utils";

export async function exportMaintenanceToExcel(rows) {
  const XLSX = await import("xlsx");
  const sheetData = rows.map((item) => ({
    "Tanggal Maintenance": formatDate(item.tanggal_maintenance),
    "Kode Aset": item.kode_aset,
    "Nama Perangkat": item.nama_perangkat,
    Tipe: item.tipe || "-",
    Lokasi: item.lokasi || "-",
    "Jenis Kegiatan": item.jenis_kegiatan || "-",
    Status: item.status === "planning" ? "Planning" : "Selesai",
    Durasi: formatMinutes(item.durasi),
    Catatan: item.catatan || "-",
    Dibuat: formatDate(item.created_at),
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sheetData);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Maintenance");
  XLSX.writeFile(workbook, "maintenance-report.xlsx");
}
