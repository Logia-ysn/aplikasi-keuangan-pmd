# Keuangan ERP

Aplikasi ERP keuangan berbasis web untuk pengelolaan keuangan perusahaan. Fullstack TypeScript, deploy via Docker.

## Fitur

| Modul | Deskripsi |
|---|---|
| Dashboard | KPI real-time, 8 widget yang bisa di-toggle, grafik pendapatan vs beban |
| Bagan Akun | Hierarki COA parent-child, import CSV/Excel |
| Buku Besar | Jurnal double-entry, filter tanggal, import CSV |
| Penjualan | Invoice pelanggan, auto-posting GL, PPN, diskon, cancel |
| Pembelian | Invoice pemasok, auto-posting GL, cancel |
| Bank & Kas | Penerimaan/pengeluaran, auto-alokasi invoice, cancel |
| Rekonsiliasi Bank | Cocokkan mutasi bank dengan transaksi buku |
| Pelanggan & Vendor | Manajemen mitra, saldo terutang, import CSV |
| Stok & Gudang | Item inventori, mutasi stok, produksi dengan rendemen |
| Laporan | Trial Balance, Laba Rugi, Neraca, Arus Kas, Aging, Pajak |
| Drill-down | Klik angka di laporan untuk lihat detail transaksi |
| Transaksi Berulang | Template jurnal otomatis (harian/mingguan/bulanan) |
| Notifikasi | Alert invoice overdue, stok rendah, auto-check |
| Manajemen User | CRUD user, role-based (Admin/Accountant/Viewer) |
| Jejak Audit | Log aktivitas lengkap dengan filter |
| Pajak | Konfigurasi PPN/PPh, laporan pajak bulanan |
| Dark Mode | Toggle light/dark/system |
| Global Search | Ctrl+K command palette, cari apapun |
| Keyboard Shortcuts | Ctrl+K, ?, Escape |
| Onboarding | Setup wizard pertama kali |
| Backup & Restore | Backup/restore database dari UI, upload backup eksternal |
| Akun Sistem | 26 role akun konfigurabel (IFRS/GAAP): pajak, diskon, depresiasi, dll |

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS 4, TanStack Query 5, Recharts
- **Backend**: Node.js 20, Express 5, TypeScript, Prisma 7
- **Database**: PostgreSQL 16
- **Auth**: JWT + bcrypt, role-based (Admin, Accountant, Viewer)
- **Deploy**: Docker Compose (2 container: app + db)

---

## Quick Start (Docker)

### Prasyarat

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) atau Docker Engine + Compose
- Git

### 1. Clone repository

```bash
git clone https://github.com/Logia-ysn/aplikasi-keuangan-pmd.git
cd aplikasi-keuangan-pmd
```

### 2. Buat file .env

```bash
cp .env.docker.example .env
```

Edit `.env` — **WAJIB ganti `JWT_SECRET`**:

```env
# Database
POSTGRES_USER=keuangan
POSTGRES_PASSWORD=keuangan_secret_2026
POSTGRES_DB=keuangan_db

# Port aplikasi
PORT=3001

# JWT Secret — WAJIB diganti! Generate: openssl rand -hex 48
JWT_SECRET=paste-hasil-generate-disini

# CORS (tambahkan domain jika pakai reverse proxy)
ALLOWED_ORIGINS=http://localhost:3001
```

Generate JWT secret:

```bash
openssl rand -hex 48
```

### 3. Build & jalankan

```bash
docker compose up -d --build
```

Tunggu ~30 detik. Cek log untuk memastikan startup sukses:

```bash
docker compose logs -f app
```

Output yang diharapkan:

```
[APP] Database connected.
[APP] Migrations complete.
[APP] Database kosong, menjalankan seed data awal...
[APP] Seed selesai — login: admin@keuangan.local / Admin123!
[APP] Starting Keuangan ERP on port 3001...
Server running at http://localhost:3001
```

### 4. Buka aplikasi

```
http://localhost:3001
```

Login default:

| Email | Password | Role |
|---|---|---|
| `admin@keuangan.local` | `Admin123!` | Admin (full access) |
| `staff@keuangan.local` | `Admin123!` | Accountant |
| `viewer@keuangan.local` | `Admin123!` | Viewer (read-only) |

> **Ganti password default segera setelah login pertama!**
> Bisa via menu user di header → "Ganti Password", atau via Onboarding Wizard.

---

## Perintah Docker

### Operasional harian

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# Lihat log
docker compose logs -f app
docker compose logs -f db

# Status container
docker compose ps
```

### Update aplikasi

```bash
git pull
docker compose up -d --build
```

Data aman — tersimpan di Docker volume `pgdata`, tidak terhapus saat rebuild.

### Backup database

```bash
# Via command line
docker compose exec db pg_dump -U keuangan keuangan_db > backup-$(date +%Y%m%d).sql

# Atau via UI: Pengaturan → tab Backup → "Buat Backup Sekarang"
```

### Restore database

```bash
# Via command line
docker compose exec -T db psql -U keuangan keuangan_db < backup-20260323.sql

# Atau via UI: Pengaturan → tab Backup → pilih file → Restore
```

### Reset total (HAPUS SEMUA DATA)

```bash
docker compose down -v    # -v menghapus volume = hapus database
docker compose up -d --build   # fresh start + auto-seed
```

---

## Deploy ke Server / Raspberry Pi

### Opsi 1: Docker Compose (Recommended)

```bash
# Di server
git clone https://github.com/Logia-ysn/aplikasi-keuangan-pmd.git
cd aplikasi-keuangan-pmd

# Setup environment
cp .env.docker.example .env
nano .env   # Set JWT_SECRET dan ALLOWED_ORIGINS

# Build & jalankan
docker compose up -d --build
```

### Opsi 2: Dengan Cloudflare Tunnel

```bash
# .env
ALLOWED_ORIGINS=http://localhost:3001,https://keuangan.yourdomain.com

# Jalankan app
docker compose up -d --build

# Setup Cloudflare Tunnel (di terminal terpisah)
cloudflared tunnel --url http://localhost:3001
```

### Opsi 3: Dengan reverse proxy (Nginx)

```nginx
server {
    listen 80;
    server_name keuangan.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Arsitektur Docker

```
docker compose up -d
         │
         ├── db  (postgres:16-alpine)
         │    ├── Port: 5432 (internal)
         │    ├── Volume: pgdata → /var/lib/postgresql/data
         │    └── Healthcheck: pg_isready
         │
         └── app (custom build dari Dockerfile)
              ├── Port: 3001 → host
              ├── Auto-migrate Prisma saat startup
              ├── Auto-seed jika database kosong
              └── Serve: Express API + React SPA
```

### Apa yang terjadi saat `docker compose up --build`:

1. **db** container start, PostgreSQL siap
2. **app** container start, menunggu db healthy
3. `prisma migrate deploy` — jalankan migrasi database
4. Cek jumlah user — jika 0, jalankan seed (COA, user admin, fiscal year)
5. Express server start di port 3001
6. Serve React SPA + API dari satu port

---

## Akun Sistem (System Account Roles)

Akun-akun ini digunakan oleh sistem untuk auto GL posting. Semua bisa dikonfigurasi via **Pengaturan > Akun Sistem**.

| Grup | Role | Default COA | Fungsi |
|---|---|---|---|
| **Kas & Bank** | CASH (multi) | 1.1.1–1.1.5 | Akun kas/bank untuk pembayaran |
| **Piutang & Hutang** | AR, AP | 1.2.1, 2.1.1 | Auto-posting invoice penjualan/pembelian |
| | ALLOWANCE_DOUBTFUL | 1.2.5 | Cadangan kerugian piutang |
| | BAD_DEBT_EXPENSE | 6.27 | Beban piutang tak tertagih |
| **Persediaan & HPP** | INVENTORY, COGS | 1.4.0, 5 | Persediaan & HPP |
| **Pendapatan** | SALES, SERVICE_REVENUE | 4.1, 4.2 | Pendapatan penjualan & jasa |
| | SALES_DISCOUNT, SALES_RETURN | 4.4, 4.3 | Contra revenue |
| **Pajak** | TAX_INPUT, TAX_OUTPUT | 1.5.3, 2.2.1 | PPN Masukan & Keluaran |
| | INCOME_TAX_EXPENSE | 6.17 | Beban PPh Badan |
| **Deposit** | VENDOR_DEPOSIT, CUSTOMER_DEPOSIT | 1.3, 2.1.2 | Uang muka vendor/pelanggan |
| **Aset Tetap** | FIXED_ASSET (multi) | 1.6.1–1.6.5 | Aset tetap per kategori |
| | ACCUM_DEPRECIATION (multi) | 1.7.1–1.7.4 | Akumulasi penyusutan |
| | DEPRECIATION_EXPENSE (multi) | 6.21–6.24 | Beban penyusutan periodik |
| **Bank & Bunga** | BANK_CHARGE, INTEREST_EXPENSE | 8.2, 8.1 | Biaya bank & bunga pinjaman |
| | INTEREST_INCOME | 7.1 | Pendapatan bunga |
| **Selisih Kurs** | FX_GAIN_LOSS, FX_UNREALIZED | 8.4, 8.5 | Laba/rugi kurs |
| **Akrual** | PREPAID_EXPENSE (multi) | 1.5.1–1.5.2 | Biaya dibayar dimuka |
| | ACCRUED_EXPENSE | 2.2.6 | Hutang beban akrual |
| **Lain-lain** | OTHER_INCOME, OTHER_EXPENSE | 7.4, 8.7 | Non-operating income/expense |
| | SHIPPING_EXPENSE | 6.14 | Beban pengiriman |
| | ROUNDING_ACCOUNT | 8.8 | Pembulatan & selisih |
| **Ekuitas** | OPENING_EQUITY, RETAINED_EARNINGS | 3.1, 3.2 | Saldo awal & laba ditahan |
| | CURRENT_PROFIT, OWNER_DRAWING | 3.4, 3.5 | Laba berjalan & prive |

> Mapping akun bisa diubah kapan saja via UI tanpa ubah kode. Mendukung berbagai jenis industri.

---

## Troubleshooting

### App tidak start / crash loop

```bash
docker compose logs app    # lihat error
```

Penyebab umum:
- `JWT_SECRET is still set to the placeholder value` → Edit `.env`, ganti JWT_SECRET
- `Database connection refused` → Pastikan container db running: `docker compose ps`
- Port 3001 sudah dipakai → Ubah `PORT=3002` di `.env`

### Lupa password admin

```bash
# Reset via Docker
docker compose exec app node -e "
  const bcrypt = require('bcrypt');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bcrypt.hash('NewPassword123!', 12).then(hash =>
    prisma.user.update({ where: { email: 'admin@keuangan.local' }, data: { passwordHash: hash } })
  ).then(() => { console.log('Password reset!'); process.exit(0); });
"
```

### Database penuh / lambat

```bash
# Cek ukuran database
docker compose exec db psql -U keuangan -c "SELECT pg_size_pretty(pg_database_size('keuangan_db'));"

# Vacuum (optimasi)
docker compose exec db psql -U keuangan -c "VACUUM ANALYZE;"
```

### Upgrade dari versi lama

```bash
git pull
docker compose up -d --build   # Prisma migrate deploy otomatis
```

Migrasi database dijalankan otomatis saat container start. Data aman.

---

## Development (tanpa Docker)

Untuk kontributor yang ingin develop tanpa Docker:

```bash
# 1. Jalankan PostgreSQL via Docker (database saja)
docker compose up -d db

# 2. Setup server
cd server
cp .env.example .env    # edit DATABASE_URL
npm install
npm run prisma:migrate
npx prisma db seed
npm run dev             # http://localhost:3001

# 3. Setup client (terminal terpisah)
cd client
npm install
npm run dev             # http://localhost:5173
```

---

## Lisensi

MIT
