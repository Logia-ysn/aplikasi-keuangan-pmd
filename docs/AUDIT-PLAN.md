# Audit Plan — Aplikasi Keuangan PMD v2.4.0

**Tanggal**: 5 April 2026
**Auditor**: Claude Code (AI-assisted)
**Scope**: Full system audit — security, data integrity, code quality, performance

---

## Ringkasan Sistem

| Metrik | Nilai |
|--------|-------|
| Total LOC | ~36,800 (144 file TS/TSX) |
| Server | 27 route files, ~12,900 LOC |
| Client | 19 pages + 36 components, ~23,900 LOC |
| Database | PostgreSQL 16, 32 model Prisma, 26 migrasi |
| Deploy | Docker Compose (2 container) + Cloudflare Tunnel |
| Domain | keuangan.panganmasadepan.com |

---

## FASE 1: Security Audit (CRITICAL)

### 1.1 Autentikasi & Otorisasi

| # | Item Audit | Status Awal | Temuan | Severity |
|---|-----------|-------------|--------|----------|
| 1.1.1 | JWT HttpOnly Cookie | ✅ OK | Implementasi benar, 24h expiry | — |
| 1.1.2 | CSRF Protection | ✅ OK | Double-submit cookie pattern | — |
| 1.1.3 | Token Blacklist (Logout) | ✅ OK | Revokasi via DB | — |
| 1.1.4 | Rate Limiting Login | ✅ OK | 10/15min per IP | — |
| 1.1.5 | Rate Limiting API | ✅ OK | 300/menit global | — |
| 1.1.6 | Password Hashing | ✅ OK | bcrypt | — |
| 1.1.7 | Role Enforcement | ✅ OK | 88 endpoint pakai `roleMiddleware` | — |
| 1.1.8 | Default Password | ⚠️ RISK | `Admin123!` di seed — perlu verifikasi sudah diganti | MEDIUM |
| 1.1.9 | localStorage Token | ⚠️ RISK | Token masih disimpan di localStorage (XSS vulnerable) | MEDIUM |

**Aksi Fase 1.1:**
- [ ] Audit: Verifikasi semua GET endpoint juga pakai roleMiddleware (beberapa GET hanya pakai authMiddleware tanpa role check)
- [ ] Audit: Cek apakah password default sudah diganti di production
- [ ] Fix: Migrasi dari localStorage ke HttpOnly cookie-only auth
- [ ] Fix: Hapus `localStorage.setItem('token', ...)` dari LoginPage.tsx

### 1.2 Input Validation & Injection

| # | Item Audit | Status Awal | Temuan | Severity |
|---|-----------|-------------|--------|----------|
| 1.2.1 | Zod Schema Coverage | ✅ OK | Semua POST/PUT endpoint pakai Zod | — |
| 1.2.2 | SQL Injection — Prisma ORM | ✅ OK | Parameterized queries default | — |
| 1.2.3 | SQL Injection — Raw Queries | ⚠️ REVIEW | 14 `$queryRaw` (tagged template = aman), 1 `$executeRawUnsafe` | MEDIUM |
| 1.2.4 | XSS Prevention | ✅ OK | React auto-escape, Helmet aktif | — |
| 1.2.5 | CSP Disabled | ⚠️ REVIEW | `contentSecurityPolicy: false` di Helmet config | LOW |
| 1.2.6 | File Upload Validation | ⚠️ REVIEW | `attachments.ts` pakai multer — perlu cek MIME & size limit | MEDIUM |
| 1.2.7 | Import CSV/Excel | ⚠️ REVIEW | `import.ts` 1,161 LOC — perlu audit parsing safety | MEDIUM |

**Aksi Fase 1.2:**
- [ ] Audit: Review `$executeRawUnsafe` di settings.ts:844 (TRUNCATE — admin only, tapi tetap berbahaya)
- [ ] Audit: Cek file upload validation (MIME type, max size, filename sanitization)
- [ ] Audit: Review import CSV/Excel untuk injection atau malformed data
- [ ] Fix: Evaluasi mengaktifkan CSP yang sesuai

### 1.3 Secret Management

| # | Item Audit | Status Awal | Temuan | Severity |
|---|-----------|-------------|--------|----------|
| 1.3.1 | JWT_SECRET | ✅ OK | Di .env, sudah di-generate (hex 48) | — |
| 1.3.2 | DB Password | ⚠️ RISK | `keuangan_secret_2026` di docker-compose.yml default | LOW |
| 1.3.3 | .gitignore | ✅ OK | `.env` masuk .gitignore, tidak tracked | — |
| 1.3.4 | Backup Endpoint | ⚠️ RISK | `/api/backup` — Admin only, tapi pakai PGPASSWORD env | LOW |
| 1.3.5 | Hardcoded Secrets | ✅ OK | Tidak ada hardcoded secret di source code | — |

**Aksi Fase 1.3:**
- [ ] Audit: Verifikasi JWT_SECRET bukan placeholder di production
- [ ] Fix: Pertimbangkan mengganti PGPASSWORD dengan pgpass file atau stdin

### 1.4 Infrastruktur

| # | Item Audit | Temuan | Severity |
|---|-----------|--------|----------|
| 1.4.1 | CORS Policy | Allow semua private IP — intentional untuk LAN | LOW |
| 1.4.2 | PostgreSQL Port Exposed | 5435 ke host — diperlukan untuk dev tools | LOW |
| 1.4.3 | Docker Image Size | 1.69GB — bisa optimasi | LOW |
| 1.4.4 | SSL/TLS | Via Cloudflare Tunnel (OK) | — |
| 1.4.5 | Helmet Config | CSP disabled, crossOriginEmbedderPolicy disabled | LOW |

---

## FASE 2: Data Integrity — GL & Akuntansi (CRITICAL)

### 2.1 Double-Entry Balance Verification

| # | Item Audit | Query/Check | Priority |
|---|-----------|-------------|----------|
| 2.1.1 | Semua journal entry balanced | `SELECT je.id, SUM(debit)-SUM(credit) FROM journal_entry_accounts GROUP BY je.id HAVING SUM(debit) != SUM(credit)` | P0 |
| 2.1.2 | Account balance = sum ledger | Compare `accounts.balance` vs `SUM(debit-credit)` from `accounting_ledger_entries` per account | P0 |
| 2.1.3 | Trial Balance = 0 | Total debit semua akun = total credit | P0 |
| 2.1.4 | Balance Sheet equation | Assets = Liabilities + Equity | P0 |
| 2.1.5 | Revenue/Expense vs journal | Saldo 4.x dan 5.x cocok dengan sum journal items | P1 |

**Aksi Fase 2.1:**
- [ ] Jalankan 5 SQL query verifikasi di atas
- [ ] Identifikasi dan fix jurnal yang tidak balanced (jika ada)
- [ ] Cross-check saldo akun dengan laporan Trial Balance di UI

### 2.2 Inventory Integrity

| # | Item Audit | Query/Check | Priority |
|---|-----------|-------------|----------|
| 2.2.1 | Stock balance = sum movements | `inventory_items.current_stock` vs `SUM(quantity * direction)` from `stock_movements` | P0 |
| 2.2.2 | Weighted Average Cost | Verifikasi `average_cost` per item sesuai formula WAC | P1 |
| 2.2.3 | Production rendemen accuracy | Cross-check total output/input ratio per production run | P1 |
| 2.2.4 | Negative stock prevention | Cari item dengan `current_stock < 0` | P0 |
| 2.2.5 | Orphaned stock movements | Movement tanpa journal entry | P1 |

### 2.3 Invoice & Payment Integrity

| # | Item Audit | Query/Check | Priority |
|---|-----------|-------------|----------|
| 2.3.1 | Invoice status consistency | Invoice "Paid" tapi total allocation < total invoice? | P0 |
| 2.3.2 | Payment allocation balance | Sum allocations per payment = payment amount? | P0 |
| 2.3.3 | AR/AP balance | Piutang (1.2.1) balance = sum unpaid sales invoices? | P1 |
| 2.3.4 | Cancelled invoice GL | Cancelled invoice → reversal journal benar-benar balanced? | P1 |
| 2.3.5 | Deposit tracking | Deposit balance = deposits - applied amounts? | P1 |

### 2.4 Fiscal Year & Period

| # | Item Audit | Priority |
|---|-----------|----------|
| 2.4.1 | Fiscal year closing accuracy | Retained earnings = net income transferred correctly? | P1 |
| 2.4.2 | Cross-period transactions | Tidak ada transaksi di fiscal year yang sudah ditutup? | P1 |

---

## FASE 3: Code Quality Review

### 3.1 File Terlalu Besar (>800 LOC)

| File | LOC | Rekomendasi Refactor |
|------|-----|---------------------|
| `server/routes/inventory.ts` | **1,859** | Split: items.ts, movements.ts, production.ts, dashboard.ts |
| `server/routes/import.ts` | **1,161** | Split per entity: importCoa.ts, importParties.ts, importInvoices.ts, importStock.ts |
| `server/routes/settings.ts` | **972** | Split: companySettings.ts, dummyData.ts, resetData.ts |
| `client/pages/Settings.tsx` | **1,450** | Extract: CompanySettingsTab, UserManagementTab, SystemAccountsTab |
| `client/pages/InventoryPage.tsx` | **1,037** | Extract: InventoryItemsTab, StockMovementsTab (dashboard sudah extracted) |

### 3.2 Testing Gap (CRITICAL)

| Kategori | Status Saat Ini | Target |
|----------|----------------|--------|
| Unit Tests | **3 file** (documentNumber, accountBalance, reports) | 80% coverage utils/services |
| Integration Tests (API) | **0** | Semua route CRUD + GL posting |
| E2E Tests (Playwright) | **0** | 10 critical user flows |
| Test Framework | Vitest configured, Playwright configured | Aktif digunakan |

**Critical Test Scenarios yang Harus Ada:**
1. Sales invoice create → GL posting → payment → close
2. Purchase invoice create → GL posting → payment → close
3. Production run create → stock movement → GL posting
4. Stock opname → adjustment → GL posting
5. Fiscal year close → retained earnings
6. Cancel invoice → reversal journal
7. Edit production run → reverse + recreate
8. Import CSV → data validation → GL posting
9. Bank reconciliation matching
10. Deposit apply → invoice allocation

### 3.3 Error Handling

| # | Item | Status | Aksi |
|---|------|--------|------|
| 3.3.1 | Global error handler | ⚠️ | `err: any` typing — perlu narrowing | LOW |
| 3.3.2 | Per-route try-catch | ✅ OK | Konsisten via `handleRouteError()` | — |
| 3.3.3 | Frontend ErrorBoundary | ✅ OK | Ada | — |
| 3.3.4 | Unhandled rejection handler | ✅ OK | Process-level handler | — |

### 3.4 TypeScript Strictness

| # | Item | Status |
|---|------|--------|
| 3.4.1 | strict mode | ✅ Aktif |
| 3.4.2 | noUnusedLocals | ✅ Aktif |
| 3.4.3 | `any` usage | ⚠️ Perlu audit jumlah `any` di codebase |
| 3.4.4 | console.log | ✅ Tidak ditemukan (pakai Pino logger) |

---

## FASE 4: Performance Audit

### 4.1 Database Performance

| # | Item Audit | Aksi |
|---|-----------|------|
| 4.1.1 | Index coverage | Review index pada kolom filter/sort yang sering digunakan |
| 4.1.2 | N+1 queries | Audit Prisma include vs separate query pattern |
| 4.1.3 | Large table pagination | AuditLog, LedgerEntry — ada limit? |
| 4.1.4 | Slow query identification | Enable pg_stat_statements, cek query > 100ms |
| 4.1.5 | Transaction isolation | Verify isolation level untuk concurrent updates |
| 4.1.6 | Connection pool | Prisma default pool = 10, cukup untuk single user? |

### 4.2 Frontend Performance

| # | Item Audit | Aksi |
|---|-----------|------|
| 4.2.1 | Bundle size analysis | Run `npx vite-bundle-visualizer` |
| 4.2.2 | TanStack Query config | staleTime, cacheTime optimal? |
| 4.2.3 | Large list rendering | Virtual scroll untuk tabel > 100 rows? |
| 4.2.4 | Image optimization | Logo upload — resize server-side? |
| 4.2.5 | PWA caching | Workbox strategy review |

### 4.3 Docker & Infrastructure

| # | Item Audit | Aksi |
|---|-----------|------|
| 4.3.1 | Image size optimization | 1.69GB → target < 500MB |
| 4.3.2 | Build time | RPi5 OOM issue — memory limit |
| 4.3.3 | Health check tuning | Interval 30s, timeout, retries |
| 4.3.4 | Backup automation | Manual saat ini — perlu cron? |
| 4.3.5 | Log rotation | Pino output rotation di Docker |

---

## FASE 5: Business Logic Verification

### 5.1 Modul Penjualan
- [ ] Invoice lifecycle benar (Draft → Submitted → Paid/Cancelled)
- [ ] Diskon per-item & PPN kalkulasi akurat
- [ ] PPh per-item posting ke akun yang benar
- [ ] Partial payment update status ke PartiallyPaid
- [ ] Service item → akun 4.2 (bukan 4.1)

### 5.2 Modul Pembelian
- [ ] Purchase invoice GL posting (DR Persediaan / CR Hutang)
- [ ] Update average cost saat terima barang
- [ ] Vendor deposit application mengurangi outstanding

### 5.3 Modul Inventori
- [ ] Weighted average cost recalculation saat IN/OUT
- [ ] Production costing: total input value → distributed to outputs
- [ ] By-product tidak masuk rendemen
- [ ] Stock opname adjustment GL balanced
- [ ] Negative stock prevented di semua flow

### 5.4 Modul Bank & Kas
- [ ] Payment allocation links correct (invoice ↔ payment)
- [ ] Bank reconciliation matching logic
- [ ] Transfer antar kas/bank balanced

### 5.5 Laporan Keuangan
- [ ] Trial Balance: total debit = total credit
- [ ] Laba Rugi: pendapatan - beban = laba bersih
- [ ] Neraca: aset = kewajiban + ekuitas
- [ ] Arus Kas: operating + investing + financing = delta kas
- [ ] Aging: bucket calculation (current, 30, 60, 90, 120+)

---

## Prioritas & Jadwal Eksekusi

| Fase | Prioritas | Agent | Estimasi Effort |
|------|-----------|-------|-----------------|
| **Fase 1** Security | P0 — CRITICAL | `security-reviewer` | Ringan (mostly OK) |
| **Fase 2** Data Integrity | P0 — CRITICAL | `database-reviewer` + SQL manual | Sedang |
| **Fase 3.2** Testing | P0 — CRITICAL | `tdd-guide` + `e2e-runner` | Berat |
| **Fase 5** Business Logic | P1 — HIGH | Manual review + SQL | Sedang |
| **Fase 3.1** Refactoring | P2 — MEDIUM | `planner` + `code-reviewer` | Sedang |
| **Fase 4** Performance | P2 — MEDIUM | `database-reviewer` | Ringan |
| **Fase 3.3-3.4** Code Quality | P3 — LOW | `typescript-reviewer` | Ringan |

---

## Temuan Awal (Pre-Audit)

### Positif ✅
1. **Auth solid** — JWT + HttpOnly cookie + CSRF + bcrypt + rate limiting + token blacklist
2. **Role enforcement** — 88 endpoint pakai roleMiddleware, backup/reset admin-only
3. **Input validation** — Zod schemas di semua mutation endpoints
4. **SQL injection safe** — Prisma ORM, raw queries pakai tagged templates
5. **Audit trail** — Semua mutasi tercatat (action, entity, old/new values, IP)
6. **Decimal precision** — Pakai `decimal.js` untuk kalkulasi keuangan
7. **No hardcoded secrets** — Semua via environment variables
8. **Proper logging** — Pino (no console.log)
9. **Global error handler** — Centralized + per-route handling

### Perlu Perhatian ⚠️
1. **Zero test coverage** (3 unit test file saja) — risiko regresi tinggi
2. **localStorage token** masih digunakan (XSS risk)
3. **5 file > 800 LOC** — perlu refactoring
4. **CSP disabled** — perlu evaluasi
5. **$executeRawUnsafe** di reset-data — potensi SQL injection (admin only)
6. **File upload** — perlu verifikasi MIME/size validation
7. **No automated backup** — manual via UI
8. **Docker image 1.69GB** — terlalu besar untuk RPi5
