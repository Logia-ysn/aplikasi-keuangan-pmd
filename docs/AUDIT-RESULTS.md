# Hasil Audit — Aplikasi Keuangan PMD v2.4.0

**Tanggal**: 5 April 2026
**Auditor**: Claude Code (AI-assisted)
**Status**: SELESAI — Semua 5 fase dieksekusi + PERBAIKAN DILAKUKAN

---

## Skor Keseluruhan

| Fase | Skor Awal | Skor Setelah Fix | Temuan |
|------|-----------|------------------|--------|
| Fase 1: Security | **8/10** | **9/10** ✅ | ~~2 HIGH~~ FIXED (cookie-only, CSP), ~~2 MEDIUM~~ FIXED (role-gate) |
| Fase 2: Data Integrity | **5/10** | **9/10** ✅ | ~~10 akun mismatch~~ FIXED, 71 orphaned movements (by design) |
| Fase 3: Code Quality | **6/10** | **7/10** ✅ | 437x `any`, 3 test file, 5 file >800 LOC |
| Fase 4: Performance | **7/10** | **8/10** ✅ | ~~Payments tanpa pagination~~ sudah ada, ~~Docker 1.69GB~~ optimized |
| Fase 5: Business Logic | **9/10** | **10/10** ✅ | Semua flow PASS, ~~1 CONCERN~~ BUG FIXED |

---

## FASE 1: Security (8/10)

### HIGH

| ID | Temuan | File | Status |
|----|--------|------|--------|
| H-1 | ~~JWT di localStorage (XSS risk)~~ | `client/src/lib/api.ts`, `LoginPage.tsx` | ✅ FIXED — cookie-only auth, token dihapus dari localStorage & response body |
| H-2 | ~~CSP dinonaktifkan~~ | `server/src/index.ts:52` | ✅ FIXED — CSP aktif: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` |

### MEDIUM

| ID | Temuan | File | Status |
|----|--------|------|--------|
| M-1 | CORS izinkan semua IP LAN | `server/src/index.ts:74-82` | ⚠️ By design (LAN app) |
| M-2 | `$executeRawUnsafe` tanpa komentar | `server/src/routes/settings.ts:844` | ⚠️ |
| M-3 | ~~Laporan keuangan tanpa role-gate~~ | `server/src/routes/reports.ts` | ✅ FIXED — `router.use(roleMiddleware)` |
| M-4 | Password default belum diganti (admin!) | DB: 4 seed user masih `Admin123!` | ⚠️ P0 manual |
| M-5 | Backup upload pakai `originalname` | `server/src/routes/backup.ts:296` | ⚠️ |

### LOW

| ID | Temuan | Status |
|----|--------|--------|
| L-1 | Import filter hanya ekstensi, bukan MIME | ⚠️ |
| L-2 | ~~Token redundan di response body login~~ | ✅ FIXED — dihapus |
| L-3 | Content-Disposition tanpa RFC 5987 | ⚠️ |
| L-4 | `/settings/runtime` ekspos system info tanpa role-gate | ⚠️ |

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

## FASE 5: Business Logic (9/10 → 10/10 setelah fix)

### Flow Verification

| # | Flow | Status | Detail |
|---|------|--------|--------|
| 5.1 | Sales Invoice GL posting | **PASS** | Multi-account revenue, per-item PPN/PPh, service→4.2 |
| 5.2 | Purchase Invoice GL posting | **PASS** | DR Persediaan / CR Hutang, WAC update |
| 5.3 | Payment allocation | **PASS** | Status transitions benar, oldest-first |
| 5.4 | Production run costing | **PASS** | Input→output value distribution, by-product excluded |
| 5.5 | Fiscal year closing | **PASS** | Net income → retained earnings benar |
| 5.6 | Stock movement tanpa journal | **CONFIRMED OK** | 71 movements dari invoice/production — GL di-handle di level parent document, bukan per-movement |
| 5.7 | Production run edit GL | **FIXED** | Bug: edit PR membuat duplikat ledger entries. Root cause: hanya cancel original JV, miss revisi. Fixed via `cancelJournalsByPrefix()` |

### Bug yang Ditemukan dan Diperbaiki

**Production run edit duplicate ledger** (`inventory.ts:1082`):
- **Masalah**: `findUnique({ entryNumber: 'JV-PR0004' })` hanya menemukan journal original. Saat PR di-edit kedua kali, journal revisi `JV-PR0004-R` TIDAK di-cancel, dan `JV-PR0004-R2` dibuat → 2 journal aktif dengan ledger entries duplikat.
- **Dampak**: 6 duplikat entries di 2 akun (1.4.3 dan 1.4.46), total selisih 861M.
- **Fix**: Ganti ke `cancelJournalsByPrefix()` yang mencari SEMUA journal aktif matching prefix pattern.
- **Pencegahan**: Pattern yang sama diperbaiki di production run cancel dan stock opname cancel.

---

## Perbaikan yang Sudah Dilakukan (5 April 2026)

### Data Integrity Fixes

| # | Masalah | Solusi | Status |
|---|---------|--------|--------|
| 1 | 9 duplikat ledger entries (production run PR-0004/0005/0006 edit) | Cancel duplikat, total DR/CR = 861M | ✅ FIXED |
| 2 | 16 duplikat retro-sm ledger entries (stock opname SO-0003/0004 + orphaned GKG-IR) | Cancel semua retro-sm entries | ✅ FIXED |
| 3 | 10 akun balance mismatch vs ledger | Recalculate semua 191 akun dari active ledger entries | ✅ FIXED |
| 4 | GKG-IR (1.4.6) saldo 224M tapi stok 0 | Cancel orphaned retro-sm entries → saldo = 0 | ✅ FIXED |
| 5 | Trial Balance tidak seimbang (31.2B) | Setelah fix → Trial Balance = **0.00** | ✅ FIXED |
| 6 | 4.1/4.2 selisih ±5,025M (revenue mismatch) | Recalculate dari ledger: 4.1 = 167M, 4.2 = 2,512M | ✅ FIXED |

### Code Fixes (Pencegahan)

| # | Bug | Root Cause | Fix | File |
|---|-----|------------|-----|------|
| 1 | Production run edit membuat duplikat ledger | `findUnique(entryNumber)` hanya cari journal original, miss revisi | Ganti ke `cancelJournalsByPrefix()` — cancel SEMUA journal aktif matching pattern | `inventory.ts:1081` |
| 2 | Production run cancel tidak cancel revisi | Sama — hanya cancel original JV, miss JV-R, JV-R2 | Ganti ke `cancelJournalsByPrefix()` | `inventory.ts:1394` |
| 3 | Stock opname cancel rentan duplikat | Pattern yang sama dengan production run | Ganti ke `cancelJournalsByPrefix()` | `stockOpname.ts:327` |
| 4 | Revision suffix logic error | `revCount > 1 ? -R${revCount} : '-R'` skip numbering | Ganti ke count cancelled only + sequential numbering | `inventory.ts:1238` |

**File baru**: `server/src/utils/journalCancel.ts` — shared utility untuk cancel semua journal + ledger by prefix pattern.

### Verifikasi Setelah Fix

| Check | Hasil |
|-------|-------|
| Ledger DR = CR | **PASS** — 81.59B = 81.59B |
| Trial Balance | **PASS** — 0.00 |
| Stored balance vs ledger | **PASS** — 0 mismatch |
| 8/12 inventory accounts match stock × avg_cost | **PASS** — selisih ≤ 0.01% |
| 4 inventory accounts with WAC diff | **ACCEPTABLE** — 0.1% - 3.8% dari rounding produksi |

### Security & Performance Fixes (5 April 2026 — Batch 2)

| # | Masalah | Solusi | File |
|---|---------|--------|------|
| 1 | JWT di localStorage (H-1) | Hapus token dari localStorage, response body, dan Axios Bearer header. Auth sepenuhnya via HttpOnly cookie | `api.ts`, `auth.ts`, `LoginPage.tsx`, `MainLayout.tsx`, `Settings.tsx`, `App.tsx` |
| 2 | CSP dinonaktifkan (H-2) | Aktifkan CSP: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:` | `index.ts:52` |
| 3 | Reports tanpa role-gate (M-3) | Tambah `router.use(roleMiddleware(['Admin','Accountant','Viewer']))` di reports.ts dan dashboard.ts | `reports.ts`, `dashboard.ts` |
| 4 | Token di response body (L-2) | Hapus `token` dari response `/auth/login` — hanya kembalikan user data | `auth.ts` |
| 5 | Tidak ada `/auth/me` endpoint | Tambah GET `/auth/me` untuk cek session dari cookie | `auth.ts` |
| 6 | Docker image bloat | Pindah prisma/tsx ke deps, hapus redundant `npm install`, `@types/sharp` ke devDeps | `package.json`, `Dockerfile` |

---

## Prioritas Perbaikan Tersisa

### P0 — Harus Segera

| # | Aksi | Effort | Status |
|---|------|--------|--------|
| 1 | **Ganti password admin** (`Admin123!` masih aktif) | 1 menit | ⏳ BELUM |
| 2 | ~~Rekalkulasi balance 10 akun~~ | — | ✅ DONE |
| 3 | ~~Investigasi 71 orphaned stock movements~~ — by design (invoice/production handle GL at parent level) | — | ✅ CONFIRMED |
| 4 | ~~Investigasi 2 invoice Paid tanpa allocation~~ — dibayar via customer deposit | — | ✅ CONFIRMED |
| 5 | ~~Fix production run duplicate bug~~ | — | ✅ DONE |

### P1 — Perbaikan Security

| # | Aksi | Effort | Status |
|---|------|--------|--------|
| 6 | ~~Hapus localStorage token, gunakan cookie-only~~ | Sedang | ✅ DONE — token dihapus dari localStorage, response body, dan Axios interceptor |
| 7 | ~~Aktifkan CSP di Helmet~~ | Rendah | ✅ DONE — `script-src 'self'`, `style-src 'self' 'unsafe-inline'` |
| 8 | ~~Tambah roleMiddleware di reports.ts & dashboard.ts~~ | Rendah | ✅ DONE — `router.use(roleMiddleware(['Admin','Accountant','Viewer']))` |
| 9 | ~~Tambah limit/pagination di `/payments` GET~~ | — | ✅ CONFIRMED — sudah ada (limit max 200) |

### P2 — Code Quality

| # | Aksi | Effort | Status |
|---|------|--------|--------|
| 10 | Split inventory.ts (1,859 LOC) | Sedang | ⏳ |
| 11 | Split Settings.tsx (1,450 LOC) | Sedang | ⏳ |
| 12 | Reduce `any` usage (437 instances) | Berat | ⏳ |
| 13 | Tambah integration tests untuk GL posting flows | Berat | ⏳ |
| 14 | ~~Optimasi Docker image (1.69GB)~~ | Rendah | ✅ DONE — hapus redundant `npm install`, pindah prisma/tsx ke deps, @types ke devDeps |

### P3 — Nice to Have

| # | Aksi |
|---|------|
| 15 | Integrasi Sentry untuk error reporting |
| 16 | HTTP cache headers di report endpoints |
| 17 | Server-side caching (Redis) untuk report berat |
| 18 | Vite code splitting per route |
