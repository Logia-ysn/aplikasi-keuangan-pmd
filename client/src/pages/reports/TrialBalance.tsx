import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { Search, Download, Printer, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import PDFDownloadButton from '../../components/PDFDownloadButton';
import { TrialBalancePDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);

const TrialBalance: React.FC = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const company = useCompanyPDF();

  const { data: report, isLoading } = useQuery({
    queryKey: ['trial-balance', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/reports/trial-balance', { params: { startDate, endDate } });
      return r.data;
    }
  });

  const filtered = Array.isArray(report)
    ? report.filter((item: any) =>
        (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (item.accountNumber || '').includes(searchTerm)
      )
    : [];

  const totalDebit = filtered.reduce((s: number, i: any) => s + i.debit, 0);
  const totalCredit = filtered.reduce((s: number, i: any) => s + i.credit, 0);
  const isUnbalanced = !isLoading && Math.abs(totalDebit - totalCredit) > 0.01;

  const handleExport = () => {
    const data = filtered.map((item: any) => ({
      'No. Akun': item.accountNumber,
      'Nama Akun': item.name,
      'Tipe': item.accountType,
      'Debit (Rp)': item.debit,
      'Kredit (Rp)': item.credit,
      'Saldo (Rp)': item.balance,
    }));
    exportToExcel(data, `Neraca-Saldo-${startDate}-sd-${endDate}`);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Neraca Saldo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Verifikasi keseimbangan debit-kredit per akun</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-secondary text-xs py-1.5 px-3">
            <Printer size={14} /> Cetak
          </button>
          <PDFDownloadButton
            variant="button"
            fileName={`Neraca-Saldo-${startDate}-sd-${endDate}.pdf`}
            label="Export PDF"
            document={
              <TrialBalancePDF
                company={company}
                period={`${startDate} s/d ${endDate}`}
                rows={filtered.map((item: any) => ({
                  accountNumber: item.accountNumber,
                  accountName: item.name,
                  debit: Number(item.debit),
                  credit: Number(item.credit),
                }))}
              />
            }
          />
          <button onClick={handleExport} className="btn-primary text-xs py-1.5 px-3">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Unbalanced warning */}
      {isUnbalanced && (
        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
          <span>
            Neraca tidak seimbang! Selisih: <strong>{formatCurrency(Math.abs(totalDebit - totalCredit))}</strong>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari akun atau nomor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Periode:</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-300">—</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-24">No. Akun</th>
              <th>Nama Akun</th>
              <th className="text-right pr-4">Debit</th>
              <th className="text-right pr-4">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="py-16 text-center text-gray-400">Memuat data...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="py-16 text-center text-gray-400">Tidak ada data ditemukan</td></tr>
            ) : (
              filtered.map((item: any) => (
                <tr key={item.id}>
                  <td className="font-mono text-xs text-gray-400">{item.accountNumber}</td>
                  <td className="font-medium text-gray-800">{item.name}</td>
                  <td className={cn('text-right pr-4 tabular-nums', item.debit > 0 ? 'text-blue-600' : 'text-gray-300')}>
                    {item.debit > 0 ? formatCurrency(item.debit) : '—'}
                  </td>
                  <td className={cn('text-right pr-4 tabular-nums', item.credit > 0 ? 'text-gray-700' : 'text-gray-300')}>
                    {item.credit > 0 ? formatCurrency(item.credit) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-blue-600 text-white">
              <td colSpan={2} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Total Saldo</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(totalDebit)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums pr-4">{formatCurrency(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default TrialBalance;
