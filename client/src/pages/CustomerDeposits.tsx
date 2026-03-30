import { useState, useMemo } from 'react';
import { Search, Wallet, Loader2, CheckCircle2, DollarSign, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import CustomerDepositModal from '../components/CustomerDepositModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const CustomerDeposits = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.success('Deposit berhasil dibatalkan.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan deposit.'),
  });

  const { data: deposits, isLoading } = useQuery({
    queryKey: ['customer-deposits'],
    queryFn: async () => {
      const res = await api.get('/customer-deposits');
      return res.data.data ?? res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!deposits) return [];
    if (!searchTerm) return deposits;
    const q = searchTerm.toLowerCase();
    return deposits.filter((d: any) =>
      d.paymentNumber?.toLowerCase().includes(q) ||
      d.party?.name?.toLowerCase().includes(q)
    );
  }, [deposits, searchTerm]);

  const summary = useMemo(() => {
    if (!deposits) return { totalDeposit: 0, totalApplied: 0, totalRemaining: 0, activeCount: 0 };
    let totalDeposit = 0, totalApplied = 0, totalRemaining = 0, activeCount = 0;
    for (const d of deposits) {
      if (d.status === 'Cancelled') continue;
      totalDeposit += Number(d.amount);
      totalApplied += d.totalApplied ?? 0;
      totalRemaining += d.remaining ?? 0;
      if ((d.remaining ?? 0) > 0.01) activeCount++;
    }
    return { totalDeposit, totalApplied, totalRemaining, activeCount };
  }, [deposits]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Uang Muka Pelanggan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola deposit dan uang muka dari pelanggan.</p>
        </div>
        <button className="btn-primary bg-teal-500 hover:bg-teal-600 self-start" onClick={() => setIsModalOpen(true)}>
          <Wallet size={15} /> Buat Uang Muka
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Wallet size={16} className="text-teal-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Deposit</p>
              <p className="text-lg font-bold text-gray-900 font-mono tabular-nums">{formatRupiah(summary.totalDeposit)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sudah Digunakan</p>
              <p className="text-lg font-bold text-green-600 font-mono tabular-nums">{formatRupiah(summary.totalApplied)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sisa Deposit</p>
              <p className="text-lg font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(summary.totalRemaining)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Deposit Aktif</p>
              <p className="text-lg font-bold text-orange-500">{summary.activeCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor deposit atau pelanggan..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">No. Dokumen</th>
                <th scope="col">Pelanggan</th>
                <th scope="col" className="text-right">Jumlah Deposit</th>
                <th scope="col" className="text-right">Digunakan</th>
                <th scope="col" className="text-right">Sisa</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="text-center w-20">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data uang muka...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada uang muka pelanggan.</p>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Buat uang muka pertama
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((dep: any) => {
                  const remaining = dep.remaining ?? 0;
                  const totalApplied = dep.totalApplied ?? 0;
                  const isCancelled = dep.status === 'Cancelled';
                  const isFullyUsed = remaining < 0.01 && !isCancelled;

                  return (
                    <tr key={dep.id}>
                      <td className="text-gray-500 whitespace-nowrap">{formatDate(dep.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{dep.paymentNumber}</span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{dep.party?.name ?? '—'}</span>
                      </td>
                      <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(Number(dep.amount))}</td>
                      <td className="text-right font-mono text-green-600 tabular-nums">{formatRupiah(totalApplied)}</td>
                      <td className="text-right">
                        <span className={cn('font-mono font-medium tabular-nums', remaining > 0.01 ? 'text-teal-600' : 'text-gray-400')}>
                          {formatRupiah(remaining)}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          'badge',
                          isCancelled ? 'badge-red' :
                          isFullyUsed ? 'badge-green' :
                          totalApplied > 0 ? 'badge-yellow' : 'badge-blue'
                        )}>
                          {isCancelled ? 'Dibatalkan' :
                           isFullyUsed ? 'Terpakai' :
                           totalApplied > 0 ? 'Sebagian' : 'Aktif'}
                        </span>
                      </td>
                      <td className="text-center">
                        {!isCancelled && (
                          <button
                            onClick={() => setCancelId(dep.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Batalkan deposit"
                          >
                            <XCircle size={15} />
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

      <CustomerDepositModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <ConfirmDialog
        open={cancelId !== null}
        title="Batalkan Deposit Pelanggan"
        message="Yakin ingin membatalkan deposit ini? Saldo akan dikembalikan ke akun kas/bank asal. Deposit yang sudah dialokasikan ke invoice harus dibatalkan alokasinya terlebih dahulu."
        confirmLabel="Batalkan Deposit"
        variant="danger"
        onConfirm={() => { if (cancelId) cancelMutation.mutate(cancelId); setCancelId(null); }}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
};
