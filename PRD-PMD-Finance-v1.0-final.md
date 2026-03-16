# PRD — PMD Finance v1.0

**Product Requirements Document**
**Aplikasi Keuangan PT Pangan Masa Depan**

| Field | Value |
|-------|-------|
| Versi | 1.0 (Final) |
| Tanggal | 14 Maret 2026 |
| Penulis | Logia (Yayang Setya Nugroho) |
| Perusahaan | PT Pangan Masa Depan |
| Status | Final |

---

## 1. Ringkasan Eksekutif

PMD Finance adalah aplikasi keuangan berbasis web yang dirancang khusus untuk PT Pangan Masa Depan (PMD), sebuah perusahaan penggilingan dan pemrosesan beras yang beroperasi di Cirebon, Jawa Barat. Aplikasi ini bertujuan menggantikan pencatatan keuangan manual dengan sistem akuntansi digital berstandar industri yang mengimplementasikan double-entry bookkeeping sesuai Pernyataan Standar Akuntansi Keuangan (PSAK).

Aplikasi ini merupakan sistem standalone yang tidak terkait dengan sistem MES (Manufacturing Execution System) yang sedang dikembangkan secara terpisah. PMD Finance akan di-host secara mandiri (self-hosted) pada Raspberry Pi 5 dan dapat diakses melalui browser dari perangkat apapun, baik komputer maupun smartphone.

### 1.1 Tujuan Utama

- Menyediakan sistem pencatatan keuangan digital berstandar double-entry bookkeeping
- Menghasilkan laporan keuangan standar (Neraca, Laba Rugi, Arus Kas) secara otomatis
- Mengelola piutang dan hutang usaha secara terstruktur
- Memberikan visibilitas real-time terhadap kondisi keuangan perusahaan
- Menyediakan audit trail yang lengkap untuk setiap transaksi keuangan

### 1.2 Target Pengguna

| Aspek | Detail |
|-------|--------|
| Pengguna Utama | Staff Accounting Dedicated (1-2 orang) |
| Pengguna Sekunder | Owner (Logia) — monitoring & approval |
| Tingkat Keahlian | Familiar dengan dasar-dasar akuntansi |
| Bahasa | Bahasa Indonesia (seluruh interface) |
| Akses | Desktop browser & mobile browser (responsive) |

### 1.3 Metrik Keberhasilan

| Metrik | Target | Cara Ukur |
|--------|--------|-----------|
| Waktu input transaksi | < 2 menit per transaksi | Stopwatch test saat UAT |
| Akurasi laporan | 100% balance (debit = credit) | Automated validation |
| Uptime sistem | > 99% selama jam kerja | PM2 monitoring & logs |
| Adopsi pengguna | Digunakan setiap hari kerja | Login frequency tracking |
| Waktu generate laporan | < 5 detik untuk laporan bulanan | Performance benchmark |

---

## 2. Latar Belakang & Konteks Bisnis

### 2.1 Profil Perusahaan

PT Pangan Masa Depan (PMD) adalah perusahaan yang bergerak di bidang penggilingan dan pemrosesan beras. Operasional utama meliputi pembelian gabah dari petani, penggilingan menjadi beras, serta penjualan beras dan produk sampingan (sekam, bekatul/dedak) ke distributor dan pasar.

### 2.2 Masalah yang Diselesaikan

- Pencatatan keuangan masih dilakukan secara manual atau semi-manual, rentan terhadap kesalahan
- Tidak ada visibilitas real-time terhadap posisi keuangan (kas, piutang, hutang)
- Laporan keuangan membutuhkan waktu lama untuk disusun secara manual
- Tidak ada audit trail — sulit melacak siapa melakukan perubahan apa
- Kesulitan memantau piutang jatuh tempo dari pelanggan

### 2.3 Transaksi Khas Bisnis Penggilingan Beras

#### 2.3.1 Pembelian Gabah

Pembelian gabah dari petani merupakan transaksi terbesar dan paling sering. Bisa berupa pembayaran tunai langsung atau dengan sistem tempo (hutang usaha). Setiap pembelian harus tercatat dengan detail: nama petani/supplier, jumlah (kg), harga per kg, total, dan metode pembayaran.

Jurnal:
- Debit: Persediaan — Gabah (Aset)
- Credit: Kas / Hutang Usaha

#### 2.3.2 Penjualan Beras

Penjualan beras ke distributor atau pasar, bisa tunai atau piutang. Perlu tracking nomor invoice, jatuh tempo, dan status pembayaran.

Jurnal:
- Debit: Kas / Piutang Usaha
- Credit: Penjualan Beras (Revenue)

#### 2.3.3 Penjualan Produk Sampingan

Sekam (rice husk) dan bekatul/dedak (rice bran) merupakan produk sampingan yang memiliki nilai jual. Sekam dijual ke PT Daya Padi Abadi (DPA) untuk produksi biomass pellet, sementara bekatul dijual ke peternak atau industri pakan.

Jurnal:
- Debit: Kas
- Credit: Penjualan Sekam / Penjualan Bekatul (Revenue)

#### 2.3.4 Biaya Operasional

Meliputi biaya listrik pabrik, tenaga kerja produksi, pemeliharaan mesin, transportasi, gaji karyawan, dan biaya administrasi umum lainnya.

Jurnal:
- Debit: Beban (sesuai kategori)
- Credit: Kas / Bank

---

## 3. Arsitektur Teknis

### 3.1 Prinsip Arsitektur

- **Self-hosted** — seluruh sistem berjalan pada infrastruktur milik sendiri (Raspberry Pi 5)
- **Web-first** — diakses melalui browser, tidak memerlukan instalasi aplikasi khusus
- **Mobile-responsive** — layout menyesuaikan ukuran layar desktop dan smartphone
- **Standalone** — tidak terkait atau bergantung pada sistem MES/ERP yang lain
- **Security-first** — autentikasi, otorisasi, dan audit trail sejak hari pertama
- **Immutable ledger** — entry akuntansi yang sudah disubmit tidak dapat diubah atau dihapus

### 3.2 Technology Stack

| Layer | Teknologi | Justifikasi |
|-------|-----------|-------------|
| Frontend | React 18 + TypeScript | Konsisten dengan skill set, ekosistem besar, type-safe |
| UI Framework | Tailwind CSS + shadcn/ui | Modern, ringan, komponen siap pakai, mobile-responsive |
| State Management | TanStack Query + Zustand | Server state caching + client state, ringan & performant |
| Backend | Node.js + Express + TypeScript | Konsisten, ringan untuk Raspberry Pi 5 |
| ORM | Prisma | Type-safe, migration support kuat, dokumentasi lengkap |
| Database | PostgreSQL 16 | ACID compliance, referential integrity, JSON support |
| Autentikasi | JWT + bcrypt | Stateless, simple, cocok untuk 1-2 user |
| PDF Generation | @react-pdf/renderer | Ringan (tanpa headless browser), JSX syntax, cocok Pi 5 |
| Process Manager | PM2 | Auto-restart, monitoring, log management |
| Reverse Proxy | Cloudflare Tunnel | Bypass CGNAT, HTTPS otomatis, zero-config |
| Monorepo | npm workspaces | Simple, native Node.js, shared types |
| Version Control | GitHub | Sudah digunakan untuk project lain |
| Bahasa Interface | Bahasa Indonesia | Seluruh UI dalam Bahasa Indonesia |

### 3.3 Alur Akses

- **LAN**: Browser → http://[IP-Pi5]:3000 → Express Server → PostgreSQL
- **Remote/Publik**: Browser → HTTPS → Cloudflare Tunnel → Express Server → PostgreSQL
- **Domain**: https://finance.panganmasadepan.com (direncanakan)

### 3.4 Infrastruktur Raspberry Pi 5

| Komponen | Spesifikasi | Catatan |
|----------|-------------|---------|
| Hardware | Raspberry Pi 5 (8GB RAM) | Dengan NVMe SSD untuk storage |
| OS | Raspberry Pi OS 64-bit | ARM64, stabil untuk Pi 5 |
| PostgreSQL | ~256-512 MB RAM allocated | Connection pooling max 10 koneksi |
| Node.js | ~128-256 MB RAM | Managed oleh PM2 |
| Headroom | ~7 GB tersisa | Cukup untuk OS dan service lain |
| Network | Cloudflare Tunnel | Bypass CGNAT IndiHome/Telkom |
| Backup | Automated via cron + pg_dump | Daily backup, rotasi 7/4/12 |

### 3.5 Mengapa PostgreSQL (Bukan SQLite)

- Concurrent access — multiple user bisa query bersamaan tanpa lock
- ACID compliance yang lebih robust untuk data keuangan
- Referential integrity (foreign keys yang benar-benar enforced)
- Scalable — jika nanti user bertambah, tidak perlu migrasi database
- Backup & restore lebih mature (pg_dump, point-in-time recovery)

---

## 4. Struktur Data (Database Schema)

Database schema dirancang berdasarkan prinsip double-entry bookkeeping dengan inspirasi dari data model Frappe Books. Semua tabel menggunakan UUID sebagai primary key.

### 4.1 Entity Relationship

```
Company (1) ──── (N) Account
Company (1) ──── (N) FiscalYear
Account (1) ──── (N) AccountingLedgerEntry
Party   (1) ──── (N) SalesInvoice
Party   (1) ──── (N) PurchaseInvoice
SalesInvoice (1) ──── (N) SalesInvoiceItem
PurchaseInvoice (1) ──── (N) PurchaseInvoiceItem
JournalEntry (1) ──── (N) JournalEntryAccount
Payment (1) ──── (N) PaymentFor
```

### 4.2 Tabel Inti

#### 4.2.1 accounts

Menyimpan Chart of Accounts dengan struktur tree (parent-child). Mendukung akun grup dan akun ledger.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| name | VARCHAR(255), NOT NULL | Nama akun |
| parent_id | UUID, FK → accounts | Parent akun (tree structure) |
| account_type | ENUM | Asset, Liability, Equity, Revenue, Expense |
| root_type | ENUM | Root category |
| account_number | VARCHAR(20), UNIQUE | Nomor akun (misal: 1.1.1) |
| is_group | BOOLEAN DEFAULT false | Apakah akun grup (true) atau ledger (false) |
| is_active | BOOLEAN DEFAULT true | Apakah akun aktif |
| balance | DECIMAL(15,2) DEFAULT 0 | Saldo terkini (computed) |
| currency | VARCHAR(3) DEFAULT 'IDR' | Mata uang |
| description | TEXT | Deskripsi akun (opsional) |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update terakhir |

#### 4.2.2 accounting_ledger_entries

Tabel inti sistem — menyimpan semua entry akuntansi yang bersifat IMMUTABLE. Entry yang sudah dibuat tidak dapat diubah atau dihapus, hanya bisa dibatalkan dengan membuat entry pembalik (reversal).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| date | DATE, NOT NULL | Tanggal transaksi |
| account_id | UUID, FK → accounts, NOT NULL | Referensi ke akun |
| party_id | UUID, FK → parties | Referensi ke pihak (opsional) |
| debit | DECIMAL(15,2) DEFAULT 0 | Jumlah debit |
| credit | DECIMAL(15,2) DEFAULT 0 | Jumlah kredit |
| reference_type | VARCHAR(50) | Tipe dokumen sumber (SalesInvoice, Payment, JournalEntry) |
| reference_id | UUID | ID dokumen sumber |
| description | TEXT | Keterangan entry |
| fiscal_year_id | UUID, FK → fiscal_years | Tahun buku |
| is_cancelled | BOOLEAN DEFAULT false | Flag pembatalan |
| created_at | TIMESTAMP | Waktu pembuatan — TIDAK ADA updated_at (immutable) |

#### 4.2.3 journal_entries

Jurnal umum untuk pencatatan transaksi ad-hoc.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| entry_number | VARCHAR(20), UNIQUE | Auto-generated: JE-2026-001 |
| date | DATE, NOT NULL | Tanggal jurnal |
| status | ENUM('Draft','Submitted','Cancelled') | Status dokumen |
| narration | TEXT | Keterangan/narasi jurnal |
| fiscal_year_id | UUID, FK → fiscal_years | Tahun buku |
| created_by | UUID, FK → users | User yang membuat |
| submitted_at | TIMESTAMP | Waktu submit |
| cancelled_at | TIMESTAMP | Waktu pembatalan |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update |

#### 4.2.4 journal_entry_accounts

Baris-baris debit/kredit dalam satu journal entry.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| journal_entry_id | UUID, FK → journal_entries | Referensi ke jurnal |
| account_id | UUID, FK → accounts | Akun yang didebit/dikredit |
| party_id | UUID, FK → parties | Pihak terkait (opsional) |
| debit | DECIMAL(15,2) DEFAULT 0 | Jumlah debit |
| credit | DECIMAL(15,2) DEFAULT 0 | Jumlah kredit |
| description | TEXT | Keterangan baris |

#### 4.2.5 parties

Master data pelanggan dan pemasok.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| name | VARCHAR(255), NOT NULL | Nama pihak |
| party_type | ENUM('Customer','Supplier','Both') | Tipe pihak |
| phone | VARCHAR(20) | Nomor telepon |
| email | VARCHAR(255) | Alamat email |
| address | TEXT | Alamat lengkap |
| tax_id | VARCHAR(30) | NPWP |
| outstanding_amount | DECIMAL(15,2) DEFAULT 0 | Saldo piutang/hutang outstanding |
| is_active | BOOLEAN DEFAULT true | Apakah pihak aktif |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update |

#### 4.2.6 sales_invoices

Faktur penjualan.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| invoice_number | VARCHAR(20), UNIQUE | Auto-generated: SI-2026-001 |
| date | DATE, NOT NULL | Tanggal faktur |
| party_id | UUID, FK → parties | Customer |
| status | ENUM('Draft','Submitted','Paid','Partially Paid','Overdue','Cancelled') | Status |
| grand_total | DECIMAL(15,2) | Total keseluruhan |
| outstanding | DECIMAL(15,2) | Sisa yang belum dibayar |
| due_date | DATE | Tanggal jatuh tempo |
| notes | TEXT | Catatan tambahan |
| fiscal_year_id | UUID, FK → fiscal_years | Tahun buku |
| created_by | UUID, FK → users | User pembuat |
| submitted_at | TIMESTAMP | Waktu submit |
| cancelled_at | TIMESTAMP | Waktu cancel |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update |

#### 4.2.7 sales_invoice_items

Item-item dalam faktur penjualan.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| sales_invoice_id | UUID, FK → sales_invoices | Referensi ke faktur |
| item_name | VARCHAR(255) | Nama barang/jasa |
| quantity | DECIMAL(15,3) | Kuantitas |
| unit | VARCHAR(20) | Satuan (kg, karung, unit, dll) |
| rate | DECIMAL(15,2) | Harga satuan |
| amount | DECIMAL(15,2) | Subtotal (quantity × rate) |
| account_id | UUID, FK → accounts | Akun pendapatan |
| description | TEXT | Keterangan item |

#### 4.2.8 purchase_invoices

Struktur identik dengan sales_invoices, nomor auto-generated: PI-{YYYY}-{NNN}.

#### 4.2.9 purchase_invoice_items

Struktur identik dengan sales_invoice_items, FK ke purchase_invoices.

#### 4.2.10 payments

Pencatatan pembayaran masuk dan keluar.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| payment_number | VARCHAR(20), UNIQUE | Auto-generated: PAY-2026-001 |
| date | DATE, NOT NULL | Tanggal pembayaran |
| payment_type | ENUM('Receive','Pay') | Receive = terima dari customer, Pay = bayar ke supplier |
| party_id | UUID, FK → parties | Pihak yang membayar/dibayar |
| account_id | UUID, FK → accounts | Akun bank/kas yang digunakan |
| amount | DECIMAL(15,2) | Jumlah total pembayaran |
| status | ENUM('Draft','Submitted','Cancelled') | Status |
| reference_number | VARCHAR(100) | Nomor referensi (transfer bank, dll) |
| notes | TEXT | Catatan |
| created_by | UUID, FK → users | User pembuat |
| submitted_at | TIMESTAMP | Waktu submit |
| cancelled_at | TIMESTAMP | Waktu cancel |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update |

#### 4.2.11 payment_allocations

Alokasi pembayaran ke invoice tertentu. Satu payment bisa dialokasikan ke banyak invoice.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| payment_id | UUID, FK → payments | Referensi ke payment |
| invoice_type | ENUM('SalesInvoice','PurchaseInvoice') | Tipe invoice |
| invoice_id | UUID | ID invoice yang dibayar |
| allocated_amount | DECIMAL(15,2) | Jumlah yang dialokasikan ke invoice ini |

#### 4.2.12 fiscal_years

Tahun buku / periode akuntansi.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| name | VARCHAR(50) | Nama tahun buku (misal: '2026') |
| start_date | DATE, NOT NULL | Tanggal mulai |
| end_date | DATE, NOT NULL | Tanggal selesai |
| is_closed | BOOLEAN DEFAULT false | Apakah sudah ditutup |
| closed_at | TIMESTAMP | Waktu tutup buku |
| closed_by | UUID, FK → users | User yang menutup buku |

#### 4.2.13 users

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| username | VARCHAR(50), UNIQUE | Username untuk login |
| full_name | VARCHAR(255) | Nama lengkap |
| email | VARCHAR(255) | Alamat email |
| password_hash | VARCHAR(255) | Password yang di-hash (bcrypt) |
| role | ENUM('Admin','Accountant','Viewer') | Role/hak akses |
| is_active | BOOLEAN DEFAULT true | Apakah user aktif |
| last_login_at | TIMESTAMP | Waktu login terakhir |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update |

#### 4.2.14 audit_trail

Mencatat seluruh perubahan data dalam sistem.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| user_id | UUID, FK → users | User yang melakukan aksi |
| action | VARCHAR(20) | CREATE, UPDATE, DELETE, SUBMIT, CANCEL, LOGIN, LOGOUT |
| entity_type | VARCHAR(50) | Nama tabel/entitas yang diubah |
| entity_id | UUID | ID record yang diubah |
| old_values | JSONB | Nilai sebelum perubahan |
| new_values | JSONB | Nilai setelah perubahan |
| ip_address | VARCHAR(45) | IP address user |
| user_agent | TEXT | Browser/device info |
| created_at | TIMESTAMP | Waktu kejadian |

#### 4.2.15 company_settings

Pengaturan perusahaan (single row).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID, PK | Primary key |
| company_name | VARCHAR(255) | Nama perusahaan |
| address | TEXT | Alamat lengkap |
| phone | VARCHAR(20) | Nomor telepon |
| email | VARCHAR(255) | Email perusahaan |
| tax_id | VARCHAR(30) | NPWP |
| logo_url | VARCHAR(500) | Path ke file logo |
| default_currency | VARCHAR(3) DEFAULT 'IDR' | Mata uang default |
| fiscal_year_start_month | INTEGER DEFAULT 1 | Bulan awal tahun buku (1 = Januari) |

---

## 5. Chart of Accounts (Bagan Akun)

### 5.1 Prinsip Dinamis

Chart of Accounts bersifat DINAMIS — pengguna dapat:

- **Menambah akun baru** kapan saja (baik akun grup maupun akun ledger)
- **Mengedit akun** (mengubah nama, nomor akun, deskripsi)
- **Menonaktifkan akun** yang sudah tidak digunakan (soft delete via is_active = false)
- **Memindahkan akun** ke parent yang berbeda (reorganisasi struktur tree)

Aturan yang berlaku:
- Akun yang sudah memiliki transaksi (ledger entry) TIDAK BISA dihapus permanen, hanya bisa dinonaktifkan
- Akun yang dinonaktifkan tidak muncul di dropdown pemilihan akun, tapi tetap muncul di laporan historis
- Akun grup tidak bisa digunakan dalam transaksi (hanya akun ledger yang bisa)
- Nomor akun harus unik di seluruh CoA
- Tipe akun (Asset/Liability/Equity/Revenue/Expense) mengikuti root parent dan tidak bisa diubah setelah dibuat

### 5.2 Template Default (Auto-Seed)

Template berikut otomatis dibuat saat setup awal. Pengguna BEBAS memodifikasi, menambah, atau menonaktifkan akun-akun ini sesuai kebutuhan.

```
1. Aset (Asset) [GROUP]
├── 1.1 Aset Lancar [GROUP]
│   ├── 1.1.1 Kas [LEDGER]
│   ├── 1.1.2 Bank [LEDGER]
│   ├── 1.1.3 Piutang Usaha [LEDGER]
│   ├── 1.1.4 Persediaan — Gabah [LEDGER]
│   ├── 1.1.5 Persediaan — Beras [LEDGER]
│   ├── 1.1.6 Persediaan — Sekam [LEDGER]
│   ├── 1.1.7 Persediaan — Bekatul [LEDGER]
│   └── 1.1.8 Biaya Dibayar Dimuka [LEDGER]
├── 1.2 Aset Tetap [GROUP]
│   ├── 1.2.1 Tanah [LEDGER]
│   ├── 1.2.2 Bangunan [LEDGER]
│   ├── 1.2.3 Mesin Penggilingan [LEDGER]
│   ├── 1.2.4 Kendaraan [LEDGER]
│   ├── 1.2.5 Peralatan Kantor [LEDGER]
│   └── 1.2.6 Akumulasi Penyusutan [LEDGER]

2. Liabilitas (Liability) [GROUP]
├── 2.1 Liabilitas Jangka Pendek [GROUP]
│   ├── 2.1.1 Hutang Usaha [LEDGER]
│   ├── 2.1.2 Hutang Gaji [LEDGER]
│   ├── 2.1.3 Hutang Pajak [LEDGER]
│   └── 2.1.4 Pendapatan Diterima Dimuka [LEDGER]
├── 2.2 Liabilitas Jangka Panjang [GROUP]
│   └── 2.2.1 Hutang Bank [LEDGER]

3. Ekuitas (Equity) [GROUP]
├── 3.1 Modal Disetor [LEDGER]
├── 3.2 Laba Ditahan [LEDGER]
└── 3.3 Laba Periode Berjalan [LEDGER]

4. Pendapatan (Revenue) [GROUP]
├── 4.1 Penjualan Beras [LEDGER]
├── 4.2 Penjualan Sekam [LEDGER]
├── 4.3 Penjualan Bekatul [LEDGER]
├── 4.4 Pendapatan Jasa Giling [LEDGER]
└── 4.5 Pendapatan Lain-lain [LEDGER]

5. Beban (Expense) [GROUP]
├── 5.1 Harga Pokok Penjualan [GROUP]
│   ├── 5.1.1 Pembelian Gabah [LEDGER]
│   ├── 5.1.2 Biaya Tenaga Kerja Produksi [LEDGER]
│   ├── 5.1.3 Biaya Listrik Pabrik [LEDGER]
│   └── 5.1.4 Biaya Overhead Pabrik [LEDGER]
├── 5.2 Beban Operasional [GROUP]
│   ├── 5.2.1 Gaji & Tunjangan [LEDGER]
│   ├── 5.2.2 Listrik & Air Kantor [LEDGER]
│   ├── 5.2.3 Transportasi [LEDGER]
│   ├── 5.2.4 Pemeliharaan & Perbaikan [LEDGER]
│   └── 5.2.5 Perlengkapan Kantor [LEDGER]
├── 5.3 Beban Administrasi & Umum [GROUP]
│   ├── 5.3.1 Beban Penyusutan [LEDGER]
│   ├── 5.3.2 Beban Asuransi [LEDGER]
│   └── 5.3.3 Beban Lain-lain [LEDGER]
```

### 5.3 Operasi CRUD pada Chart of Accounts

#### Tambah Akun Baru
- User memilih parent akun (grup) di tree view
- Input: nama akun, nomor akun, tipe (grup/ledger), deskripsi
- Validasi: nomor akun harus unik, parent harus adalah akun grup
- Tipe akun (Asset/Liability/dll) otomatis mengikuti root parent

#### Edit Akun
- Yang bisa diedit: nama, nomor akun, deskripsi, parent (pindah posisi di tree)
- Yang TIDAK bisa diedit: tipe akun (Asset/Liability/dll), is_group (setelah ada child atau transaksi)

#### Nonaktifkan Akun
- Set is_active = false
- Akun tidak muncul di dropdown untuk transaksi baru
- Akun tetap muncul di laporan historis
- Validasi: akun grup tidak bisa dinonaktifkan jika masih punya child aktif

#### Hapus Akun
- Hanya bisa jika: belum ada transaksi DAN belum ada child akun
- Jika sudah ada transaksi: hanya bisa dinonaktifkan (soft delete)

---

## 6. Modul & Fitur Detail

### 6.1 Modul Dashboard

Dashboard menampilkan ringkasan kondisi keuangan perusahaan secara real-time.

Komponen:
- Kartu KPI: Saldo Kas & Bank, Total Piutang, Total Hutang, Laba/Rugi Bulan Ini
- Grafik Arus Kas: line chart kas masuk vs kas keluar per bulan (6 bulan terakhir)
- Grafik Pendapatan vs Beban: bar chart perbandingan bulanan
- Daftar Piutang Jatuh Tempo: tabel 10 piutang terdekat yang akan/sudah jatuh tempo
- Daftar Hutang Jatuh Tempo: tabel 10 hutang terdekat yang akan/sudah jatuh tempo
- Aktivitas Terakhir: log 10 transaksi terbaru

### 6.2 Modul Bagan Akun (Chart of Accounts)

Fitur:
- Tampilan tree view interaktif dengan expand/collapse
- CRUD akun: tambah akun baru (grup atau ledger), edit, nonaktifkan (lihat Section 5.3)
- Validasi: tidak bisa menghapus akun yang sudah memiliki transaksi
- Filter berdasarkan tipe akun (Asset, Liability, Equity, Revenue, Expense)
- Filter: tampilkan semua / hanya aktif / hanya nonaktif
- Pencarian akun berdasarkan nama atau nomor
- Template default CoA Indonesia untuk penggilingan beras (auto-seed saat setup)
- Drag-and-drop untuk reorganisasi posisi akun dalam tree (opsional, Phase 4)

### 6.3 Modul Jurnal Umum (Journal Entry)

Fitur:
- Form input jurnal dengan baris debit/credit yang bisa ditambah secara dinamis
- Auto-complete akun saat mengetik nama atau nomor akun (hanya akun ledger aktif)
- Validasi real-time: total debit harus sama dengan total credit
- Dropdown pemilihan pihak (party) untuk akun piutang/hutang
- Nomor jurnal auto-generated dengan format JE-{YYYY}-{NNN}
- Lifecycle: Draft → Submit → Cancel (dengan entry pembalik otomatis)
- List view dengan filter berdasarkan tanggal, status, dan akun
- Detail view menampilkan ledger entries yang dihasilkan

Aturan Bisnis:
1. Jurnal dalam status Draft bisa diedit dan dihapus
2. Jurnal yang sudah Submit tidak bisa diedit, hanya bisa di-Cancel
3. Cancel menghasilkan entry pembalik (reversal) otomatis, bukan penghapusan
4. Tidak bisa Submit jurnal pada fiscal year yang sudah ditutup

### 6.4 Modul Penjualan (Sales)

#### 6.4.1 Faktur Penjualan (Sales Invoice)
- Form input: pilih customer, tanggal, jatuh tempo, item-item penjualan
- Item penjualan: nama barang, kuantitas, satuan (kg/karung), harga satuan, subtotal
- Kalkulasi otomatis: subtotal per item, grand total
- Nomor faktur auto-generated: SI-{YYYY}-{NNN}
- Lifecycle: Draft → Submit (otomatis buat ledger entry & update piutang) → Paid/Cancel
- Cetak/export faktur ke PDF dengan template profesional
- Status tracking: Draft, Submitted, Partially Paid, Paid, Overdue, Cancelled
- Overdue otomatis ditandai oleh sistem saat melewati due_date

#### 6.4.2 Penerimaan Pembayaran (Receive Payment)
- Form input: pilih customer, akun bank/kas, jumlah pembayaran
- Alokasi pembayaran ke satu atau lebih faktur yang outstanding
- Pembayaran parsial didukung (faktur berubah status ke Partially Paid)
- Otomatis update saldo piutang customer dan saldo akun bank/kas
- Nomor pembayaran auto-generated: PAY-{YYYY}-{NNN}

Ledger entry yang dihasilkan saat Submit Sales Invoice:
- Debit: Piutang Usaha (sebesar grand_total)
- Credit: Akun Pendapatan per item (sesuai account_id di item)

Ledger entry yang dihasilkan saat Submit Receive Payment:
- Debit: Bank / Kas (sebesar amount)
- Credit: Piutang Usaha (sebesar amount)

### 6.5 Modul Pembelian (Purchases)

#### 6.5.1 Faktur Pembelian (Purchase Invoice)
- Form input: pilih supplier, tanggal, jatuh tempo, item-item pembelian
- Item: nama barang (gabah, spare part, dll), kuantitas, satuan, harga satuan
- Nomor faktur auto-generated: PI-{YYYY}-{NNN}
- Lifecycle serupa dengan Sales Invoice
- Otomatis update saldo hutang supplier

#### 6.5.2 Pembayaran Keluar (Make Payment)
- Form input: pilih supplier, akun bank/kas, jumlah pembayaran
- Alokasi pembayaran ke faktur pembelian yang outstanding
- Pembayaran parsial didukung

Ledger entry saat Submit Purchase Invoice:
- Debit: Akun Beban per item (sesuai account_id di item)
- Credit: Hutang Usaha (sebesar grand_total)

Ledger entry saat Submit Make Payment:
- Debit: Hutang Usaha (sebesar amount)
- Credit: Bank / Kas (sebesar amount)

### 6.6 Modul Pihak (Parties)

- Master data Customer dan Supplier
- Form input: nama, tipe (Customer/Supplier/Both), telepon, email, alamat, NPWP
- Detail view menampilkan: riwayat transaksi, saldo outstanding, aging analysis
- List view dengan filter berdasarkan tipe, status (aktif/nonaktif), dan pencarian nama

### 6.7 Modul Laporan Keuangan

Semua laporan dapat di-filter berdasarkan periode (tanggal mulai — tanggal akhir) dan dapat di-export ke PDF dan Excel.

#### 6.7.1 Buku Besar (General Ledger)
Menampilkan seluruh entry akuntansi per akun. Filter: akun, tanggal, pihak, reference type. Menampilkan saldo berjalan (running balance) per baris.

#### 6.7.2 Neraca Saldo (Trial Balance)
Saldo debit dan kredit seluruh akun pada periode tertentu. Verifikasi total debit = total kredit.

#### 6.7.3 Laporan Laba Rugi (Profit & Loss Statement)
Seluruh pendapatan dikurangi beban = laba/rugi bersih. Disusun berdasarkan hierarki CoA.

#### 6.7.4 Neraca (Balance Sheet)
Posisi keuangan: Aset = Liabilitas + Ekuitas pada tanggal tertentu.

#### 6.7.5 Laporan Arus Kas (Cash Flow Statement)
Pergerakan kas masuk/keluar: aktivitas operasi, investasi, pendanaan.

#### 6.7.6 Laporan Piutang (Accounts Receivable)
Piutang outstanding per customer dengan aging analysis (belum jatuh tempo, 1-30 hari, 31-60 hari, 61-90 hari, >90 hari).

#### 6.7.7 Laporan Hutang (Accounts Payable)
Hutang outstanding per supplier dengan aging analysis serupa.

### 6.8 Modul Pengaturan (Settings)

- Profil Perusahaan: nama, alamat, logo, NPWP, nomor telepon
- Tahun Buku (Fiscal Year): buat, tutup buku, buka kembali (dengan otorisasi Admin)
- Manajemen User: CRUD user, assign role (Admin, Accountant, Viewer)
- Konfigurasi Penomoran: format nomor otomatis untuk jurnal, invoice, payment
- Backup & Restore: trigger backup manual, download backup file

---

## 7. Document Lifecycle & Aturan Bisnis

### 7.1 Status Dokumen

Seluruh dokumen transaksi (Journal Entry, Sales Invoice, Purchase Invoice, Payment) mengikuti lifecycle yang konsisten:

| Status | Keterangan | Aksi yang Diizinkan |
|--------|-----------|---------------------|
| Draft | Baru dibuat, belum mempengaruhi laporan keuangan | Edit, Delete, Submit |
| Submitted | Final, ledger entry sudah dibuat | Cancel (buat reversal) |
| Paid | Invoice yang sudah lunas | Cancel (buat reversal) |
| Partially Paid | Invoice yang sudah dibayar sebagian | Cancel, Receive/Make Payment |
| Overdue | Invoice submitted yang melewati jatuh tempo | Cancel, Receive/Make Payment |
| Cancelled | Dibatalkan, entry pembalik sudah dibuat | Tidak ada (read-only) |

### 7.2 Prinsip Immutable Ledger

1. Setelah dokumen di-Submit, ledger entry yang dihasilkan TIDAK DAPAT diubah atau dihapus
2. Pembatalan (Cancel) dilakukan dengan membuat entry pembalik (reversal entry) yang membalikkan seluruh debit/kredit dari entry asli
3. Entry asli ditandai is_cancelled = true, tetapi TETAP TERSIMPAN dalam database
4. Prinsip ini memastikan integritas data dan memudahkan audit

### 7.3 Validasi Double-Entry

Mesin validasi double-entry adalah komponen inti:
- Setiap transaksi yang di-Submit HARUS memiliki total debit = total kredit
- Tidak boleh ada entry dengan debit = 0 DAN credit = 0 (entry kosong)
- Setiap entry harus mereferensikan akun ledger yang valid dan aktif (bukan akun grup)
- Validasi dilakukan di level backend (server-side), bukan hanya di frontend
- Jika validasi gagal, seluruh transaksi di-rollback (database transaction)

---

## 8. Keamanan & Otorisasi

### 8.1 Autentikasi

- Login menggunakan username + password
- Password di-hash menggunakan bcrypt (salt rounds: 12)
- JWT-based session: Access Token (masa berlaku 15 menit) + Refresh Token (7 hari)
- Refresh token disimpan dalam HTTP-only secure cookie
- Auto-logout setelah refresh token expired

### 8.2 Role-Based Access Control (RBAC)

| Role | Hak Akses | Contoh User |
|------|-----------|-------------|
| Admin | Full access: semua modul, settings, user management, tutup buku | Logia (Owner) |
| Accountant | CRUD transaksi, view & export laporan, kelola party | Staff Accounting |
| Viewer | Read-only: lihat dashboard & laporan, tidak bisa input data | Manajemen/Auditor |

### 8.3 Keamanan Data

- HTTPS enforced melalui Cloudflare Tunnel (SSL/TLS otomatis)
- SQL injection prevention melalui parameterized queries (Prisma ORM)
- XSS prevention melalui React built-in escaping + helmet.js
- CORS dikonfigurasi hanya untuk domain yang diizinkan
- Rate limiting pada endpoint login untuk mencegah brute force
- Audit trail mencatat seluruh aksi user beserta IP address

---

## 9. User Interface & User Experience

### 9.1 Prinsip Desain

- Clean & minimal — terinspirasi dari Frappe Books, menghindari clutter
- Mobile-responsive — layout menyesuaikan dari desktop hingga smartphone
- Bahasa Indonesia — seluruh label, placeholder, pesan error dalam Bahasa Indonesia
- Konsisten — pola interaksi yang sama di seluruh modul (list view, form view, detail view)
- Feedback cepat — loading states, success/error notifications, validasi real-time

### 9.2 Layout Utama

- Sidebar kiri (collapsible di mobile): navigasi utama ke semua modul
- Header: judul halaman, breadcrumb, user info & logout
- Main content: area utama untuk list view, form, atau report
- Di mobile: sidebar berubah menjadi hamburger menu

### 9.3 Struktur Navigasi

| Menu | Sub-menu | Deskripsi |
|------|----------|-----------|
| Dasbor | - | Halaman utama dengan ringkasan KPI & grafik |
| Jurnal | Daftar Jurnal, Buat Jurnal Baru | Input & kelola jurnal umum |
| Penjualan | Faktur Penjualan, Penerimaan | Kelola invoice & pembayaran masuk |
| Pembelian | Faktur Pembelian, Pembayaran | Kelola invoice & pembayaran keluar |
| Pihak | Pelanggan, Pemasok | Master data customer & supplier |
| Laporan | 7 jenis laporan | Seluruh laporan keuangan |
| Bagan Akun | - | Chart of Accounts (tree view) |
| Pengaturan | Perusahaan, Tahun Buku, User | Konfigurasi sistem |

### 9.4 Pola Interaksi

#### List View
- Tabel data dengan kolom yang bisa di-sort
- Search bar untuk pencarian teks
- Filter dropdown (status, tanggal, tipe)
- Pagination (25 item per halaman)
- Tombol aksi: Buat Baru, Export

#### Form View
- Layout dua kolom di desktop, satu kolom di mobile
- Validasi real-time dengan pesan error inline
- Auto-complete untuk field referensi (akun, pihak)
- Tombol aksi kontekstual: Simpan Draft, Submit, Batal
- Konfirmasi dialog untuk aksi destruktif (Cancel, Delete)

#### Detail View
- Seluruh informasi dokumen dalam format read-only
- Status badge yang jelas (warna-coded)
- Timeline aktivitas (audit trail) di bagian bawah
- Tombol aksi sesuai status (Print, Cancel, dll)

---

## 10. Template PDF

Aplikasi menghasilkan dokumen PDF menggunakan @react-pdf/renderer.

### 10.1 Faktur Penjualan (Sales Invoice PDF)
- Header: logo perusahaan, nama, alamat, telepon, NPWP
- Info faktur: nomor faktur, tanggal, jatuh tempo
- Info pelanggan: nama, alamat, telepon
- Tabel item: no, nama barang, kuantitas, satuan, harga satuan, subtotal
- Footer: grand total, terbilang (angka dalam kata Bahasa Indonesia), catatan, tanda tangan

### 10.2 Laporan Keuangan (Financial Reports PDF)
- Header: nama perusahaan, judul laporan, periode
- Tabel data sesuai jenis laporan
- Footer: tanggal cetak, halaman, disclaimer

---

## 11. Roadmap Pengembangan

### Phase 1 — Foundation (Bulan 1-2)

Target: Sistem bisa digunakan untuk mencatat transaksi harian melalui jurnal umum.

| Fitur | Prioritas | Estimasi |
|-------|-----------|----------|
| Setup project (monorepo, Prisma, PostgreSQL) | Tinggi | 3 hari |
| Autentikasi (login, JWT, RBAC) | Tinggi | 3 hari |
| Chart of Accounts (CRUD, tree view, template CoA, dinamis) | Tinggi | 5 hari |
| Journal Entry (CRUD, submit, cancel) | Tinggi | 5 hari |
| Double-entry validation engine | Tinggi | 3 hari |
| General Ledger report | Tinggi | 3 hari |
| Dashboard sederhana (saldo kas, ringkasan) | Sedang | 3 hari |
| Audit trail middleware | Tinggi | 2 hari |
| Deploy ke Raspberry Pi 5 + Cloudflare Tunnel | Tinggi | 2 hari |

### Phase 2 — Transaksi Bisnis (Bulan 3-4)

Target: Sistem bisa mengelola invoice penjualan/pembelian dan pembayaran.

| Fitur | Prioritas | Estimasi |
|-------|-----------|----------|
| Party management (CRUD customer & supplier) | Tinggi | 3 hari |
| Sales Invoice (CRUD, submit, PDF generation) | Tinggi | 7 hari |
| Purchase Invoice (CRUD, submit) | Tinggi | 5 hari |
| Payment — Receive (terima pembayaran, alokasi ke invoice) | Tinggi | 5 hari |
| Payment — Pay (bayar supplier, alokasi ke invoice) | Tinggi | 4 hari |
| Accounts Receivable report (aging analysis) | Sedang | 3 hari |
| Accounts Payable report (aging analysis) | Sedang | 3 hari |

### Phase 3 — Laporan Keuangan (Bulan 5-6)

Target: Seluruh laporan keuangan standar tersedia dan bisa di-export.

| Fitur | Prioritas | Estimasi |
|-------|-----------|----------|
| Trial Balance | Tinggi | 3 hari |
| Profit & Loss Statement | Tinggi | 4 hari |
| Balance Sheet | Tinggi | 4 hari |
| Cash Flow Statement | Sedang | 5 hari |
| Fiscal Year management (tutup buku) | Tinggi | 3 hari |
| Export laporan ke PDF | Tinggi | 4 hari |
| Export laporan ke Excel | Sedang | 3 hari |
| Dashboard lengkap (grafik, KPI) | Sedang | 4 hari |

### Phase 4 — Advanced Features (Bulan 7+)

Target: Fitur tambahan untuk meningkatkan efisiensi dan compliance.

| Fitur | Prioritas | Estimasi |
|-------|-----------|----------|
| Bank Reconciliation | Sedang | 5 hari |
| Recurring Journal Entries (auto-posting bulanan) | Rendah | 3 hari |
| Budget management & variance analysis | Rendah | 5 hari |
| Integrasi pajak (e-Faktur, PPh) | Sedang | 10+ hari |
| API endpoint untuk integrasi eksternal | Rendah | 5 hari |
| Data import dari Excel/CSV | Sedang | 3 hari |
| Backup otomatis terjadwal | Sedang | 2 hari |
| Drag-and-drop reorganisasi CoA | Rendah | 3 hari |

---

## 12. Struktur Project

### 12.1 Folder Structure

```
pmd-finance/
├── packages/
│   ├── server/                    # Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/          # Authentication & authorization
│   │   │   │   ├── accounts/      # Chart of Accounts (CRUD dinamis)
│   │   │   │   ├── ledger/        # Core double-entry engine
│   │   │   │   ├── journal/       # Journal entries
│   │   │   │   ├── invoices/      # Sales & Purchase invoices
│   │   │   │   ├── payments/      # Payment processing
│   │   │   │   ├── parties/       # Customers & Suppliers
│   │   │   │   ├── reports/       # Financial reports
│   │   │   │   └── settings/      # App configuration
│   │   │   ├── core/
│   │   │   │   ├── database.ts    # DB connection & pooling
│   │   │   │   ├── audit.ts       # Audit trail middleware
│   │   │   │   └── validation.ts  # Double-entry validation
│   │   │   └── app.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Database schema
│   │   │   ├── seed.ts            # CoA template seed
│   │   │   └── migrations/        # Database migrations
│   │   └── package.json
│   ├── client/                    # Frontend
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/          # API calls
│   │   │   └── utils/
│   │   └── package.json
│   └── shared/                    # Shared types & constants
│       ├── types/
│       └── constants/
├── docker-compose.yml             # PostgreSQL (development)
├── ecosystem.config.js            # PM2 config (production)
└── README.md
```

### 12.2 Naming Conventions

| Entity | Format | Contoh |
|--------|--------|--------|
| Journal Entry | JE-{YYYY}-{NNN} | JE-2026-001 |
| Sales Invoice | SI-{YYYY}-{NNN} | SI-2026-042 |
| Purchase Invoice | PI-{YYYY}-{NNN} | PI-2026-015 |
| Payment | PAY-{YYYY}-{NNN} | PAY-2026-008 |

---

## 13. Backup & Disaster Recovery

### 13.1 Strategi Backup

| Tipe | Frekuensi | Retensi | Metode |
|------|-----------|---------|--------|
| Daily Backup | Setiap hari pukul 02:00 WIB | 7 backup terakhir | cron + pg_dump |
| Weekly Backup | Setiap Minggu pukul 03:00 WIB | 4 backup terakhir | cron + pg_dump |
| Monthly Backup | Tanggal 1 setiap bulan | 12 backup terakhir | cron + pg_dump |
| Manual Backup | On-demand via Settings | Tidak terbatas | Tombol di UI |

### 13.2 Lokasi Penyimpanan

- Primary: NVMe SSD pada Raspberry Pi 5 (direktori /backups)
- Secondary: External USB drive atau cloud sync (opsional, fase lanjut)

### 13.3 Prosedur Recovery

1. Identifikasi backup file yang akan di-restore (berdasarkan tanggal)
2. Stop aplikasi PMD Finance (pm2 stop pmd-finance)
3. Restore database dari backup (pg_restore)
4. Start ulang aplikasi (pm2 start pmd-finance)
5. Verifikasi data melalui Trial Balance

---

## 14. Constraint & Batasan

### 14.1 Batasan Scope

- Aplikasi ini BUKAN ERP — tidak mengelola inventory, produksi, atau HR
- Tidak ada integrasi dengan sistem MES yang sedang dikembangkan
- Single company only (PT Pangan Masa Depan), tidak multi-tenant
- Bahasa interface hanya Bahasa Indonesia
- Mata uang hanya IDR (Rupiah), tidak ada dukungan multi-currency
- Integrasi perpajakan (e-Faktur, PPh) ditunda ke Phase 4

### 14.2 Batasan Teknis

- Raspberry Pi 5 memiliki resource terbatas (meskipun 8GB RAM cukup untuk use case ini)
- Bergantung pada koneksi internet untuk akses remote (melalui Cloudflare Tunnel)
- Akses LAN tetap berfungsi meskipun internet mati
- PostgreSQL pada Pi 5 memiliki throughput yang lebih rendah dibanding server dedicated
- Concurrent user yang disarankan: maksimal 3-5 user bersamaan

### 14.3 Asumsi

- Staff accounting sudah memiliki pemahaman dasar akuntansi (double-entry, debit/kredit)
- Raspberry Pi 5 sudah di-setup dengan OS dan NVMe SSD
- Cloudflare Tunnel sudah dikonfigurasi dan domain sudah tersedia
- Volume transaksi: < 100 transaksi per hari

---

## 15. Risiko & Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|--------|--------|-------------|----------|
| Kehilangan data (hardware failure Pi 5) | Tinggi | Rendah | Automated daily backup + backup ke external storage |
| Staff tidak bisa menggunakan sistem | Sedang | Sedang | UI yang intuitif + dokumentasi user guide + training |
| Performance lambat di Pi 5 | Sedang | Rendah | Database indexing, pagination, query optimization |
| Internet mati (akses remote putus) | Rendah | Sedang | Akses LAN tetap berfungsi sebagai fallback |
| Bug pada kalkulasi keuangan | Tinggi | Rendah | Unit test untuk setiap business rule + Trial Balance check |
| Scope creep (permintaan fitur terus bertambah) | Sedang | Tinggi | Patuhi roadmap phase, fitur baru masuk backlog Phase 4+ |

---

## 16. Kriteria Penerimaan (Acceptance Criteria)

### 16.1 Phase 1 — Foundation

1. User dapat login dan logout dengan aman
2. Chart of Accounts dapat ditampilkan dalam tree view, di-CRUD secara dinamis (tambah, edit, nonaktifkan)
3. Journal Entry dapat dibuat, di-submit, dan di-cancel
4. Double-entry validation mencegah jurnal yang tidak balance
5. General Ledger report menampilkan data yang akurat
6. Aplikasi dapat diakses via browser dari komputer lain di jaringan LAN
7. Audit trail mencatat seluruh aksi user

### 16.2 Phase 2 — Transaksi Bisnis

1. Sales Invoice dapat dibuat, di-submit, dan menghasilkan ledger entry yang benar
2. Purchase Invoice dapat dibuat dan di-submit
3. Payment dapat diterima/dibayar dan dialokasikan ke invoice
4. Saldo outstanding pada invoice terupdate otomatis setelah pembayaran
5. Sales Invoice dapat dicetak sebagai PDF yang profesional
6. Laporan piutang dan hutang menampilkan aging analysis yang akurat

### 16.3 Phase 3 — Laporan Keuangan

1. Trial Balance menampilkan total debit = total kredit
2. Profit & Loss dan Balance Sheet menghasilkan angka yang konsisten dan akurat
3. Semua laporan dapat di-export ke PDF dan Excel
4. Tutup buku berfungsi dan mencegah transaksi baru pada periode yang sudah ditutup

---

## 17. Glosarium

| Istilah | Definisi |
|---------|----------|
| Double-Entry Bookkeeping | Sistem pencatatan di mana setiap transaksi dicatat di minimal 2 akun (debit dan kredit) yang harus seimbang |
| Chart of Accounts (CoA) | Daftar terstruktur seluruh akun keuangan perusahaan, disusun secara hierarkis (tree). Bersifat DINAMIS — bisa ditambah/diubah/dinonaktifkan |
| General Ledger | Buku besar yang mencatat seluruh transaksi keuangan per akun |
| Journal Entry | Pencatatan transaksi keuangan dalam jurnal umum dengan minimal satu baris debit dan satu baris kredit |
| Ledger Entry | Satu baris pencatatan dalam buku besar, berisi debit atau kredit untuk satu akun |
| Trial Balance | Laporan yang menampilkan saldo seluruh akun untuk memverifikasi keseimbangan debit dan kredit |
| Fiscal Year | Tahun buku / periode akuntansi (biasanya Januari — Desember) |
| PSAK | Pernyataan Standar Akuntansi Keuangan — standar akuntansi Indonesia |
| Immutable Ledger | Prinsip bahwa entry akuntansi yang sudah dicatat tidak dapat diubah atau dihapus |
| Reversal Entry | Entry pembalik yang membatalkan entry sebelumnya dengan membalikkan debit/kredit |
| Aging Analysis | Analisis umur piutang/hutang berdasarkan berapa lama sudah outstanding |
| CGNAT | Carrier-Grade NAT — teknik ISP Indonesia yang menghalangi port forwarding langsung |
| Cloudflare Tunnel | Layanan untuk mengekspos server lokal ke internet tanpa port forwarding |
| Soft Delete | Menonaktifkan record (is_active = false) tanpa menghapus dari database |
| Seed Data | Data awal yang otomatis dimasukkan ke database saat setup (contoh: template CoA) |

---

*— Akhir Dokumen —*
*PRD PMD Finance v1.0 (Final) | 14 Maret 2026 | PT Pangan Masa Depan*
