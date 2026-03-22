import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatRupiah, formatDate } from '../lib/formatters';

type PaymentType = 'Receive' | 'Pay';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: PaymentType;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, defaultType = 'Receive' }) => {
  const today = new Date().toISOString().split('T')[0];

  const [paymentType, setPaymentType] = useState<PaymentType>(defaultType);
  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setPaymentType(defaultType);
      setDate(today);
      setPartyId('');
      setAmount('');
      setAccountId('');
      setReferenceNo('');
      setNotes('');
      setError('');
    }
  }, [isOpen, defaultType]);

  // Parties — filter by type based on payment direction
  const partyType = paymentType === 'Receive' ? 'Customer' : 'Supplier';
  const { data: parties } = useQuery({
    queryKey: ['parties', partyType],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { type: partyType } });
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  // Cash/Bank accounts (ASSET type, non-group, account numbers starting with 1.1.1 or 1.1.2)
  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      // Return non-group asset accounts that are typically cash/bank (1.1.x)
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  // Open invoices for selected party (for display only — server auto-allocates)
  const { data: openInvoices } = useQuery({
    queryKey: ['open-invoices', partyId, paymentType],
    queryFn: async () => {
      if (paymentType === 'Receive') {
        const res = await api.get('/sales/invoices', { params: { partyId, status: 'Submitted' } });
        return (res.data.data ?? res.data).filter((inv: any) => Number(inv.outstanding) > 0);
      } else {
        const res = await api.get('/purchase/invoices', { params: { partyId, status: 'Submitted' } });
        return (res.data.data ?? res.data).filter((inv: any) => Number(inv.outstanding) > 0);
      }
    },
    enabled: isOpen && !!partyId,
  });

  const totalOutstanding = openInvoices?.reduce((s: number, inv: any) => s + Number(inv.outstanding), 0) ?? 0;

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan pembayaran.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && numAmount > 0 && accountId && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      amount: numAmount,
      paymentType,
      accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
    });
  };

  if (!isOpen) return null;

  const isReceive = paymentType === 'Receive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div className="bg-white rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isReceive ? 'bg-green-50' : 'bg-orange-50'}`}>
              {isReceive
                ? <TrendingDown size={16} className="text-green-600" />
                : <TrendingUp size={16} className="text-orange-500" />}
            </div>
            <div>
              <h2 id="payment-modal-title" className="text-base font-semibold text-gray-900">
                {isReceive ? 'Terima Pembayaran' : 'Catat Pengeluaran'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Draft • belum disimpan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Payment Type Toggle */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tipe Transaksi</label>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['Receive', 'Pay'] as PaymentType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setPaymentType(t); setPartyId(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                    paymentType === t
                      ? t === 'Receive' ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'Receive'
                    ? <><TrendingDown size={14} /> Penerimaan</>
                    : <><TrendingUp size={14} /> Pengeluaran</>}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Party */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                {isReceive ? 'Pelanggan' : 'Supplier'}
              </label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih —</option>
                {parties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Open invoices hint */}
          {partyId && openInvoices && openInvoices.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700 mb-2">
                {openInvoices.length} invoice terbuka — total {formatRupiah(totalOutstanding)}
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {openInvoices.map((inv: any) => (
                  <div key={inv.id} className="flex justify-between text-xs text-blue-600">
                    <span>{inv.invoiceNumber} ({formatDate(inv.date)})</span>
                    <span className="font-mono tabular-nums">{formatRupiah(Number(inv.outstanding))}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setAmount(totalOutstanding)}
                className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
              >
                Isi jumlah lunaskan semua
              </button>
            </div>
          )}
          {partyId && openInvoices && openInvoices.length === 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-500">
              Tidak ada invoice terbuka untuk {isReceive ? 'pelanggan' : 'supplier'} ini.
            </div>
          )}

          {/* Amount & Account */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah (Rp)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                min={0}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Kas/Bank</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih Akun —</option>
                {cashAccounts?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="No. cek, transfer, dll."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Keterangan opsional..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Amount preview */}
          {numAmount > 0 && (
            <div className={`rounded-lg p-3 border ${isReceive ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
              <p className={`text-xs font-medium ${isReceive ? 'text-green-700' : 'text-orange-700'}`}>
                {isReceive ? 'Menerima' : 'Membayar'}{' '}
                <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span>
                {totalOutstanding > 0 && numAmount >= totalOutstanding && ' · Melunasi semua tagihan'}
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`btn-primary disabled:opacity-40 disabled:cursor-not-allowed ${!isReceive ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default PaymentModal;
