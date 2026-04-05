# Changelog

## [2.4.0] - 2026-04-05

### Fitur Baru
- **Dashboard Pelanggan & Vendor** — KPI (piutang, hutang, deposit), aging analysis piutang/hutang, top 10 pelanggan/vendor, invoice jatuh tempo, pembayaran terakhir
- **Dashboard Proses Produksi** — KPI produksi, volume input/output/samping, tren rendemen, top bahan input/output, rendemen tertinggi/terendah, dengan filter periode dan produk
- **Edit Proses Produksi** — Edit data produksi yang sudah dibuat (reverse stok & jurnal lama, buat baru)
- **Detail Proses Produksi** — Drawer detail dengan ringkasan biaya, jurnal GL, dan tombol pembatalan

### Perbaikan
- Fix GL posting invoice jasa: item bertipe service tanpa serviceItemId sekarang otomatis masuk ke akun 4.2 (Pendapatan Jasa) bukan 4.1 (Penjualan)
- Fix data 10 invoice item jasa yang salah masuk akun 4.1, dipindahkan ke 4.2 beserta jurnal dan ledger
- Fix rendemen produksi multi-input: kalkulasi total output / total input, produk samping tidak dihitung
- Fix duplikasi journal entry number saat edit produksi berulang (suffix -R, -R2, -R3, dst)
- Fix mobile overflow text/nilai keluar dari card container

## [2.3.0] - 2026-04-04

### Fitur Baru
- **PWA (Progressive Web App)** — Aplikasi bisa diinstall seperti native app di HP/desktop melalui browser
- **Buku Besar (General Ledger)** — Laporan mutasi per akun dengan filter tanggal dan export Excel
- **Pengaturan Akun Sistem** — Halaman pengaturan yang lebih lengkap dengan grouping, search, dan status konfigurasi
- **Stock Opname** — Fitur penyesuaian stok fisik dengan GL posting otomatis
- **Weighted Average Costing** — Metode HPP rata-rata tertimbang untuk perhitungan COGS
- **PPh Per-Item** — Pajak penghasilan per item di invoice penjualan, tampil di detail dan PDF
- **Upload Bukti Transfer** — Lampiran bukti transfer untuk semua transaksi kas/bank
- **Per-Item Inventory GL** — Posting GL persediaan per item (bukan bulk)
- **Opening Balance Deposits** — Saldo awal deposit pelanggan/supplier
- **Edit Stock Movement** — Edit pergerakan stok yang sudah diinput

### Perbaikan
- HPP penjualan & produksi posting ke akun 5.1 (HPP Beras), bukan parent 5
- Payment modal menampilkan saldo awal (non-invoice) outstanding
- GL reversal menggunakan metode swap pada semua flow pembatalan
- Produksi GL journal balanced (DR output = CR input)
- Dashboard dark mode chart dan nullish coalescing fix
- Tax report, security audit, dan database indexes
- COA menampilkan indikator D/K (Debit/Kredit)
- Report number overflow fix
- Docker build compatibility untuk PWA + Vite

## [2.2.0] - 2026-04-02

### Fitur Baru
- Sistem keuangan double-entry bookkeeping
- Modul penjualan, pembelian, pembayaran
- Chart of Accounts (COA) dengan tree structure
- Jurnal umum manual
- Laporan keuangan: Neraca, Laba Rugi, Arus Kas
- Manajemen inventori dengan produksi (gabah → beras)
- Multi-user dengan role: Admin, Accountant, Viewer
- Export PDF dan Excel
- Dark mode
- Docker Compose deployment
