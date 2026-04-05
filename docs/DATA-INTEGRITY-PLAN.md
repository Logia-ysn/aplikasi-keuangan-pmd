# Plan Perbaikan Data Integrity — Aplikasi Keuangan PMD

**Tanggal**: 5 April 2026
**Status**: DRAFT — Menunggu persetujuan

---

## Status Saat Ini

| Check | Hasil |
|-------|-------|
| Balance vs Ledger (191 akun) | ✅ PASS — 0 mismatch |
| Trial Balance | ✅ PASS — 0.00 |
| Ledger DR = CR | ✅ PASS — 81.59B = 81.59B |
| Duplikat ledger entries | ✅ PASS — 0 (sudah di-cancel) |
| Production edit bug | ✅ FIXED — `cancelJournalsByPrefix()` |

---

## Issue yang Masih Ada

### Issue 1: WAC Drift — Selisih Saldo Akun vs Stok × AvgCost

**Severity**: LOW
**Total selisih**: Rp 30.8 juta (dari total persediaan ~6.2 miliar = **0.5%**)

| Akun | Barang | Saldo Akun | Stok × AvgCost | Selisih | % |
|------|--------|------------|----------------|---------|---|
| 1.4.46 | Glosor Kebo | 391M | 401M | -9.8M | -2.4% |
| 1.4.56 | Broken | 1,635M | 1,627M | +7.9M | +0.5% |
| 1.4.58 | Menir Jitay | 214M | 207M | +6.3M | +3.0% |
| 1.4.3 | Gabah Kebo | 134M | 139M | -5.2M | -3.8% |
| 1.4.5 | Gabah IR | 1,628M | 1,630M | -1.6M | -0.1% |
| 1.4.43 | HGL 50Kg | 1,787M | 1,787M | -120 | 0% |

**Root Cause**: Weighted Average Cost (WAC) dihitung ulang per transaksi oleh aplikasi (`averageCost` field), tapi ledger mencatat nilai aktual per transaksi. Saat production run di-edit, cost bahan baku berubah, tapi WAC item sudah bergeser dari transaksi lain.

**Opsi Perbaikan**:

#### Opsi A: Biarkan (RECOMMENDED)
- Selisih 0.5% masih dalam toleransi wajar untuk operasi produksi
- WAC dan ledger akan terus diverge seiring transaksi berjalan — ini sifat alami WAC method
- Koreksi dilakukan saat stock opname periodik atau tutup buku

#### Opsi B: Recalculate WAC dari Ledger
- Hitung ulang `averageCost` per item dari ledger entries (total debit / total qty masuk)
- Risiko: bisa mengubah cost basis untuk transaksi masa depan
- Effort: SEDANG — perlu script SQL + verifikasi manual

#### Opsi C: Adjustment Journal Entry
- Buat 1 jurnal penyesuaian: DR/CR persediaan vs HPP/Selisih Persediaan
- Total: Rp 30.8M (net)
- Effort: RENDAH — 1 journal entry manual
- Timing: Sebaiknya dilakukan saat tutup buku

---

### Issue 2: PAY-202604-0013 dan PAY-202604-0019 — Payment Tanpa Allocation

**Severity**: LOW (kemungkinan by design)

| Payment | Jumlah | Tipe | Party | Notes |
|---------|--------|------|-------|-------|
| PAY-202604-0013 | 305M | Receive | Bulog Bogor | Pencairan Jasa Maklon |
| PAY-202604-0019 | 14M | Receive | BGN Kemped | Pelunasan Invoice Tgl 30 Mar 2026 |

**Analisis**:
- Tidak ada invoice outstanding untuk kedua party ini di sistem
- PAY-0013: "Pencairan Jasa Maklon" — kemungkinan pembayaran jasa yang invoice-nya belum diinput atau dari sistem lain
- PAY-0019: "Pelunasan Invoice Tgl 30 Mar" — kemungkinan invoice dari sebelum sistem ini digunakan

**Opsi Perbaikan**:

#### Opsi A: Buat Invoice Retroaktif
- Buat sales invoice untuk Bulog Bogor (305M) dan BGN Kemped (14M)
- Alokasikan payment ke invoice
- Effort: RENDAH tapi perlu data dari user

#### Opsi B: Biarkan sebagai Uang Muka
- Payment sudah posting ke GL (DR Bank / CR Piutang)
- Secara akuntansi sudah benar
- Allocation hanya untuk tracking internal
- Effort: 0

#### Opsi C: Konfirmasi dengan User
- Tanyakan apakah ini uang muka pelanggan atau pelunasan invoice yang sudah dihapus
- Effort: 1 menit

---

### Issue 3: Default Password Masih Aktif

**Severity**: MEDIUM

| User | Role | Last Login | Status |
|------|------|------------|--------|
| admin@keuangan.local | Admin | 2026-04-05 | ⚠️ Aktif digunakan |
| staff@keuangan.local | Accountant | — | ⚠️ Tidak pernah login |
| viewer@keuangan.local | Viewer | — | ⚠️ Tidak pernah login |
| produksi@keuangan.local | StaffProduksi | — | ⚠️ Tidak pernah login |
| adi@panganmasadepan.com | StaffProduksi | 2026-04-03 | ✅ Kemungkinan sudah ganti |
| feri@panganmasadepan.com | StaffProduksi | 2026-04-05 | ✅ Kemungkinan sudah ganti |

**Aksi**: Ganti password semua seed user, atau nonaktifkan user yang tidak digunakan.

---

### Issue 4: Deposit Balance Tracking

**Severity**: LOW

| Tipe | Jumlah Deposit | Total | Applied | Sisa |
|------|---------------|-------|---------|------|
| Customer Deposit | 3 | 11.73B | 2.17B | 9.56B |
| Vendor Deposit | 10 | 2.10B | 1.11B | 0.99B |

Deposit yang belum ter-apply sepenuhnya:
- PAY-0008: Customer deposit 9.04B, applied 2.17B, sisa **6.87B**
- PAY-0025: Customer deposit 2.64B, applied 0, sisa **2.64B**
- 5 vendor deposits belum ter-apply

**Opsi**: Tidak perlu aksi — deposit balance tracking berjalan normal. Sisa deposit akan digunakan saat invoice baru di-submit.

---

### Issue 5: Sinkronisasi WAC saat Production Run Edit (PREVENTIVE)

**Severity**: MEDIUM — Bug code sudah fixed, tapi WAC drift bisa terus terjadi

**Root Cause Code**: Saat production run di-edit:
1. Stock movement lama di-cancel → stok dikembalikan ✓
2. WAC di-recalculate dari stok yang tersisa ✓
3. Stock movement baru dibuat dengan WAC saat ini ✓
4. TAPI: ledger entries pakai nilai berbeda dari WAC karena production output value distribution menggunakan formula input_value × rendemen_pct

**Preventive Fix**:
- Saat membuat ledger entries untuk production run, gunakan `averageCost × quantity` sebagai nilai per-item, bukan distribusi proporsional dari total input value
- Atau: tambahkan reconciliation step setelah production run edit yang menyamakan ledger dengan WAC

**Effort**: SEDANG — perlu ubah logika costing di `inventory.ts` production run POST/PUT

---

## Prioritas Eksekusi

| # | Issue | Prioritas | Effort | Rekomendasi |
|---|-------|-----------|--------|-------------|
| 1 | Default password | **P0** | 1 menit | Ganti segera |
| 2 | WAC Drift | **P2** | Rendah | Opsi A: biarkan, koreksi saat tutup buku |
| 3 | Payment tanpa allocation | **P2** | 1 menit | Opsi C: konfirmasi dengan user |
| 4 | Deposit balance | **P3** | 0 | Normal operation |
| 5 | WAC sync production | **P3** | Sedang | Plan untuk v2.5 |

---

## Checklist Periodik (Rekomendasi)

Jalankan query berikut **setiap minggu** atau sebelum tutup buku:

```sql
-- 1. Trial Balance = 0
SELECT SUM(CASE WHEN "rootType" IN ('ASSET','EXPENSE') THEN balance ELSE -balance END)
FROM accounts WHERE "isGroup" = false;

-- 2. Ledger balanced
SELECT SUM(CASE WHEN is_cancelled = false THEN debit ELSE 0 END) -
       SUM(CASE WHEN is_cancelled = false THEN credit ELSE 0 END)
FROM accounting_ledger_entries;

-- 3. Balance vs Ledger mismatch
SELECT COUNT(*) FROM (
  SELECT a.id FROM accounts a
  LEFT JOIN accounting_ledger_entries ale ON ale.account_id = a.id
  WHERE a."isGroup" = false
  GROUP BY a.id, a."rootType", a.balance
  HAVING ABS(a.balance - CASE
    WHEN a."rootType" IN ('ASSET','EXPENSE')
      THEN COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.credit ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN ale.is_cancelled = false THEN ale.debit ELSE 0 END), 0)
  END) > 1
) m;

-- 4. Duplicate active ledger entries (same description + amount + account)
SELECT COUNT(*) FROM (
  SELECT a."accountNumber", ale.description, ale.debit, ale.credit
  FROM accounting_ledger_entries ale
  JOIN accounts a ON ale.account_id = a.id
  WHERE ale.is_cancelled = false
  GROUP BY a."accountNumber", ale.description, ale.debit, ale.credit
  HAVING COUNT(*) > 1
) d;
```

Target: semua query return **0**.
