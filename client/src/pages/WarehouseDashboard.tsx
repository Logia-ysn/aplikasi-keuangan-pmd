import { useQuery } from '@tanstack/react-query';
import {
  Package,
  CheckCircle,
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  PackageX,
  BarChart3,
  CheckCircle2,
  Warehouse,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatRupiah } from '../lib/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardMetrics {
  totalItems: number;
  activeItems: number;
  lowStockItems: number;
  movementsThisMonth: number;
}

interface MovementTrendItem {
  month: string;
  masuk: number;
  keluar: number;
  net: number;
}

interface CategoryItem {
  category: string;
  quantity: number;
}

interface TopItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
}

interface RecentMovement {
  id: string;
  date: string;
  itemName: string;
  movementType: 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut';
  quantity: number;
  totalValue: number | null;
}

interface ProductionStats {
  totalProduction: number;
  productionThisMonth: number;
  averageRendemen: number;
}

interface StockAlertItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
  status: 'Habis' | 'Rendah';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const movementBadge: Record<string, { label: string; className: string }> = {
  In: { label: 'Masuk', className: 'badge badge-green' },
  Out: { label: 'Keluar', className: 'badge badge-red' },
  AdjustmentIn: { label: 'Adj+', className: 'badge badge-blue' },
  AdjustmentOut: { label: 'Adj-', className: 'badge badge-orange' },
};

function stockColor(current: number, min: number): string {
  if (min <= 0) return 'bg-green-500';
  if (current > min * 2) return 'bg-green-500';
  if (current > min) return 'bg-yellow-500';
  return 'bg-red-500';
}

function stockPct(current: number, min: number): number {
  if (min <= 0) return 100;
  const target = min * 3;
  return Math.min(100, Math.round((current / target) * 100));
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('border rounded-xl p-5', className)}
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-12 flex items-center justify-center">
      <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
      <Icon size={32} className="mx-auto mb-2 opacity-30" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget 1 — KPI Cards
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  bgClass: string;
  iconClass: string;
  loading: boolean;
}

function KpiCard({ title, value, icon: Icon, bgClass, iconClass, loading }: KpiCardProps) {
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {title}
        </span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bgClass)}>
          <Icon size={16} className={iconClass} />
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      ) : (
        <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
          {formatNumber(value)}
        </p>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 2 — Movement Trend Chart
// ---------------------------------------------------------------------------

function MovementTrendChart({ data, loading }: { data: MovementTrendItem[] | undefined; loading: boolean }) {
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Tren Pergerakan Stok (6 Bulan)
        </h2>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
            Masuk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
            Keluar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
            Net
          </span>
        </div>
      </div>
      <div className="h-64">
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={BarChart3} message="Belum ada data pergerakan" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = { masuk: 'Masuk', keluar: 'Keluar', net: 'Net Change' };
                  return [formatNumber(Number(value)), labels[String(name)] ?? String(name)];
                }}
              />
              <Legend wrapperStyle={{ display: 'none' }} />
              <Bar dataKey="masuk" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="keluar" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="net"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6' }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 3 — Category Distribution
// ---------------------------------------------------------------------------

function CategoryDistribution({ data, loading }: { data: CategoryItem[] | undefined; loading: boolean }) {
  const maxQty = data ? Math.max(...data.map((c) => c.quantity), 1) : 1;

  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Distribusi Kategori
        </h2>
      </div>
      {loading ? (
        <LoadingState />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Package} message="Belum ada data kategori" />
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {data.map((cat) => (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {cat.category || 'Tanpa Kategori'}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                  {formatNumber(cat.quantity)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.round((cat.quantity / maxQty) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 4 — Top Items by Stock
// ---------------------------------------------------------------------------

function TopItemsByStock({ data, loading }: { data: TopItem[] | undefined; loading: boolean }) {
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Item Stok Terbanyak
        </h2>
      </div>
      {loading ? (
        <LoadingState />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Warehouse} message="Belum ada data item" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pb-2">Kode</th>
                <th className="text-left font-medium pb-2">Nama</th>
                <th className="text-right font-medium pb-2">Stok</th>
                <th className="text-right font-medium pb-2">Min</th>
                <th className="font-medium pb-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const current = Number(item.currentStock);
                const min = Number(item.minimumStock);
                return (
                  <tr
                    key={item.id}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2">
                      <span className="font-mono bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-primary)' }}>
                        {item.code}
                      </span>
                    </td>
                    <td className="py-2 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {item.name}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {formatNumber(current)}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {formatNumber(min)}
                    </td>
                    <td className="py-2">
                      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                          className={cn('h-2 rounded-full transition-all', stockColor(current, min))}
                          style={{ width: `${stockPct(current, min)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 5 — Recent Movements
// ---------------------------------------------------------------------------

function RecentMovements({ data, loading }: { data: RecentMovement[] | undefined; loading: boolean }) {
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Gerakan Stok Terkini
        </h2>
      </div>
      {loading ? (
        <LoadingState />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} message="Belum ada gerakan stok" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pb-2">Tanggal</th>
                <th className="text-left font-medium pb-2">Item</th>
                <th className="text-center font-medium pb-2">Tipe</th>
                <th className="text-right font-medium pb-2">Qty</th>
                <th className="text-right font-medium pb-2">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {data.map((mov) => {
                const badge = movementBadge[mov.movementType] ?? {
                  label: mov.movementType,
                  className: 'badge',
                };
                return (
                  <tr
                    key={mov.id}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                      {format(new Date(mov.date), 'dd MMM', { locale: idLocale })}
                    </td>
                    <td className="py-2 font-medium truncate max-w-[120px]" style={{ color: 'var(--color-text-primary)' }}>
                      {mov.itemName}
                    </td>
                    <td className="py-2 text-center">
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {formatNumber(mov.quantity)}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {mov.totalValue != null ? formatRupiah(Number(mov.totalValue)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 6 — Production Stats
// ---------------------------------------------------------------------------

function ProductionStatsWidget({ data, loading }: { data: ProductionStats | undefined; loading: boolean }) {
  return (
    <CardShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Statistik Produksi
        </h2>
      </div>
      {loading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState icon={Package} message="Belum ada data produksi" />
      ) : (
        <div className="space-y-4">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Total Produksi
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {formatNumber(data.totalProduction)}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Produksi Bulan Ini
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {formatNumber(data.productionThisMonth)}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Rata-rata Rendemen
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {Number(data.averageRendemen).toFixed(1)}%
            </p>
          </div>
        </div>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Widget 7 — Low Stock Alerts
// ---------------------------------------------------------------------------

function LowStockAlerts({ data, loading }: { data: StockAlertItem[] | undefined; loading: boolean }) {
  return (
    <CardShell className="lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Peringatan Stok Rendah
        </h2>
        <PackageX size={16} className="text-orange-500" />
      </div>
      {loading ? (
        <LoadingState />
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500 opacity-50" />
          <p className="text-xs">Semua stok aman</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pb-2">Kode</th>
                <th className="text-left font-medium pb-2">Nama</th>
                <th className="text-right font-medium pb-2">Stok Sekarang</th>
                <th className="text-right font-medium pb-2">Stok Min</th>
                <th className="text-center font-medium pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="border-t"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="py-2">
                    <span className="font-mono bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-primary)' }}>
                      {item.code}
                    </span>
                  </td>
                  <td className="py-2 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {item.name}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                    {formatNumber(Number(item.currentStock))} {item.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {formatNumber(Number(item.minimumStock))} {item.unit}
                  </td>
                  <td className="py-2 text-center">
                    <span
                      className={cn(
                        'badge rounded-full text-[10px] font-semibold',
                        item.status === 'Habis' ? 'badge-red' : 'badge-orange'
                      )}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WarehouseDashboard() {
  // --- Data Queries ---
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ['warehouse-metrics'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/metrics');
      return r.data;
    },
  });

  const { data: movementTrend, isLoading: trendLoading } = useQuery<MovementTrendItem[]>({
    queryKey: ['warehouse-movement-trend'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/movement-trend');
      return r.data;
    },
  });

  const { data: categoryData, isLoading: categoryLoading } = useQuery<CategoryItem[]>({
    queryKey: ['warehouse-category-distribution'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/by-category');
      return r.data;
    },
  });

  const { data: topItems, isLoading: topItemsLoading } = useQuery<TopItem[]>({
    queryKey: ['warehouse-top-items'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/top-items');
      return r.data;
    },
  });

  const { data: recentMovements, isLoading: recentLoading } = useQuery<RecentMovement[]>({
    queryKey: ['warehouse-recent-movements'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/recent-movements');
      return r.data;
    },
  });

  const { data: productionStats, isLoading: prodStatsLoading } = useQuery<ProductionStats>({
    queryKey: ['warehouse-production-stats'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/production-stats');
      return r.data;
    },
  });

  const { data: stockAlerts, isLoading: alertsLoading } = useQuery<StockAlertItem[]>({
    queryKey: ['warehouse-stock-alerts'],
    queryFn: async () => {
      const r = await api.get('/dashboard/stock-alerts');
      return r.data;
    },
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Dashboard Gudang
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Ringkasan stok, pergerakan, dan produksi
          </p>
        </div>
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {format(new Date(), 'dd MMMM yyyy', { locale: idLocale })}
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Item"
          value={metrics?.totalItems ?? 0}
          icon={Package}
          bgClass="bg-blue-50 dark:bg-blue-900/30"
          iconClass="text-blue-600"
          loading={metricsLoading}
        />
        <KpiCard
          title="Item Aktif"
          value={metrics?.activeItems ?? 0}
          icon={CheckCircle}
          bgClass="bg-green-50 dark:bg-green-900/30"
          iconClass="text-green-600"
          loading={metricsLoading}
        />
        <KpiCard
          title="Stok Menipis"
          value={metrics?.lowStockItems ?? 0}
          icon={AlertTriangle}
          bgClass="bg-red-50 dark:bg-red-900/30"
          iconClass="text-red-600"
          loading={metricsLoading}
        />
        <KpiCard
          title="Gerakan Bulan Ini"
          value={metrics?.movementsThisMonth ?? 0}
          icon={ArrowLeftRight}
          bgClass="bg-purple-50 dark:bg-purple-900/30"
          iconClass="text-purple-600"
          loading={metricsLoading}
        />
      </div>

      {/* Row 2: Movement Trend Chart (2/3) | Category Distribution (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MovementTrendChart data={movementTrend} loading={trendLoading} />
        </div>
        <CategoryDistribution data={categoryData} loading={categoryLoading} />
      </div>

      {/* Row 3: Top Items (1/2) | Recent Movements (1/2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopItemsByStock data={topItems} loading={topItemsLoading} />
        <RecentMovements data={recentMovements} loading={recentLoading} />
      </div>

      {/* Row 4: Production Stats (1/3) | Low Stock Alerts (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ProductionStatsWidget data={productionStats} loading={prodStatsLoading} />
        <LowStockAlerts data={stockAlerts} loading={alertsLoading} />
      </div>
    </div>
  );
}
