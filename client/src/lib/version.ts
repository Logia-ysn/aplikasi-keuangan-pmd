/**
 * Single source of truth untuk versi aplikasi.
 * Update file ini setiap kali release baru.
 */

export const APP_VERSION = '2.0.0';
export const APP_BUILD_DATE = '2026-04-01';
export const APP_NAME = 'Keuangan';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.0.0',
    date: '2026-04-01',
    title: 'Konfigurasi Akun Sistem & Perbaikan COA',
    changes: [
      'Fitur Akun Sistem: konfigurasi mapping akun COA untuk auto GL posting via Pengaturan > Akun Sistem',
      'Akun sistem (AR, AP, Kas, Penjualan, dll) sekarang bisa diganti tanpa ubah kode — mendukung berbagai jenis industri',
      'Multi-akun untuk Kas & Bank: tambah/hapus akun bank fleksibel',
      'Validasi startup: warning otomatis jika mapping akun belum lengkap',
      'Perbaikan COA: akun 7 dipisah menjadi 7 (Pendapatan Diluar Usaha) dan 8 (Beban Diluar Usaha)',
      'Akun 5 (HPP) sekarang isGroup=true untuk mendukung sub-akun',
      'Fix saldo awal: gunakan Ekuitas Saldo Awal (3.1) bukan Laba Ditahan (3.2)',
      'Fix import Excel: kolom "balance" sekarang terbaca saat import COA',
      'Fix stok: GL posting otomatis saat tambah riwayat stok meskipun item belum punya akun',
      'Fix laporan Laba Rugi: support multiple root group pendapatan dan beban',
      'Refactor 13 route files: hapus hardcoded account numbers',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-03-29',
    title: 'Dashboard Stok & Bulk Import/Export Excel',
    changes: [
      'Dashboard Stok Gudang: KPI cards, tabel status stok, chart perbandingan vs minimum 20.000 Kg, tren 6 bulan, statistik produksi',
      'Reactive dark/light mode untuk semua chart (MutationObserver)',
      'Download & Import Excel untuk Bagan Akun, Pelanggan/Vendor, dan Master Item',
      'Template Excel berisi data existing untuk diedit dan di-upload kembali',
      'Endpoint POST /api/import/inventory untuk bulk import master item',
      'Endpoint GET /api/import/template/:type untuk download template Excel',
      'Fix ReconciliationModal type error (accountType, isGroup)',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-28',
    title: 'Standarisasi COA & Data Awal',
    changes: [
      'Restrukturisasi COA 111 akun sesuai standar akuntansi (dari spreadsheet perusahaan)',
      'Penomoran baru tanpa leading zero: 1.1.x Kas/Bank, 1.2.x Piutang, 1.4.x Persediaan, 1.6.x Aset Tetap, 1.7.x Akum. Depresiasi',
      '32 sub-akun persediaan detail (Gabah PW Basah s/d Beras Reject IR)',
      '26 akun beban operasional (6.01-6.26)',
      'Pendapatan & Beban Diluar Usaha (7.1.xx, 7.2.xx)',
      'Seed 18 vendor + 31 customer untuk development',
      'Fix isGroup pada akun sistem (4.1 Penjualan, 5 COGS) agar GL posting berfungsi',
      'Fix cash flow report: investing → 1.6/1.7, financing → 2.3',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-28',
    title: 'Uang Muka Vendor & Item Jasa',
    changes: [
      'Fitur Uang Muka Vendor: deposit ke supplier, apply ke invoice pembelian, cancel & reverse GL otomatis',
      'Halaman khusus /vendor-deposits dengan summary cards dan tabel',
      'Tombol "Gunakan Uang Muka" di detail invoice pembelian',
      'Badge "Uang Muka" di halaman Bank & Kas',
      'Tampilkan saldo uang muka di kartu mitra (Pelanggan & Vendor)',
      'COA baru: 1.2 Aset Lancar Lainnya, 1.2.1 Uang Muka Vendor',
      'Support item jasa di invoice penjualan (tanpa stok)',
      'Perbaikan halaman inventory',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-27',
    title: 'Role StaffProduksi & Stok Otomatis',
    changes: [
      'Tambah role StaffProduksi untuk akses gudang & pembelian',
      'Link item invoice ke inventory — stok & COA otomatis sinkron',
      'Rekonsiliasi & transaksi berulang dibatasi dari Viewer',
      'Perbaikan aksesibilitas toggle dashboard',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-20',
    title: 'Cetak Laporan, Favicon Dinamis & Update Check',
    changes: [
      'Fix cetak laporan: print CSS untuk output bersih tanpa sidebar/navbar',
      'Tambah print header otomatis: nama perusahaan, judul laporan, periode',
      'Favicon tab browser otomatis menggunakan logo perusahaan dari pengaturan',
      'Title tab browser dinamis sesuai nama perusahaan',
      'Fitur cek pembaruan sekarang berfungsi — bandingkan versi dari GitHub',
      'Tampilkan changelog perubahan baru saat pembaruan tersedia',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-20',
    title: 'Redesign Invoice & Set Saldo Awal',
    changes: [
      'Redesign halaman Invoice Penjualan & Pembelian — summary cards, filter, pagination',
      'Tambah detail drawer invoice: klik row untuk lihat detail, riwayat pembayaran, progress',
      'Tambah fitur Set Saldo Awal di Bagan Akun (COA)',
      'Fix feedback hapus mitra (toast soft-delete vs hard-delete)',
      'Tambah endpoint GET /api/sales/invoices/:id dan /api/purchase/invoices/:id',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-19',
    title: 'Fix Party & Error Handling',
    changes: [
      'Fix edit & delete mitra (party) — hardening error handling semua route',
      'Standarisasi BusinessError + handleRouteError di seluruh backend',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-17',
    title: 'Pengeluaran & Pinbuk',
    changes: [
      'Refactor pengeluaran: support semua jenis pengeluaran, bukan hanya supplier',
      'Fix payment error handling + tambah fitur pinbuk antar bank',
      'Refactor semua template laporan keuangan + fix bugs',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-17',
    title: 'Auto Backup & Production Fix',
    changes: [
      'Add auto backup system: daily pg_dump ke GitHub',
      'Fix Express 5 wildcard route untuk path-to-regexp compatibility',
      'Fix CORS: auto-allow localhost',
      'Fix 502 Bad Gateway: dotenv ke production dependencies',
      'Fix production deploy: API URL, static serving, env config',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-16',
    title: 'Initial Release',
    changes: [
      'Dashboard KPI: kas, piutang, hutang, laba bersih MTD',
      'Bagan Akun (COA) hierarki dengan parent-child',
      'Buku Besar (General Ledger) double-entry',
      'Invoice Penjualan & Pembelian dengan auto-posting GL',
      'Bank & Kas: penerimaan, pengeluaran, pinbuk',
      'Pelanggan & Vendor management',
      'Laporan: Trial Balance, P&L, Neraca, Arus Kas, Aging AR/AP',
      'Tahun Buku & tutup buku',
      'Pengaturan profil perusahaan + logo',
      'Role-based auth (Admin, Accountant, Viewer)',
    ],
  },
];
