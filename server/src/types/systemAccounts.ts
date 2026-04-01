export const SYSTEM_ACCOUNT_ROLES = {
  CASH: {
    key: 'CASH',
    label: 'Kas & Bank',
    description: 'Akun kas dan bank untuk pembayaran masuk/keluar',
    multiAccount: true,
    required: true,
    expectedRootType: 'ASSET' as const,
  },
  AR: {
    key: 'AR',
    label: 'Piutang Usaha',
    description: 'Auto-debit saat faktur penjualan di-submit',
    multiAccount: false,
    required: true,
    expectedRootType: 'ASSET' as const,
  },
  AP: {
    key: 'AP',
    label: 'Hutang Usaha',
    description: 'Auto-credit saat faktur pembelian di-submit',
    multiAccount: false,
    required: true,
    expectedRootType: 'LIABILITY' as const,
  },
  INVENTORY: {
    key: 'INVENTORY',
    label: 'Persediaan',
    description: 'Akun persediaan barang default',
    multiAccount: false,
    required: true,
    expectedRootType: 'ASSET' as const,
  },
  SALES: {
    key: 'SALES',
    label: 'Penjualan',
    description: 'Auto-credit pendapatan penjualan',
    multiAccount: false,
    required: true,
    expectedRootType: 'REVENUE' as const,
  },
  SERVICE_REVENUE: {
    key: 'SERVICE_REVENUE',
    label: 'Pendapatan Jasa',
    description: 'Default akun pendapatan jasa',
    multiAccount: false,
    required: false,
    expectedRootType: 'REVENUE' as const,
  },
  VENDOR_DEPOSIT: {
    key: 'VENDOR_DEPOSIT',
    label: 'Uang Muka Pembelian',
    description: 'Akun uang muka ke vendor/supplier',
    multiAccount: false,
    required: true,
    expectedRootType: 'ASSET' as const,
  },
  CUSTOMER_DEPOSIT: {
    key: 'CUSTOMER_DEPOSIT',
    label: 'Uang Muka Pelanggan',
    description: 'Akun uang muka dari pelanggan',
    multiAccount: false,
    required: true,
    expectedRootType: 'LIABILITY' as const,
  },
  COGS: {
    key: 'COGS',
    label: 'Beban Pokok Penjualan',
    description: 'HPP - auto-debit saat penjualan barang',
    multiAccount: false,
    required: true,
    expectedRootType: 'EXPENSE' as const,
  },
  OPENING_EQUITY: {
    key: 'OPENING_EQUITY',
    label: 'Ekuitas Saldo Awal',
    description: 'Contra account untuk import/setup saldo awal',
    multiAccount: false,
    required: true,
    expectedRootType: 'EQUITY' as const,
  },
  RETAINED_EARNINGS: {
    key: 'RETAINED_EARNINGS',
    label: 'Laba Ditahan',
    description: 'Akun tutup buku akhir tahun fiskal',
    multiAccount: false,
    required: true,
    expectedRootType: 'EQUITY' as const,
  },
  CURRENT_PROFIT: {
    key: 'CURRENT_PROFIT',
    label: 'Laba Tahun Berjalan',
    description: 'Laba tahun berjalan (computed di neraca)',
    multiAccount: false,
    required: false,
    expectedRootType: 'EQUITY' as const,
  },
} as const;

export type SystemAccountRole = keyof typeof SYSTEM_ACCOUNT_ROLES;

export const ALL_SYSTEM_ROLES = Object.keys(SYSTEM_ACCOUNT_ROLES) as SystemAccountRole[];

export const REQUIRED_SYSTEM_ROLES = ALL_SYSTEM_ROLES.filter(
  (k) => SYSTEM_ACCOUNT_ROLES[k].required,
);

// Default account numbers for seeding and data migration
export const DEFAULT_ACCOUNT_NUMBERS: Record<SystemAccountRole, string | string[]> = {
  CASH: ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5'],
  AR: '1.2.1',
  AP: '2.1.1',
  INVENTORY: '1.4.0',
  SALES: '4.1',
  SERVICE_REVENUE: '4.2',
  VENDOR_DEPOSIT: '1.3',
  CUSTOMER_DEPOSIT: '2.1.2',
  COGS: '5',
  OPENING_EQUITY: '3.1',
  RETAINED_EARNINGS: '3.2',
  CURRENT_PROFIT: '3.4',
};
