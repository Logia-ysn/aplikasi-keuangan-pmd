import { useState } from 'react';
import {
  Plus, Search, Calendar as CalendarIcon,
  Loader2, FileSpreadsheet, Upload, XCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import JournalEntryModal from '../components/JournalEntryModal';
import ImportModal from '../components/ImportModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatRupiah, formatDate } from '../lib/formatters';
import { toast } from 'sonner';

export const GeneralLedger = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<{ id: string; entryNumber: string } | null>(null);
  const queryClient = useQueryClient();

  const setThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setStartDate(`${y}-${m}-01`);
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setEndDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  const { data: journals, isLoading } = useQuery({
    queryKey: ['journals', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const response = await api.get(`/journals?${params.toString()}`);
      return response.data.data ?? response.data;
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/journals/${id}/cancel`),
    onSuccess: () => {
      toast.success('Jurnal berhasil dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membatalkan jurnal.');
    },
  });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Buku Besar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola dan tinjau semua transaksi jurnal harian.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => setIsImportOpen(true)}>
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus size={15} /> Buat Jurnal Baru
          </button>
        </div>
      </div>

      {/* Info: cara kerja pembatalan jurnal */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-semibold mb-1">Cara kerja pembatalan jurnal</p>
        <p className="leading-relaxed">
          Jurnal yang dibuat otomatis dari modul lain (Pembayaran <span className="font-mono">JV-PAY-*</span>,
          Faktur Penjualan <span className="font-mono">JV-SI-*</span>, Faktur Pembelian <span className="font-mono">JV-PI-*</span>,
          HPP <span className="font-mono">JV-COGS-*</span>) <b>tidak bisa dibatalkan dari halaman Buku Besar</b>.
          Silakan batalkan dari modul asalnya agar status faktur, alokasi pembayaran, dan saldo kas/piutang ikut terupdate.
          Pembatalan dari Buku Besar hanya untuk jurnal manual.
        </p>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari referensi atau keterangan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={setThisMonth} className={cn('btn-secondary text-xs py-2 px-3', startDate && 'ring-2 ring-blue-300')}>
          <CalendarIcon size={14} /> Bulan Ini
        </button>
        {startDate && (
          <button onClick={clearDateFilter} className="btn-secondary text-xs py-2 px-3 text-red-600">
            Hapus Filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
       <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Referensi</th>
              <th>Keterangan</th>
              <th>Rincian Akun</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Kredit</th>
              <th className="text-center">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                  Memuat data transaksi...
                </td>
              </tr>
            ) : journals?.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <FileSpreadsheet className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada transaksi jurnal. Klik tombol di atas untuk memulai.</p>
                </td>
              </tr>
            ) : (
              journals?.filter((j: any) =>
                !searchTerm ||
                j.entryNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                j.narration?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((journal: any) => {
                const totalDebit = journal.items.reduce((sum: number, item: any) => sum + Number(item.debit), 0);
                const totalCredit = journal.items.reduce((sum: number, item: any) => sum + Number(item.credit), 0);
                const isCancelled = journal.status === 'Cancelled';

                return (
                  <tr key={journal.id} className={isCancelled ? 'opacity-50' : ''}>
                    <td className="text-gray-500 whitespace-nowrap">{formatDate(journal.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{journal.entryNumber}</span>
                    </td>
                    <td>
                      <p className="text-gray-700 line-clamp-1 max-w-[200px]" title={journal.narration}>{journal.narration}</p>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {journal.items.slice(0, 2).map((item: any) => (
                          <div key={item.id} className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1 py-0.5 rounded">{item.account.accountNumber}</span>
                            <span className="text-xs text-gray-600 truncate max-w-[100px]">{item.account.name}</span>
                          </div>
                        ))}
                        {journal.items.length > 2 && (
                          <span className="text-[10px] text-blue-600 font-medium">+{journal.items.length - 2} lainnya</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(totalDebit)}</td>
                    <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(totalCredit)}</td>
                    <td className="text-center">
                      <span className={cn(
                        'badge',
                        isCancelled ? 'badge-red' : journal.status === 'Submitted' ? 'badge-green' : 'badge-gray'
                      )}>
                        {isCancelled ? 'Dibatalkan' : journal.status === 'Submitted' ? 'Posted' : journal.status}
                      </span>
                    </td>
                    <td>
                      {!isCancelled && (
                        <button
                          onClick={() => setCancelTarget({ id: journal.id, entryNumber: journal.entryNumber })}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Batalkan"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
       </div>
      </div>

      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importType="journals"
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
        title="Batalkan Jurnal"
        message={`Apakah Anda yakin ingin membatalkan jurnal ${cancelTarget?.entryNumber}? Saldo akun terkait akan dikembalikan. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />
    </div>
  );
};
