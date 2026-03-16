import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { Download, Printer, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';
import PDFDownloadButton from '../../components/PDFDownloadButton';
import { BalanceSheetPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

const AccountRow: React.FC<{ account: any; depth: number }> = ({ account, depth }) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = account.children?.length > 0;

  return (
    <>
      <div
        className={cn('flex items-center py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer')}
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center flex-1 min-w-0 gap-2">
          {hasChildren ? (
            <span className="text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          ) : (
            <span className="w-3.5 inline-block" />
          )}
          <span className="text-[11px] font-mono text-gray-400 w-16 shrink-0">{account.accountNumber}</span>
          <span className={cn('text-sm truncate', account.isGroup ? 'font-semibold text-gray-800' : 'text-gray-600')}>
            {account.name}
          </span>
        </div>
        <div className={cn('text-sm tabular-nums font-medium text-right px-4 w-36', account.balance < 0 ? 'text-red-600' : 'text-gray-900')}>
          {formatRupiah(Math.abs(account.balance))}
        </div>
      </div>
      {isOpen && hasChildren && account.children.map((child: any) => (
        <AccountRow key={child.id} account={child} depth={depth + 1} />
      ))}
    </>
  );
};

const BalanceSheet: React.FC = () => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  const { data: report, isLoading } = useQuery({
    queryKey: ['balance-sheet', date],
    queryFn: async () => {
      const r = await api.get('/reports/balance-sheet', { params: { date } });
      return r.data;
    }
  });

  const handleExport = () => {
    const flatten = (accounts: any[], section: string): object[] =>
      accounts?.flatMap((a: any): object[] => [
        { Seksi: section, 'Nama Akun': a.name, 'No. Akun': a.accountNumber, 'Saldo (Rp)': a.balance },
        ...flatten(a.children || [], section),
      ]) || [];
    const data = [
      ...flatten(report?.assets, 'Aset'),
      ...flatten(report?.liabilities, 'Kewajiban'),
      ...flatten(report?.equity, 'Ekuitas'),
    ];
    exportToExcel(data, `Neraca-${date}`);
  };

  const isBalanced = !isLoading &&
    Math.abs((report?.totalAssets || 0) - ((report?.totalLiabilities || 0) + (report?.totalEquity || 0))) <= 1;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Neraca (Balance Sheet)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Posisi keuangan aset, liabilitas, dan ekuitas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="btn-secondary text-xs py-1.5 px-3">
            <Printer size={14} /> Cetak
          </button>
          <PDFDownloadButton
            variant="button"
            fileName={`Neraca-${date}.pdf`}
            label="Export PDF"
            document={
              <BalanceSheetPDF
                company={company}
                asOf={date}
                assets={report?.assets ?? []}
                liabilities={report?.liabilities ?? []}
                equity={report?.equity ?? []}
                totalAssets={report?.totalAssets ?? 0}
                totalLiabilities={report?.totalLiabilities ?? 0}
                totalEquity={report?.totalEquity ?? 0}
              />
            }
          />
          <button onClick={handleExport} className="btn-primary text-xs py-1.5 px-3">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Per tanggal:</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Warning */}
      {!isLoading && !isBalanced && (
        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
          <span>Terdapat selisih antara total Aktiva dan Pasiva. Periksa jurnal yang tidak seimbang.</span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Assets */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="section-header flex justify-between">
            <span>Aset</span>
            <span className="font-semibold text-gray-700 tracking-normal normal-case">{formatRupiah(report?.totalAssets || 0)}</span>
          </div>
          {isLoading ? (
            <div className="py-10 text-center text-gray-300 text-sm">Memuat...</div>
          ) : (
            <div className="overflow-y-auto max-h-[500px]">
              {report?.assets?.map((a: any) => <AccountRow key={a.id} account={a} depth={0} />)}
            </div>
          )}
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Aset</span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatRupiah(report?.totalAssets || 0)}</span>
          </div>
        </div>

        {/* Liabilities + Equity */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="section-header flex justify-between">
              <span>Kewajiban</span>
              <span className="font-semibold text-gray-700 tracking-normal normal-case">{formatRupiah(report?.totalLiabilities || 0)}</span>
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-gray-300 text-sm">Memuat...</div>
            ) : (
              <div className="overflow-y-auto max-h-[240px]">
                {report?.liabilities?.map((a: any) => <AccountRow key={a.id} account={a} depth={0} />)}
              </div>
            )}
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Kewajiban</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatRupiah(report?.totalLiabilities || 0)}</span>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="section-header flex justify-between">
              <span>Ekuitas</span>
              <span className="font-semibold text-gray-700 tracking-normal normal-case">{formatRupiah(report?.totalEquity || 0)}</span>
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-gray-300 text-sm">Memuat...</div>
            ) : (
              <div className="overflow-y-auto max-h-[240px]">
                {report?.equity?.map((a: any) => <AccountRow key={a.id} account={a} depth={0} />)}
              </div>
            )}
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Ekuitas</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatRupiah(report?.totalEquity || 0)}</span>
            </div>
          </div>

          {/* Pasiva Total */}
          <div className="bg-blue-600 text-white rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="text-sm font-semibold">Total Pasiva (L + E)</span>
            <span className="text-lg font-bold tabular-nums">{formatRupiah((report?.totalLiabilities || 0) + (report?.totalEquity || 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BalanceSheet;
