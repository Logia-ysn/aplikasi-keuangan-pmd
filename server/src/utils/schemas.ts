import { z } from 'zod';

// ─── Chart of Accounts ────────────────────────────────────────────────────────
const AccountTypeEnum = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], {
  message: "Tipe akun harus salah satu dari: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
});

export const CreateAccountSchema = z.object({
  accountNumber: z.string().min(1, 'Nomor akun wajib diisi.'),
  name: z.string().min(1, 'Nama akun wajib diisi.'),
  accountType: AccountTypeEnum,
  rootType: AccountTypeEnum,
  parentId: z.string().nullable().optional(),
  isGroup: z.boolean().optional(),
  currency: z.string().optional(),
});

export const UpdateAccountSchema = CreateAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Journal Entry ────────────────────────────────────────────────────────────
const JournalItemSchema = z.object({
  accountId: z.string().min(1, 'Akun wajib dipilih.'),
  debit: z.number().min(0),
  credit: z.number().min(0),
  partyId: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const CreateJournalSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  narration: z.string().min(1, 'Keterangan wajib diisi.'),
  items: z.array(JournalItemSchema).min(1, 'Minimal satu baris jurnal.'),
});

// ─── Sales Invoice ────────────────────────────────────────────────────────────
const InvoiceItemSchema = z.object({
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().optional(),
  rate: z.number().positive('Harga harus lebih dari 0.'),
  discount: z.number().min(0).max(100).optional().default(0), // persen diskon per baris
  description: z.string().optional(),
});

export const CreateSalesInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pelanggan wajib dipilih.'),
  items: z.array(InvoiceItemSchema).min(1, 'Minimal satu item.'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  taxPct: z.number().min(0).max(100).optional().default(0),    // PPN %
  potongan: z.number().min(0).optional().default(0),           // potongan amount
  biayaLain: z.number().min(0).optional().default(0),          // biaya tambahan
  labelPotongan: z.string().nullable().optional(),
  labelBiaya: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
});

// ─── Purchase Invoice ─────────────────────────────────────────────────────────
export const CreatePurchaseInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pemasok wajib dipilih.'),
  items: z.array(InvoiceItemSchema).min(1, 'Minimal satu item.'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  taxPct: z.number().min(0).max(100).optional().default(0),
  potongan: z.number().min(0).optional().default(0),
  biayaLain: z.number().min(0).optional().default(0),
});

// ─── Payment ──────────────────────────────────────────────────────────────────
const AllocationSchema = z.object({
  invoiceType: z.enum(['SalesInvoice', 'PurchaseInvoice']),
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
});

export const CreatePaymentSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pihak wajib dipilih.'),
  amount: z.number().positive('Jumlah harus lebih dari 0.'),
  paymentType: z.enum(['Receive', 'Pay']),
  accountId: z.string().min(1, 'Akun kas/bank wajib dipilih.'),
  allocations: z.array(AllocationSchema).optional(),
  referenceNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Party ────────────────────────────────────────────────────────────────────
export const CreatePartySchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  partyType: z.enum(['Customer', 'Supplier', 'Both']),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
});

export const UpdatePartySchema = CreatePartySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Opening Balance ─────────────────────────────────────────────────────────
export const SetBalanceSchema = z.object({
  balance: z.number({ error: 'Saldo harus berupa angka.' }),
});

// ─── Company Settings ─────────────────────────────────────────────────────────
export const UpdateCompanySettingsSchema = z.object({
  companyName: z.string().min(1, 'Nama perusahaan wajib diisi.').optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  taxId: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
});

// ─── Fiscal Year ──────────────────────────────────────────────────────────────
export const CreateFiscalYearSchema = z.object({
  name: z.string().min(1, 'Nama tahun fiskal wajib diisi.'),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
  endDate: z.string().min(1, 'Tanggal selesai wajib diisi.'),
});

// ─── Inventory Item ───────────────────────────────────────────────────────────
export const CreateInventoryItemSchema = z.object({
  code: z.string().min(1, 'Kode item wajib diisi.'),
  name: z.string().min(1, 'Nama item wajib diisi.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  minimumStock: z.number().min(0).optional(),
  accountId: z.string().nullable().optional(),
});

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Stock Movement ───────────────────────────────────────────────────────────
export const CreateStockMovementSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  movementType: z.enum(['In', 'Out', 'AdjustmentIn', 'AdjustmentOut']),
  quantity: z.number().positive('Kuantitas harus lebih dari 0.'),
  unitCost: z.number().min(0).optional(),
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  offsetAccountId: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Production Run ───────────────────────────────────────────────────────────
const ProductionLineSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  quantity: z.number().positive('Kuantitas harus lebih dari 0.'),
});

export const CreateProductionRunSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  notes: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  inputs: z.array(ProductionLineSchema).min(1, 'Minimal satu item input.'),
  outputs: z.array(ProductionLineSchema).min(1, 'Minimal satu item output.'),
});
