export const ACTIVITY_OPTIONS = [
  "cleaning",
  "perbaikan",
  "pengecekan",
  "upgrade",
  "instalasi",
  "troubleshooting",
];

export const ASSET_STATUS_OPTIONS = [
  "aktif",
  "maintenance",
  "rusak",
  "nonaktif",
];

export const MAINTENANCE_INTERVAL_OPTIONS = [
  { value: 6, label: "6 bulan" },
  { value: 12, label: "1 tahun" },
  { value: 24, label: "2 tahun" },
];

export const ASSET_PRIORITY_OPTIONS = [
  { value: "lewat", label: "Lewat" },
  { value: "mendekati", label: "Mendekati" },
  { value: "belum-ada-histori", label: "Belum ada histori" },
  { value: "normal", label: "Normal" },
];

export const MAINTENANCE_STATUS_OPTIONS = [
  { value: "selesai", label: "Selesai" },
  { value: "planning", label: "Terjadwal" },
];

export const DEFAULT_FORM_VALUES = {
  tanggal_maintenance: "",
  kode_aset: "",
  nama_perangkat: "",
  tipe: "",
  lokasi: "",
  jenis_kegiatan: "",
  durasi: "",
  status: "selesai",
  catatan: "",
};

export const DEFAULT_ASSET_FORM_VALUES = {
  kode_aset: "",
  nama_perangkat: "",
  tipe: "",
  lokasi: "",
  status: "aktif",
  maintenance_interval_months: "12",
};

export const DEFAULT_FILTERS = {
  lokasi: "",
  tahun: "",
  tanggalMulai: "",
  tanggalSelesai: "",
  jenisKegiatan: "",
  status: "",
  officeType: "",
  search: "",
};

export const DEFAULT_ASSET_FILTERS = {
  lokasi: "",
  status: "",
  maintenanceIntervalMonths: "",
  priority: "",
  search: "",
};

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
