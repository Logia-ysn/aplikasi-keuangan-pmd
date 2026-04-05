# Hasil Audit — Aplikasi Keuangan PMD v2.4.0

**Tanggal**: 5 April 2026
**Auditor**: Claude Code (AI-assisted)
**Status**: SELESAI — Semua 5 fase dieksekusi

---

## Skor Keseluruhan

| Fase | Skor | Temuan Critical |
|------|------|-----------------|
| Fase 1: Security | **8/10** | 2 HIGH, 5 MEDIUM, 4 LOW |
| Fase 2: Data Integrity | **5/10** | 10 akun balance mismatch, 71 orphaned movements |
| Fase 3: Code Quality | **6/10** | 437x `any`, 3 test file, 5 file >800 LOC |
| Fase 4: Performance | **7/10** | 1 endpoint tanpa limit, Docker 1.69GB |
| Fase 5: Business Logic | **9/10** | Semua flow PASS, 1 CONCERN |

---

## FASE 1: Security (8/10)

### HIGH

| ID | Temuan | File | Rekomendasi |
|----|--------|------|-------------|
| H-1 | JWT di localStorage (XSS risk) | `client/src/lib/api.ts:20`, `LoginPage.tsx:284` | Hapus localStorage, gunakan HttpOnly cookie saja |
| H-2 | CSP dinonaktifkan | `server/src/index.ts:53` | Aktifkan CSP: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` |

### MEDIUM

| ID | Temuan | File |
|----|--------|------|
| M-1 | CORS izinkan semua IP LAN | `server/src/index.ts:74-82` |
| M-2 | `$executeRawUnsafe` tanpa komentar | `server/src/routes/settings.ts:844` |
| M-3 | Laporan keuangan tanpa role-gate | `server/src/routes/reports.ts` (8 endpoint) |
| M-4 | Password default belum diganti (admin!) | DB: 4 seed user masih `Admin123!` |
| M-5 | Backup upload pakai `originalname` | `server/src/routes/backup.ts:296` |

### LOW

| ID | Temuan |
|----|--------|
| L-1 | Import filter hanya ekstensi, bukan MIME |
| L-2 | Token redundan di response body login |
| L-3 | Content-Disposition tanpa RFC 5987 |
| L-4 | `/settings/runtime` ekspos system info tanpa role-gate |

### Aman (dikonfirmasi)

Password hashing (bcrypt), SQL injection (Prisma ORM), CSRF (double-submit),
Shell injection (spawn bukan exec), File path traversal (UUID names),
Token blacklist, JWT_SECRET (96-char hex), Rate limiting (login + API),
Formula injection di import (sanitized), Backup/User role-gate.

---

## FASE 2: Data Integrity (5/10)

### CRITICAL FINDINGS

#### 2.1 Account Balance vs Ledger — 10 akun MISMATCH

| Akun | Nama | Stored Balance | Selisih dari Ledger |
|------|------|----------------|---------------------|
| 1.4.0 | Persediaan (Umum) | 876M | +811M |
| 1.4.20 | Cruise 25 KG | -56M | -140M |
| 1.4.3 | Gabah KB Basah | 256M | +827M |
| 1.4.43 | HGL 50kg | 1,115M | -671M |
| 1.4.46 | Glosor Kebo | 391M | -861M |
| 1.4.58 | Menir Jitay | 244M | -6.3M |
| 3.1 | Ekuitas Saldo Awal | -28.6B | +96M |
| 4.1 | Penjualan | 5,191M | +5,024M |
| 4.2 | Pendapatan Jasa | -2,512M | -5,024M |
| 5.1 | HPP Beras | 2,099M | +39M |

**Root Cause:**
- **Persediaan (1.4.x):** 71 stock movements dibuat TANPA journal entry (unitCost=0), sehingga balance field di-update tapi tidak ada ledger entry. Ini intentional untuk "stock adjustment tanpa biaya" tapi menyebabkan divergence.
- **Penjualan (4.1) / Pendapatan Jasa (4.2):** Selisih simetris ±5.024M — kemungkinan dari fix GL posting jasa (migrasi data dari 4.1 ke 4.2) yang mengubah balance tapi belum update accounting_ledger_entries.
- **HPP Beras (5.1):** Selisih 39M dari production run edits/reversals.
- **Ekuitas Saldo Awal (3.1):** Net dari semua selisih di atas.

#### 2.2 Trial Balance — TIDAK BALANCE

```
Net balance: Rp 31.29 miliar (seharusnya 0)
Sum debit: Rp 62.49 miliar
Sum credit: Rp 31.20 miliar
```

**Catatan:** Angka ini mencerminkan bahwa balance field menyimpan "net signed balance" yang berbeda konvensi dengan ledger. Selisih riil (setelah koreksi sign) adalah **Rp 96.7 juta**.

#### 2.3 Inventory Integrity

| Check | Hasil |
|-------|-------|
| Stock balance = sum movements | **PASS** — semua cocok |
| Negative stock | **PASS** — 0 item negatif |
| Orphaned movements (tanpa journal) | **FAIL** — 71 movements tanpa GL |

#### 2.4 Invoice & Payment

| Check | Hasil | Detail |
|-------|-------|--------|
| Invoice "Paid" tanpa allocation | **OK** | SI-0001 & SI-0007 dibayar via customer deposit (PAY-202604-0008). Confirmed. |
| Payment tanpa allocation | **REVIEW** | PAY-202604-0013 (305M), PAY-202604-0019 (14M) — perlu cek apakah juga deposit |
| AR vs outstanding invoices | **REVIEW** | Piutang 2.96B vs Outstanding 532M — selisih termasuk saldo awal import |

---

## FASE 3: Code Quality (6/10)

### `any` Usage — 437 instances

| Lokasi | Count | Severity |
|--------|-------|----------|
| Server | 141 | MEDIUM — hotspot: reports.ts (28), import.ts (17), inventory.ts (15) |
| Client | 296 | MEDIUM — hotspot: InventoryPage.tsx (24), StockOpnamePage.tsx (14) |

### File Terlalu Besar (>800 LOC)

| File | LOC |
|------|-----|
| server/routes/inventory.ts | 1,859 |
| client/pages/Settings.tsx | 1,450 |
| server/routes/import.ts | 1,161 |
| client/pages/InventoryPage.tsx | 1,037 |
| server/routes/settings.ts | 972 |

### Testing

| Kategori | Status |
|----------|--------|
| Unit Tests | 3 file (documentNumber, accountBalance, reports) |
| Integration Tests | 0 |
| E2E Tests | 0 |
| Framework | Vitest + Playwright configured, belum aktif dipakai |

### Error Handling

| Item | Status |
|------|--------|
| ErrorBoundary (frontend) | OK — wraps app tree |
| Global error handler (server) | OK — `handleRouteError()` |
| Error reporting (Sentry) | TIDAK ADA |
| Observability | Pino logger saja |

---

## FASE 4: Performance (7/10)

### Database Indexes — OK

Semua tabel kritis punya index yang tepat:
- AccountingLedgerEntry: accountId, date, fiscalYearId, referenceId, partyId
- JournalEntry: status, date, fiscalYearId
- SalesInvoice: partyId, status, date, fiscalYearId
- Payment: partyId, accountId, status, date, fiscalYearId
- AuditLog: userId, (entityType, entityId), createdAt

### Temuan Performance

| # | Temuan | Severity |
|---|--------|----------|
| P-1 | `/payments` GET tanpa limit/pagination | **HIGH** — OOM risk |
| P-2 | N+1 di payment queries (missing include) | MEDIUM |
| P-3 | Docker image 1.69GB (redundant sharp install, @types in prod) | MEDIUM |
| P-4 | Tidak ada HTTP cache headers di reports | LOW |
| P-5 | Tidak ada server-side caching (Redis) untuk report berat | LOW |
| P-6 | TanStack Query staleTime=30s, tidak ada per-endpoint tuning | LOW |

### Docker Optimization

**Penyebab 1.69GB:**
- node_modules server + client (~500MB)
- sharp native binaries (~200MB)
- Redundant `npm install sharp @types/multer` di Dockerfile line 44
- @types/multer seharusnya dev-only

**Target:** <800MB dengan cleanup deps

---

## FASE 5: Business Logic (9/10)

### Flow Verification

| # | Flow | Status | Detail |
|---|------|--------|--------|
| 5.1 | Sales Invoice GL posting | **PASS** | Multi-account revenue, per-item PPN/PPh, service→4.2 |
| 5.2 | Purchase Invoice GL posting | **PASS** | DR Persediaan / CR Hutang, WAC update |
| 5.3 | Payment allocation | **PASS** | Status transitions benar, oldest-first |
| 5.4 | Production run costing | **PASS** | Input→output value distribution, by-product excluded |
| 5.5 | Fiscal year closing | **PASS** | Net income → retained earnings benar |
| 5.6 | Stock movement tanpa journal | **CONCERN** | 71 movements dengan unitCost=0 → no GL (intentional tapi undocumented) |

### Concern Detail

**Stock movement tanpa GL** (`inventory.ts:244`): Jika `totalValue = 0` (unitCost=0), journal entry TIDAK dibuat. Ini menyebabkan:
- Stock quantity berubah tanpa GL trail
- averageCost bisa ter-update ke 0
- Balance akun persediaan diverge dari ledger

**Rekomendasi:** Tetap buat journal entry (dengan value 0) atau buat movement type terpisah untuk "stock adjustment tanpa biaya" agar audit trail lengkap.

---

## Prioritas Perbaikan (Action Plan)

### P0 — Harus Segera (Data Integrity)

| # | Aksi | Effort |
|---|------|--------|
| 1 | **Ganti password admin** (`Admin123!` masih aktif) | 1 menit |
| 2 | **Rekalkulasi balance 10 akun** dari ledger entries | Script SQL |
| 3 | **Investigasi 71 orphaned stock movements** — verifikasi intentional | Query |
| 4 | ~~Investigasi 2 invoice Paid tanpa allocation~~ — **RESOLVED**: dibayar via customer deposit | — |

### P1 — Perbaikan Security

| # | Aksi | Effort |
|---|------|--------|
| 5 | Hapus localStorage token, gunakan cookie-only | Sedang |
| 6 | Aktifkan CSP di Helmet | Rendah |
| 7 | Tambah roleMiddleware di reports.ts & dashboard.ts | Rendah |
| 8 | Tambah limit/pagination di `/payments` GET | Rendah |

### P2 — Code Quality

| # | Aksi | Effort |
|---|------|--------|
| 9 | Split inventory.ts (1,859 LOC) | Sedang |
| 10 | Split Settings.tsx (1,450 LOC) | Sedang |
| 11 | Reduce `any` usage (437 instances) | Berat |
| 12 | Tambah integration tests untuk GL posting flows | Berat |
| 13 | Optimasi Docker image (1.69GB → <800MB) | Rendah |

### P3 — Nice to Have

| # | Aksi |
|---|------|
| 14 | Integrasi Sentry untuk error reporting |
| 15 | HTTP cache headers di report endpoints |
| 16 | Server-side caching (Redis) untuk report berat |
| 17 | Vite code splitting per route |
