import React, { useState, useCallback, useMemo } from 'react';
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
import DashboardSettings, { DEFAULT_WIDGETS, type WidgetConfig } from '../components/DashboardSettings';

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

  const widgets: WidgetConfig[] = useMemo(
    () =>
      DEFAULT_WIDGETS.map((w) => ({
        ...w,
        enabled: widgetPrefs[w.id] !== undefined ? widgetPrefs[w.id] : w.enabled,
      })),
    [widgetPrefs]
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
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Ringkasan keuangan {company?.companyName || 'perusahaan Anda'}
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

      {/* Third row */}
      {isEnabled('stock-alert') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StockAlert />
        </div>
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
