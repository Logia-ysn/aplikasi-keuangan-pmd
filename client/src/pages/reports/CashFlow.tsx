import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Download, TrendingUp, Building2, Banknote, ArrowRightLeft } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../../lib/utils';
import PDFDownloadButton from '../../components/PDFDownloadButton';
import { CashFlowPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

interface CashFlowData {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  details: {
    operating: { name: string; amount: number }[];
    investing: { name: string; amount: number }[];
    financing: { name: string; amount: number }[];
  };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

const CashFlow: React.FC = () => {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ['report-cash-flow', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/cash-flow', { params: { startDate, endDate } });
      return res.data;
    }
  });

  const sections = [
    { key: 'operating', label: 'Aktivitas Operasi', icon: TrendingUp, value: data?.operating || 0, items: data?.details?.operating || [] },
    { key: 'investing', label: 'Aktivitas Investasi', icon: Building2, value: data?.investing || 0, items: data?.details?.investing || [] },
    { key: 'financing', label: 'Aktivitas Pendanaan', icon: Banknote, value: data?.financing || 0, items: data?.details?.financing || [] },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Laporan Arus Kas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pergerakan kas masuk dan keluar perusahaan</p>
        </div>
        <div className="flex gap-2">
          <PDFDownloadButton
            variant="button"
            fileName={`Arus-Kas-${startDate}-sd-${endDate}.pdf`}
            label="Export PDF"
            document={
              <CashFlowPDF
                company={company}
                period={`${startDate} s/d ${endDate}`}
                operating={data?.operating ?? 0}
                investing={data?.investing ?? 0}
                financing={data?.financing ?? 0}
                netChange={data?.netChange ?? 0}
                operatingItems={(data?.details?.operating ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
                investingItems={(data?.details?.investing ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
                financingItems={(data?.details?.financing ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
              />
            }
          />
          <button className="btn-secondary text-xs py-1.5 px-3">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Periode:</span>
        <input
          type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-300">—</span>
        <input
          type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((s) => (
          <div key={s.key} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                <s.icon size={14} className="text-gray-500" />
              </div>
              <span className="text-xs text-gray-500 font-medium">{s.label}</span>
            </div>
            <p className={cn('text-lg font-semibold tabular-nums', s.value >= 0 ? 'text-green-700' : 'text-red-600')}>
              {formatCurrency(s.value)}
            </p>
          </div>
        ))}
        {/* Net Change */}
        <div className="bg-blue-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
              <ArrowRightLeft size={14} className="text-white" />
            </div>
            <span className="text-xs font-medium text-blue-100">Net Change</span>
          </div>
          <p className={cn('text-lg font-semibold tabular-nums', (data?.netChange || 0) >= 0 ? 'text-white' : 'text-red-200')}>
            {formatCurrency(data?.netChange || 0)}
          </p>
        </div>
      </div>

      {/* Detail Sections */}
      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">Memuat laporan...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {sections.map((s) => (
            <div key={s.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="section-header flex items-center gap-2">
                <s.icon size={13} />
                {s.label}
              </div>
              <div className="divide-y divide-gray-50 px-4">
                {s.items.length > 0 ? s.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-3">
                    <span className="text-sm text-gray-600">{item.name}</span>
                    <span className={cn('text-sm font-medium tabular-nums', item.amount >= 0 ? 'text-green-600' : 'text-red-500')}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                )) : (
                  <p className="py-8 text-center text-sm text-gray-300">Tidak ada pergerakan kas</p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subtotal</span>
                <span className={cn('text-sm font-semibold tabular-nums', s.value >= 0 ? 'text-green-600' : 'text-red-500')}>
                  {formatCurrency(s.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CashFlow;
