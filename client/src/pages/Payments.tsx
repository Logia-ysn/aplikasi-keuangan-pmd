import { useState } from 'react';
import { Search, MoreHorizontal, CreditCard, Loader2, TrendingDown, TrendingUp, ArrowRightLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import PaymentModal from '../components/PaymentModal';
import TransferModal from '../components/TransferModal';
import ExpenseModal from '../components/ExpenseModal';

export const Payments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const response = await api.get('/payments');
      return response.data.data ?? response.data;
    }
  });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Bank & Kas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pantau mutasi kas, pembayaran vendor, dan pelunasan piutang.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
            onClick={() => setIsTransferOpen(true)}
          >
            <ArrowRightLeft size={15} /> Pinbuk
          </button>
          <button className="btn-primary" onClick={() => setIsReceiveOpen(true)}>
            <TrendingDown size={15} /> Terima Pembayaran
          </button>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            onClick={() => setIsExpenseOpen(true)}
          >
            <TrendingUp size={15} /> Catat Pengeluaran
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor transaksi atau pihak..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">Nomor</th>
              <th scope="col">Pihak Terkait</th>
              <th scope="col" className="text-center">Tipe</th>
              <th scope="col" className="text-right">Jumlah</th>
              <th scope="col" className="text-center">Status</th>
              <th scope="col" className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                  Memuat data transaksi...
                </td>
              </tr>
            ) : payments?.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada transaksi bank/kas.</p>
                </td>
              </tr>
            ) : (
              payments?.filter((p: any) =>
                !searchTerm ||
                p.paymentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.party?.name?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((payment: any) => (
                <tr key={payment.id}>
                  <td className="text-gray-500 whitespace-nowrap">{formatDate(payment.date)}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{payment.paymentNumber}</span>
                  </td>
                  <td>
                    <span className="font-medium text-gray-800">{payment.party?.name ?? '—'}</span>
                    <span className="text-[10px] text-gray-400 uppercase ml-1.5">{payment.party?.partyType}</span>
                  </td>
                  <td className="text-center">
                    <span className={cn(
                      'badge',
                      payment.paymentType === 'Receive' ? 'badge-green' : 'badge-red'
                    )}>
                      {payment.paymentType === 'Receive' ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                      {payment.paymentType === 'Receive' ? 'Masuk' : 'Keluar'}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={cn(
                      'font-mono font-medium tabular-nums',
                      payment.paymentType === 'Receive' ? 'text-green-600' : 'text-red-500'
                    )}>
                      {payment.paymentType === 'Receive' ? '+' : '-'} {formatRupiah(Number(payment.amount))}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className="badge badge-blue">{payment.status}</span>
                  </td>
                  <td>
                    <button className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PaymentModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        defaultType="Receive"
      />
      <ExpenseModal
        isOpen={isExpenseOpen}
        onClose={() => setIsExpenseOpen(false)}
      />
      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />
    </div>
  );
};
