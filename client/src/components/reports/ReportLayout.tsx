import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import PDFDownloadButton from '../PDFDownloadButton';
import ReportTableSkeleton from './ReportTableSkeleton';

/* ─── Date Filters ─────────────────────────────────────────────────────────── */

const dateInputClass =
  'text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500';

type DateFilter =
  | {
      mode: 'range';
      startDate: string;
      endDate: string;
      onStartDateChange: (d: string) => void;
      onEndDateChange: (d: string) => void;
    }
  | {
      mode: 'single';
      date: string;
      onDateChange: (d: string) => void;
      label?: string;
    }
  | { mode: 'none' };

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface ReportLayoutProps {
  title: string;
  subtitle: string;
  backTo?: string;
  dateFilter?: DateFilter;

  // Export actions
  onPrint?: () => void;
  pdfDocument?: React.ReactElement;
  pdfFileName?: string;
  onExportExcel?: () => void;

  // State
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;

  // Optional alert (e.g. unbalanced warning)
  alert?: React.ReactNode;

  // Optional extra controls rendered between date filter and content
  extraControls?: React.ReactNode;

  children: React.ReactNode;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

const ReportLayout: React.FC<ReportLayoutProps> = ({
  title,
  subtitle,
  backTo = '/reports',
  dateFilter,
  onPrint,
  pdfDocument,
  pdfFileName,
  onExportExcel,
  isLoading,
  isError,
  onRetry,
  alert,
  extraControls,
  children,
}) => (
  <div className="space-y-5 pb-8">
    {/* Back link */}
    <Link
      to={backTo}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors -mb-2"
    >
      <ArrowLeft size={14} /> Kembali ke Laporan
    </Link>

    {/* Header */}
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {(onPrint || true) && (
          <button
            onClick={onPrint || (() => window.print())}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            <Printer size={14} /> Cetak
          </button>
        )}
        {pdfDocument && (
          <PDFDownloadButton
            variant="button"
            fileName={pdfFileName || 'report.pdf'}
            label="Export PDF"
            document={pdfDocument}
          />
        )}
        {onExportExcel && (
          <button onClick={onExportExcel} className="btn-primary text-xs py-1.5 px-3">
            <Download size={14} /> Export Excel
          </button>
        )}
      </div>
    </div>

    {/* Date Filter */}
    {dateFilter && dateFilter.mode === 'range' && (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Periode:</span>
        <input
          type="date"
          value={dateFilter.startDate}
          onChange={(e) => dateFilter.onStartDateChange(e.target.value)}
          className={dateInputClass}
        />
        <span className="text-gray-300">—</span>
        <input
          type="date"
          value={dateFilter.endDate}
          onChange={(e) => dateFilter.onEndDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
    )}
    {dateFilter && dateFilter.mode === 'single' && (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">{dateFilter.label || 'Per tanggal:'}</span>
        <input
          type="date"
          value={dateFilter.date}
          onChange={(e) => dateFilter.onDateChange(e.target.value)}
          className={dateInputClass}
        />
      </div>
    )}

    {/* Alert */}
    {alert}

    {/* Extra controls */}
    {extraControls}

    {/* Content */}
    {isError ? (
      <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
        <p className="text-sm text-red-600 mb-3">Gagal memuat laporan.</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-primary text-xs">
            Coba Lagi
          </button>
        )}
      </div>
    ) : isLoading ? (
      <ReportTableSkeleton />
    ) : (
      children
    )}
  </div>
);

export default ReportLayout;
