# PMD Finance — ERP Keuangan Pangan Masa Depan

Aplikasi ERP keuangan berbasis web untuk perusahaan penggilingan padi (rice milling). Dibangun dengan arsitektur monorepo fullstack TypeScript, dirancang untuk deployment di Raspberry Pi 5 via LAN + Cloudflare Tunnel.

## Fitur Utama

| Modul | Deskripsi |
|---|---|
| **Dashboard** | KPI real-time: Kas & Bank, Piutang, Hutang, Laba Bersih MTD + grafik 6 bulan |
| **Bagan Akun (COA)** | Hierarki akun dengan parent-child, nomor akun, type ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE |
| **Buku Besar** | Jurnal umum double-entry, pencarian, filter tanggal |
| **Penjualan** | Invoice pelanggan, auto-posting GL, PPN, diskon per item, potongan & biaya lain |
| **Pembelian** | Invoice pemasok, auto-posting GL, kalkulasi grandTotal lengkap |
| **Stok & Gudang** | Item inventori, mutasi stok, proses produksi (konversi gabah → beras) dengan rendemen % |
| **Bank & Kas** | Penerimaan & pengeluaran, auto-alokasi ke invoice, lacak status pembayaran |
| **Pelanggan & Vendor** | Manajemen mitra bisnis, saldo terutang |
| **Laporan Keuangan** | Trial Balance, Laba Rugi, Neraca, Arus Kas, Aging AR/AP |
| **Tahun Fiskal** | Manajemen tahun buku, tutup buku otomatis (zeroing Revenue/Expense) |
| **Pengaturan** | Data perusahaan, mata uang default |

## Tech Stack

**Frontend**
- React 19 + TypeScript, Vite
- TailwindCSS 4
- TanStack Query 5
- Recharts, Axios, React Router DOM

**Backend**
- Node.js + Express 5, TypeScript
- Prisma 7 ORM (adapter pg)
- PostgreSQL 16
- JWT + bcrypt, role-based auth (Admin, Accountant, Viewer)
- Vitest (39 unit tests)

## Struktur Direktori

```
finance-pmd/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── pages/   # 12 halaman utama + sub-pages laporan
│       ├── components/  # Modal forms
│       ├── lib/     # api.ts, formatters.ts, utils.ts
│       └── layouts/ # MainLayout (sidebar + header)
├── server/          # Express backend
│   └── src/
│       ├── routes/  # auth, coa, journals, sales, purchase,
│       │            # payments, parties, inventory, dashboard,
│       │            # reports, settings, fiscalYears
│       ├── middleware/  # auth, auditTrail, rateLimiter
│       ├── utils/   # schemas, validate, accountBalance,
│       │            # documentNumber, fiscalYear, errors
│       ├── lib/     # prisma.ts, logger.ts
│       └── constants/  # accountNumbers.ts
├── docker-compose.yml  # PostgreSQL 16
└── README.md
```

## Prasyarat

- Node.js 20+
- Docker & Docker Compose
- npm 9+

## Setup & Instalasi

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd finance-pmd

# Install semua dependencies
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 2. Konfigurasi environment

**`server/.env`** (buat dari template):

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pmd_finance"
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=pmd_finance

# Server
PORT=3001
NODE_ENV=development

# Auth — WAJIB diganti di production
JWT_SECRET=ganti-dengan-string-panjang-acak-minimal-32-karakter

# CORS
ALLOWED_ORIGINS="http://localhost:5173"

# Seed (optional — default: admin123)
SEED_ADMIN_PASSWORD=admin123
```

### 3. Jalankan database

```bash
docker compose up -d
```

### 4. Jalankan migrasi & seed

```bash
cd server
npm run prisma:migrate    # jalankan migrasi Prisma
npx prisma db seed        # isi data awal (COA, user admin, fiscal year 2026)
```

### 5. Jalankan aplikasi

**Development (dua terminal):**

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev
```

Buka: [http://localhost:5173](http://localhost:5173)
Login: `admin` / `admin123`

**Production build:**

```bash
cd client && npm run build   # output: client/dist/
cd server && npm run build   # output: server/dist/
cd server && npm start       # serve API + static files
```

## Akun Default

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin (full access) |

> **Ganti password default sebelum go live!**

## Nomor Akun Kunci

Sistem bergantung pada nomor akun berikut di COA:

| Kode | Nama | Fungsi |
|---|---|---|
| `1.1.3` | Piutang Usaha | Auto-debit saat invoice penjualan |
| `2.1.1` | Hutang Usaha | Auto-credit saat invoice pembelian |
| `4.1.1` | Penjualan Beras Premium | Auto-credit saat invoice penjualan |
| `1.1.4` | Persediaan Gabah | Auto-debit saat invoice pembelian |
| `3.2.1` | Laba Ditahan Akumulasi | Target tutup buku |
| `3.3.1` | Laba Tahun Berjalan | Saldo laba periode berjalan |

## Testing

```bash
cd server && npm test        # 39 unit tests
cd server && npm run test:watch  # watch mode
```

## Deployment (Raspberry Pi 5)

1. Copy repo ke Raspberry Pi
2. Install Node.js 20 + Docker
3. Set `NODE_ENV=production` dan `JWT_SECRET` yang kuat di `.env`
4. Set `ALLOWED_ORIGINS` ke domain Cloudflare Tunnel
5. Jalankan `docker compose up -d` untuk database
6. Build dan jalankan dengan `npm start`

## Lisensi

Internal use — PT Pangan Masa Depan.
