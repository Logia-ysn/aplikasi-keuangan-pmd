import { PrismaClient, AccountType, RootType, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Keuangan...');

  // 1. Seed Fiscal Year
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { name: '2026' },
    update: {},
    create: {
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });
  console.log('- Created Fiscal Year: 2026');

  // 2. Seed Users
  const hashedPassword = await bcrypt.hash('Admin123!', 12);

  const users = [
    { username: 'admin',    fullName: 'Administrator',   email: 'admin@keuangan.local',    role: UserRole.Admin },
    { username: 'staff',    fullName: 'Staff Keuangan',  email: 'staff@keuangan.local',    role: UserRole.Accountant },
    { username: 'produksi', fullName: 'Staff Produksi',  email: 'produksi@keuangan.local', role: UserRole.StaffProduksi },
    { username: 'viewer',   fullName: 'Viewer',          email: 'viewer@keuangan.local',   role: UserRole.Viewer },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { username: u.username, fullName: u.fullName, role: u.role, passwordHash: hashedPassword },
      create: {
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        passwordHash: hashedPassword,
        role: u.role,
      },
    });
    console.log(`- Upserted User: ${u.email} (${u.role})`);
  }

  // 3. Seed COA
  const coa = [
    // ASSET
    { accountNumber: '1', name: 'Aset', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: true },
    { accountNumber: '1.1', name: 'Aset Lancar', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.1.1', name: 'Kas Utama', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.2', name: 'Bank BCA', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.3', name: 'Piutang Usaha', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.4', name: 'Persediaan Gabah', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.5', name: 'Persediaan Beras', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.2', name: 'Aset Lancar Lainnya', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.2.1', name: 'Uang Muka Vendor', accountType: AccountType.ASSET, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },

    // LIABILITY
    { accountNumber: '2', name: 'Liabilitas', accountType: AccountType.LIABILITY, rootType: RootType.LIABILITY, isGroup: true },
    { accountNumber: '2.1', name: 'Liabilitas Jangka Pendek', accountType: AccountType.LIABILITY, rootType: RootType.LIABILITY, isGroup: true, parentNumber: '2' },
    { accountNumber: '2.1.1', name: 'Hutang Usaha', accountType: AccountType.LIABILITY, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.1' },
    { accountNumber: '2.1.2', name: 'Hutang Gaji', accountType: AccountType.LIABILITY, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.1' },

    // EQUITY
    { accountNumber: '3', name: 'Ekuitas', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: true },
    { accountNumber: '3.1', name: 'Modal Disetor', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },
    { accountNumber: '3.2', name: 'Laba Ditahan', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: true, parentNumber: '3' },
    { accountNumber: '3.2.1', name: 'Laba Ditahan Akumulasi', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3.2' },
    { accountNumber: '3.3', name: 'Laba Periode Berjalan', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: true, parentNumber: '3' },
    { accountNumber: '3.3.1', name: 'Laba Tahun Berjalan', accountType: AccountType.EQUITY, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3.3' },

    // REVENUE
    { accountNumber: '4', name: 'Pendapatan', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: true },
    { accountNumber: '4.1', name: 'Penjualan Beras', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: true, parentNumber: '4' },
    { accountNumber: '4.1.1', name: 'Penjualan Beras Premium', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4.1' },
    { accountNumber: '4.2', name: 'Penjualan Sekam', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },
    { accountNumber: '4.3', name: 'Penjualan Bekatul', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },
    { accountNumber: '4.4', name: 'Pendapatan Jasa', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: true, parentNumber: '4' },
    { accountNumber: '4.4.1', name: 'Pendapatan Jasa Giling', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4.4' },
    { accountNumber: '4.4.2', name: 'Pendapatan Jasa Kirim', accountType: AccountType.REVENUE, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4.4' },

    // EXPENSE
    { accountNumber: '5', name: 'Beban', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: true },
    { accountNumber: '5.1', name: 'Harga Pokok Penjualan', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: true, parentNumber: '5' },
    { accountNumber: '5.1.1', name: 'Pembelian Gabah', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '5.1' },
    { accountNumber: '5.2', name: 'Beban Operasional', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: true, parentNumber: '5' },
    { accountNumber: '5.2.1', name: 'Listrik & Air Pabrik', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '5.2' },
    { accountNumber: '5.2.2', name: 'Gaji Karyawan', accountType: AccountType.EXPENSE, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '5.2' },
  ];

  const numberToId: Record<string, string> = {};

  for (const item of coa) {
    const parentId = item.parentNumber ? numberToId[item.parentNumber] : null;

    const account = await prisma.account.upsert({
      where: { accountNumber: item.accountNumber },
      update: { isGroup: item.isGroup },
      create: {
        accountNumber: item.accountNumber,
        name: item.name,
        accountType: item.accountType,
        rootType: item.rootType,
        isGroup: item.isGroup,
        parentId: parentId,
      },
    });

    numberToId[item.accountNumber] = account.id;
    console.log(`- Created account: ${account.accountNumber} ${account.name}`);
  }

  // 4. Seed Service Items
  const serviceItemsData = [
    { code: 'JSG-001', name: 'Jasa Giling Padi', unit: 'Ton', defaultRate: 500000, accountNumber: '4.4.1' },
    { code: 'JSK-001', name: 'Jasa Kirim', unit: 'Trip', defaultRate: 250000, accountNumber: '4.4.2' },
  ];

  for (const si of serviceItemsData) {
    const accountId = numberToId[si.accountNumber];
    if (!accountId) {
      console.log(`- Skipped service item ${si.code}: account ${si.accountNumber} not found`);
      continue;
    }
    await prisma.serviceItem.upsert({
      where: { code: si.code },
      update: { name: si.name, unit: si.unit, defaultRate: si.defaultRate, accountId },
      create: {
        code: si.code,
        name: si.name,
        unit: si.unit,
        defaultRate: si.defaultRate,
        accountId,
      },
    });
    console.log(`- Upserted Service Item: ${si.code} ${si.name}`);
  }

  // 5. Seed Company Settings
  await prisma.companySettings.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      slug: 'default',
      companyName: 'Perusahaan Anda',
      address: '',
      phone: '',
      email: '',
      taxId: '',
      defaultCurrency: 'IDR',
    },
  });
  console.log('- Created default Company Settings');

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
