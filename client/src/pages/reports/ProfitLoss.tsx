import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import {
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';
import PDFDownloadButton from '../../components/PDFDownloadButton';
import { ProfitLossPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

const AccountRow: React.FC<{ account: any; depth: number }> = ({ account, depth }) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = account.children?.length > 0;

  return (
    <>
      <div
        className={cn(
          'flex items-center py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer',
          account.isGroup ? 'bg-gray-50/60' : ''
        )}
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center flex-1 min-w-0 gap-2">
          {hasChildren ? (
            <span className="text-gray-400">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-3.5 inline-block" />
          )}
          <span className="text-[11px] font-mono text-gray-400 w-16 shrink-0">{account.accountNumber}</span>
          <span className={cn('text-sm truncate', account.isGroup ? 'font-semibold text-gray-800' : 'text-gray-600')}>
            {account.name}
          </span>
        </div>
        <div className={cn('text-sm tabular-nums font-medium text-right px-6 w-44', account.balance < 0 ? 'text-red-600' : 'text-gray-900')}>
          {formatRupiah(Math.abs(account.balance))}
        </div>
      </div>
      {isOpen && hasChildren && account.children.map((child: any) => (
        <AccountRow key={child.id} account={child} depth={depth + 1} />
      ))}
    </>
  );
};

const ProfitLoss: React.FC = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  const { data: report, isLoading } = useQuery({
    queryKey: ['profit-loss', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/reports/profit-loss', { params: { startDate, endDate } });
      return r.data;
    }
  });

  const handleExport = () => {
    const flat = [
      ...(report?.revenue?.flatMap((r: any) => [{ Seksi: 'Pendapatan', 'Nama Akun': r.name, 'Saldo (Rp)': r.balance }]) || []),
      ...(report?.expense?.flatMap((e: any) => [{ Seksi: 'Beban', 'Nama Akun': e.name, 'Saldo (Rp)': e.balance }]) || []),
      { Seksi: '---', 'Nama Akun': 'LABA BERSIH', 'Saldo (Rp)': report?.netProfit || 0 },
    ];
    exportToExcel(flat, `Laba-Rugi-${startDate}-sd-${endDate}`);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Laporan Laba Rugi</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performa finansial PT Pangan Masa Depan</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="btn-secondary text-xs py-1.5 px-3">
            <Printer size={14} /> Cetak
          </button>
          <PDFDownloadButton
            variant="button"
            fileName={`Laba-Rugi-${startDate}-sd-${endDate}.pdf`}
            label="Export PDF"
            document={
              <ProfitLossPDF
                company={company}
                period={`${startDate} s/d ${endDate}`}
                revenue={report?.revenue ?? []}
                expense={report?.expense ?? []}
                totalRevenue={report?.totalRevenue ?? 0}
                totalExpense={report?.totalExpense ?? 0}
                netProfit={report?.netProfit ?? 0}
              />
            }
          />
          <button onClick={handleExport} className="btn-primary text-xs py-1.5 px-3">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Periode:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-300">—</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Pendapatan', value: report?.totalRevenue || 0, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Beban', value: report?.totalExpense || 0, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Laba Bersih', value: report?.netProfit || 0, icon: BarChart3, color: (report?.netProfit || 0) >= 0 ? 'text-blue-600' : 'text-red-600', bg: 'bg-blue-50' },
        ].map((m, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', m.bg)}>
                <m.icon size={14} className={m.color} />
              </div>
              <span className="text-xs text-gray-500 font-medium">{m.label}</span>
            </div>
            <p className={cn('text-xl font-semibold tabular-nums', m.color)}>
              {m.label === 'Laba Bersih' && m.value < 0 ? '- ' : ''}{formatRupiah(Math.abs(m.value))}
            </p>
          </div>
        ))}
      </div>

      {/* Account Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Mengkalkulasi laporan...</div>
        ) : (
          <>
            {/* Revenue */}
            <div className="section-header">I. Pendapatan</div>
            {report?.revenue?.length > 0 ? report.revenue.map((a: any) => (
              <AccountRow key={a.id} account={a} depth={0} />
            )) : (
              <div className="py-6 text-center text-gray-400 text-sm border-b border-gray-50">Tidak ada data pendapatan</div>
            )}
            <div className="flex justify-between items-center px-4 py-3 bg-green-50/60 border-b border-gray-100">
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Total Pendapatan</span>
              <span className="text-sm font-semibold text-green-700 tabular-nums pr-6">{formatRupiah(report?.totalRevenue || 0)}</span>
            </div>

            {/* Expenses */}
            <div className="section-header mt-2">II. Beban-Beban</div>
            {report?.expense?.length > 0 ? report.expense.map((a: any) => (
              <AccountRow key={a.id} account={a} depth={0} />
            )) : (
              <div className="py-6 text-center text-gray-400 text-sm border-b border-gray-50">Tidak ada data beban</div>
            )}
            <div className="flex justify-between items-center px-4 py-3 bg-red-50/60 border-b border-gray-100">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Total Beban</span>
              <span className="text-sm font-semibold text-red-700 tabular-nums pr-6">{formatRupiah(Math.abs(report?.totalExpense || 0))}</span>
            </div>

            {/* Net Profit */}
            <div className={cn(
              'flex justify-between items-center px-4 py-4',
              (report?.netProfit || 0) >= 0 ? 'bg-blue-600' : 'bg-red-600'
            )}>
              <span className="text-sm font-semibold text-white uppercase tracking-wide">Laba (Rugi) Bersih</span>
              <span className="text-lg font-bold text-white tabular-nums pr-6">{formatRupiah(report?.netProfit || 0)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfitLoss;
