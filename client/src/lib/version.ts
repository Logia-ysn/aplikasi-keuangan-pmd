/**
 * Single source of truth untuk versi aplikasi.
 * Update file ini setiap kali release baru.
 */

export const APP_VERSION = '1.6.1';
export const APP_BUILD_DATE = '2026-03-26';
export const APP_NAME = 'Keuangan';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
