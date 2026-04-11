import { useState, useCallback, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

// Widgets
import KPICards from '../components/widgets/KPICards';
import RevenueChart from '../components/widgets/RevenueChart';
import RecentActivities from '../components/widgets/RecentActivities';
import TopCustomers from '../components/widgets/TopCustomers';
import OverdueInvoices from '../components/widgets/OverdueInvoices';
import ExpenseBreakdown from '../components/widgets/ExpenseBreakdown';
import StockAlert from '../components/widgets/StockAlert';
import WarehouseKPICards from '../components/widgets/WarehouseKPICards';
import MovementTrendChart from '../components/widgets/MovementTrendChart';
import CategoryDistribution from '../components/widgets/CategoryDistribution';
import TopItemsByStock from '../components/widgets/TopItemsByStock';
import RecentMovements from '../components/widgets/RecentMovements';
import ProductionStatsWidget from '../components/widgets/ProductionStatsWidget';
import FinancialRatios from '../components/widgets/FinancialRatios';
import MonthlyProfitChart from '../components/widgets/MonthlyProfitChart';
import CashFlowChart from '../components/widgets/CashFlowChart';
import AgingSummary from '../components/widgets/AgingSummary';
import DashboardSettings, { DEFAULT_WIDGETS, type WidgetConfig } from '../components/DashboardSettings';

// Widget IDs only visible to finance roles (not StaffProduksi)
const FINANCE_WIDGET_IDS = new Set([
  'revenue-chart', 'recent-activities', 'top-customers',
  'overdue-invoices', 'expense-breakdown',
  'financial-ratios', 'monthly-profit', 'cash-flow-summary', 'aging-summary',
]);

const STORAGE_KEY = 'dashboard-widgets';

function loadWidgetPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveWidgetPrefs(prefs: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const Dashboard = () => {
  const company = useCompanySettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [widgetPrefs, setWidgetPrefs] = useState<Record<string, boolean>>(loadWidgetPrefs);

  const userRole = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; }
    catch { return null; }
  }, []);
  const isStaffProduksi = userRole === 'StaffProduksi';

  const availableWidgets = useMemo(
    () => isStaffProduksi
      ? DEFAULT_WIDGETS.filter((w) => !FINANCE_WIDGET_IDS.has(w.id))
      : DEFAULT_WIDGETS,
    [isStaffProduksi]
  );

  const widgets: WidgetConfig[] = useMemo(
    () =>
      availableWidgets.map((w) => ({
        ...w,
        enabled: widgetPrefs[w.id] !== undefined ? widgetPrefs[w.id] : w.enabled,
      })),
    [availableWidgets, widgetPrefs]
  );

  const isEnabled = useCallback(
    (id: string) => {
      const w = widgets.find((w) => w.id === id);
      return w?.enabled ?? true;
    },
    [widgets]
  );

  const handleToggle = useCallback(
    (id: string) => {
      setWidgetPrefs((prev) => {
        const next = { ...prev, [id]: !(prev[id] !== undefined ? prev[id] : true) };
        saveWidgetPrefs(next);
        return next;
      });
    },
    []
  );

  // Data queries
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const r = await api.get('/dashboard/metrics');
      return r.data;
    },
  });

  const { data: chartData, isLoading: isChartsLoading } = useQuery({
    queryKey: ['dashboard-charts'],
    queryFn: async () => {
      const r = await api.get('/dashboard/charts');
      return r.data;
    },
  });

  const { data: recentActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const r = await api.get('/payments');
      const list = r.data.data ?? r.data;
      return Array.isArray(list) ? list.slice(0, 6) : [];
    },
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {isStaffProduksi ? 'Dashboard Gudang & Produksi' : 'Dashboard'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {isStaffProduksi
              ? `Ringkasan stok, gudang & produksi ${company?.companyName || 'perusahaan Anda'}`
              : `Ringkasan keuangan ${company?.companyName || 'perusahaan Anda'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            style={{ borderColor: 'var(--color-border)' }}
            title="Konfigurasi Dashboard"
          >
            <Settings2 size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>

      {/* ── Finance Dashboard (non-StaffProduksi) ── */}
      {!isStaffProduksi && (
        <>
          {/* KPI Cards (always shown) */}
          <KPICards data={metrics} loading={isMetricsLoading} />

          {/* Widget Grid: Revenue Chart + Recent Activities / Top Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {isEnabled('revenue-chart') && (
              <div className="lg:col-span-2">
                <RevenueChart data={chartData} loading={isChartsLoading} />
              </div>
            )}
            {isEnabled('recent-activities') && (
              <RecentActivities data={recentActivities || null} />
            )}
          </div>

          {/* Second row of widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isEnabled('top-customers') && <TopCustomers />}
            {isEnabled('overdue-invoices') && <OverdueInvoices />}
            {isEnabled('expense-breakdown') && <ExpenseBreakdown />}
          </div>

          {/* Third row: Financial insights */}
          {(isEnabled('monthly-profit') || isEnabled('cash-flow-summary') || isEnabled('financial-ratios') || isEnabled('aging-summary')) && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {isEnabled('monthly-profit') && (
                  <div className="lg:col-span-2">
                    <MonthlyProfitChart />
                  </div>
                )}
                {isEnabled('cash-flow-summary') && <CashFlowChart />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isEnabled('financial-ratios') && <FinancialRatios />}
                {isEnabled('aging-summary') && <AgingSummary />}
              </div>
            </>
          )}
        </>
      )}

      {/* Stock Alert */}
      {isEnabled('stock-alert') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StockAlert />
        </div>
      )}

      {/* ── Warehouse Section ── */}
      {(isEnabled('warehouse-kpi') || isEnabled('movement-trend') || isEnabled('category-distribution') || isEnabled('top-items') || isEnabled('recent-movements') || isEnabled('production-stats')) && (
        <>
          {/* Section Divider (only for non-StaffProduksi since it's the main content for them) */}
          {!isStaffProduksi && (
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Gudang & Inventori
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
            </div>
          )}

          {isEnabled('warehouse-kpi') && <WarehouseKPICards />}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {isEnabled('movement-trend') && (
              <div className="lg:col-span-2">
                <MovementTrendChart />
              </div>
            )}
            {isEnabled('category-distribution') && <CategoryDistribution />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isEnabled('top-items') && <TopItemsByStock />}
            {isEnabled('recent-movements') && <RecentMovements />}
          </div>

          {isEnabled('production-stats') && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ProductionStatsWidget />
            </div>
          )}
        </>
      )}

      {/* Dashboard Settings Modal */}
      <DashboardSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        widgets={widgets}
        onToggle={handleToggle}
      />
    </div>
  );
};
