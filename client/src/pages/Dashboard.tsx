import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const MetricCard = React.memo(function MetricCard({ title, value, icon: Icon, loading }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Icon size={16} className="text-blue-600" />
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      ) : (
        <p className="text-2xl font-semibold text-gray-900 tabular-nums">{formatRupiah(value)}</p>
      )}
    </div>
  );
});

export const Dashboard = () => {
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => { const r = await api.get('/dashboard/metrics'); return r.data; }
  });

  const { data: chartData, isLoading: isChartsLoading } = useQuery({
    queryKey: ['dashboard-charts'],
    queryFn: async () => { const r = await api.get('/dashboard/charts'); return r.data; }
  });

  const { data: recentActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const r = await api.get('/payments');
      const list = r.data.data ?? r.data;
      return Array.isArray(list) ? list.slice(0, 6) : [];
    }
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ringkasan keuangan PT Pangan Masa Depan</p>
        </div>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Kas & Bank" value={metrics?.cashBalance || 0} loading={isMetricsLoading} icon={Wallet} />
        <MetricCard title="Piutang Usaha" value={metrics?.accountsReceivable || 0} loading={isMetricsLoading} icon={TrendingUp} />
        <MetricCard title="Hutang Usaha" value={metrics?.accountsPayable || 0} loading={isMetricsLoading} icon={TrendingDown} />
        <MetricCard title="Laba Bersih (Bulan Ini)" value={metrics?.netProfit || 0} loading={isMetricsLoading} icon={CreditCard} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Pendapatan vs Beban</h2>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                Pendapatan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block" />
                Beban
              </span>
            </div>
          </div>
          <div className="h-64">
            {isChartsLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-300" size={28} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => v === 0 ? '0' : `${Math.round(v / 1000000)}jt`} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(value: any) => [formatRupiah(value), '']}
                  />
                  <Area type="monotone" dataKey="pendapatan" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" dot={false} />
                  <Area type="monotone" dataKey="beban" stroke="#9ca3af" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Aktivitas Terakhir</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Live</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto">
            {recentActivities?.length ? recentActivities.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  a.paymentType === 'Receive' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                )}>
                  {a.paymentType === 'Receive' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{a.paymentNumber}</p>
                  <p className="text-[11px] text-gray-400">{new Date(a.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className={cn("text-xs font-semibold tabular-nums", a.paymentType === 'Receive' ? "text-green-600" : "text-red-500")}>
                  {a.paymentType === 'Receive' ? '+' : '-'}{new Intl.NumberFormat('id-ID').format(a.amount)}
                </span>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full py-8 text-gray-300 gap-3">
                <BarChart3 size={36} />
                <p className="text-xs text-gray-400">Belum ada aktivitas</p>
              </div>
            )}
          </div>

          <a href="/payments" className="block mt-4 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors text-center pt-3 border-t border-gray-100">
            Lihat semua →
          </a>
        </div>
      </div>
    </div>
  );
};
