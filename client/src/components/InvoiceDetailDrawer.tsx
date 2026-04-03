import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, FileDown, Clock, CreditCard, Package, User, Calendar, AlertTriangle, CheckCircle2, Loader2, Wallet, XCircle, Pencil, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import PDFDownloadButton from './PDFDownloadButton';
import InvoicePDF from '../lib/pdf/InvoicePDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import ApplyDepositModal from './ApplyDepositModal';
import ApplyCustomerDepositModal from './ApplyCustomerDepositModal';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  type: 'sales' | 'purchase';
  invoiceId: string | null;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  Draft:        { label: 'Draft',          badge: 'badge badge-gray',   icon: <Clock size={13} /> },
  Submitted:    { label: 'Diajukan',       badge: 'badge badge-blue',   icon: <Clock size={13} /> },
  PartiallyPaid:{ label: 'Sebagian Lunas', badge: 'badge badge-yellow', icon: <AlertTriangle size={13} /> },
  Paid:         { label: 'Lunas',          badge: 'badge badge-green',  icon: <CheckCircle2 size={13} /> },
  Cancelled:    { label: 'Dibatalkan',     badge: 'badge badge-red',    icon: <X size={13} /> },
  Overdue:      { label: 'Jatuh Tempo',    badge: 'badge badge-red',    icon: <AlertTriangle size={13} /> },
};

const InvoiceDetailDrawer: React.FC<Props> = ({ type, invoiceId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const isSales = type === 'sales';
  const [isApplyDepositOpen, setIsApplyDepositOpen] = useState(false);
  const [isApplyCustomerDepositOpen, setIsApplyCustomerDepositOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelDepositAppId, setCancelDepositAppId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTerms, setEditTerms] = useState('');
  const endpoint = isSales ? '/sales/invoices' : '/purchase/invoices';

  const { data: invoice, isLoading } = useQuery({
    queryKey: [type === 'sales' ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId],
    queryFn: async () => {
      const res = await api.get(`${endpoint}/${invoiceId}`);
      return res.data;
    },
    enabled: !!invoiceId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`${endpoint}/${invoiceId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.success('Invoice berhasil dibatalkan.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan invoice.'),
  });

  const cancelDepositAppMutation = useMutation({
    mutationFn: (appId: string) => {
      const cancelEndpoint = isSales ? '/customer-deposits/apply' : '/vendor-deposits/apply';
      return api.post(`${cancelEndpoint}/${appId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'customer-deposits' : 'vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.success('Alokasi uang muka berhasil dibatalkan.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan alokasi uang muka.'),
  });

  const editMutation = useMutation({
    mutationFn: (data: { notes?: string; dueDate?: string; terms?: string }) =>
      api.put(`${endpoint}/${invoiceId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      toast.success('Invoice berhasil diperbarui.');
      setIsEditing(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal memperbarui invoice.'),
  });

  if (!invoiceId) return null;

  const party = isSales ? invoice?.customer : invoice?.supplier;
  const partyLabel = isSales ? 'Pelanggan' : 'Supplier';
  const outstanding = Number(invoice?.outstanding ?? 0);
  const grandTotal = Number(invoice?.grandTotal ?? 0);
  const paidAmount = grandTotal - outstanding;
  const paidPct = grandTotal > 0 ? Math.round((paidAmount / grandTotal) * 100) : 0;

  const items = invoice?.items ?? [];
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const taxPct = Number(invoice?.taxPct ?? 0);
  // Per-item tax: sum each item's tax, fallback to invoice-level for old invoices
  const taxAmount = items.some((i: any) => Number(i.taxPct ?? 0) > 0)
    ? items.reduce((s: number, i: any) => s + Number(i.amount) * Number(i.taxPct ?? 0) / 100, 0)
    : (taxPct > 0 ? subtotal * taxPct / 100 : 0);
  const hasPerItemTax = items.some((i: any) => Number(i.taxPct ?? 0) > 0);
  const pphAmount = items.reduce((s: number, i: any) => s + Number(i.amount) * Number(i.pphPct ?? 0) / 100, 0);
  const hasPerItemPph = items.some((i: any) => Number(i.pphPct ?? 0) > 0);
  const potongan = Number(invoice?.potongan ?? 0);
  const biayaLain = Number(invoice?.biayaLain ?? 0);
  const allocations = invoice?.paymentAllocations ?? [];
  const depositApplications = invoice?.depositApplications ?? [];

  const sc = statusConfig[invoice?.status] ?? statusConfig.Draft;

  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && outstanding > 0;
  const canCancel = invoice && invoice.status !== 'Cancelled' && invoice.status !== 'Paid';
  const canEdit = invoice && invoice.status !== 'Cancelled';

  const startEditing = () => {
    setEditNotes(invoice?.notes ?? '');
    setEditDueDate(invoice?.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : '');
    setEditTerms(invoice?.terms ?? '');
    setIsEditing(true);
  };

  const saveEdit = () => {
    editMutation.mutate({
      notes: editNotes,
      dueDate: editDueDate || undefined,
      terms: editTerms || undefined,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              {isSales ? <FileDown size={18} className="text-blue-600" /> : <Package size={18} className="text-blue-600" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {isLoading ? 'Memuat...' : invoice?.invoiceNumber}
              </h2>
              <p className="text-xs text-gray-400">
                {isSales ? 'Invoice Penjualan' : 'Invoice Pembelian'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {canEdit && !isEditing && (
              <button
                onClick={startEditing}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit invoice"
              >
                <Pencil size={16} />
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Batalkan invoice"
              >
                <XCircle size={16} />
              </button>
            )}
            {invoice && (
              <PDFDownloadButton
                variant="button"
                fileName={`${invoice.invoiceNumber}.pdf`}
                label="Unduh PDF"
                document={
                  <InvoicePDF
                    type={type}
                    invoiceNumber={invoice.invoiceNumber}
                    date={invoice.date}
                    dueDate={invoice.dueDate}
                    terms={invoice.terms}
                    status={invoice.status}
                    notes={invoice.notes}
                    taxPct={invoice.taxPct ?? 0}
                    potongan={invoice.potongan ?? 0}
                    biayaLain={invoice.biayaLain ?? 0}
                    labelPotongan={invoice.labelPotongan}
                    labelBiaya={invoice.labelBiaya}
                    grandTotal={invoice.grandTotal}
                    party={{
                      name: party?.name ?? '—',
                      address: party?.address,
                      phone: party?.phone,
                      email: party?.email,
                      taxId: party?.taxId,
                    }}
                    items={items.map((it: any) => ({
                      itemName: it.itemName,
                      quantity: it.quantity,
                      unit: it.unit,
                      rate: it.rate,
                      discount: it.discount ?? 0,
                      taxPct: it.taxPct ?? 0,
                      pphPct: it.pphPct ?? 0,
                      amount: it.amount,
                      description: it.description,
                    }))}
                    company={company}
                  />
                }
              />
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
          ) : !invoice ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Invoice tidak ditemukan.
            </div>
          ) : (
            <>
              {/* Status + Progress bar */}
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className={cn(sc.badge, 'inline-flex items-center gap-1')}>
                    {sc.icon} {sc.label}
                  </span>
                  {isOverdue && (
                    <span className="badge badge-red inline-flex items-center gap-1 text-[10px]">
                      <AlertTriangle size={11} /> Lewat jatuh tempo
                    </span>
                  )}
                </div>
                {/* Payment progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Pembayaran</span>
                    <span className="font-mono font-medium text-gray-700">{formatRupiah(paidAmount)} / {formatRupiah(grandTotal)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        paidPct >= 100 ? 'bg-green-500' : paidPct > 0 ? 'bg-yellow-400' : 'bg-gray-200'
                      )}
                      style={{ width: `${Math.min(paidPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{paidPct}% terbayar</span>
                    {outstanding > 0 && <span className="text-red-400 font-medium">Sisa: {formatRupiah(outstanding)}</span>}
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="px-6 py-4 grid grid-cols-2 gap-6 border-b border-gray-100">
                {/* Party info */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User size={10} /> {partyLabel}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{party?.name ?? '—'}</p>
                  {party?.phone && <p className="text-xs text-gray-500 mt-0.5">{party.phone}</p>}
                  {party?.email && <p className="text-xs text-gray-500">{party.email}</p>}
                  {party?.address && <p className="text-xs text-gray-400 mt-0.5">{party.address}</p>}
                  {party?.taxId && <p className="text-xs text-gray-400">NPWP: {party.taxId}</p>}
                </div>

                {/* Invoice meta */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Informasi Invoice
                  </p>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-400">Jatuh Tempo</label>
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">Termin</label>
                        <input
                          type="text"
                          value={editTerms}
                          onChange={(e) => setEditTerms(e.target.value)}
                          placeholder="Net 30"
                          className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-400">Tanggal</p>
                        <p className="text-xs font-medium text-gray-800">{formatDate(invoice.date)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Jatuh Tempo</p>
                        <p className={cn('text-xs font-medium', isOverdue ? 'text-red-500' : 'text-gray-800')}>
                          {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                        </p>
                      </div>
                      {invoice.terms && (
                        <div>
                          <p className="text-[10px] text-gray-400">Termin</p>
                          <p className="text-xs font-medium text-gray-800">{invoice.terms}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-gray-400">Dibuat oleh</p>
                        <p className="text-xs font-medium text-gray-800">{invoice.user?.fullName ?? '—'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Daftar Barang / Jasa ({items.length} item)
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 w-8">#</th>
                        <th className="text-left px-4 py-2.5">Nama</th>
                        <th className="text-center px-3 py-2.5 w-16">Qty</th>
                        <th className="text-center px-3 py-2.5 w-16">Satuan</th>
                        <th className="text-right px-3 py-2.5 w-28">Harga</th>
                        <th className="text-right px-3 py-2.5 w-16">Disk%</th>
                        <th className="text-right px-3 py-2.5 w-16">PPN%</th>
                        {hasPerItemPph && <th className="text-right px-3 py-2.5 w-16">PPh%</th>}
                        <th className="text-right px-4 py-2.5 w-28">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-gray-800">{item.itemName}</p>
                              {item.itemType === 'service' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded bg-purple-100 text-purple-700">Jasa</span>
                              )}
                            </div>
                            {item.description && <p className="text-[10px] text-gray-400">{item.description}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">
                            {Number(item.quantity).toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.unit}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">{formatRupiah(Number(item.rate))}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            <span className={Number(item.discount) > 0 ? 'text-orange-500' : 'text-gray-300'}>
                              {Number(item.discount) > 0 ? `${Number(item.discount)}%` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            <span className={Number(item.taxPct) > 0 ? 'text-blue-600' : 'text-gray-300'}>
                              {Number(item.taxPct) > 0 ? `${Number(item.taxPct)}%` : '—'}
                            </span>
                          </td>
                          {hasPerItemPph && (
                            <td className="px-3 py-2.5 text-right font-mono text-xs">
                              <span className={Number(item.pphPct) > 0 ? 'text-orange-600' : 'text-gray-300'}>
                                {Number(item.pphPct) > 0 ? `${Number(item.pphPct)}%` : '—'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-gray-900">
                            {formatRupiah(Number(item.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex justify-end">
                  <div className="w-72 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(subtotal)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{hasPerItemTax ? 'PPN (per item)' : `PPN ${taxPct}%`}</span>
                        <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(taxAmount)}</span>
                      </div>
                    )}
                    {pphAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-500">PPh (per item)</span>
                        <span className="font-mono text-orange-600 tabular-nums">− {formatRupiah(pphAmount)}</span>
                      </div>
                    )}
                    {potongan > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-red-400">{invoice.labelPotongan || 'Potongan'}</span>
                        <span className="font-mono text-red-500 tabular-nums">({formatRupiah(potongan)})</span>
                      </div>
                    )}
                    {biayaLain > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{invoice.labelBiaya || 'Biaya Lain'}</span>
                        <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(biayaLain)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-gray-700">Grand Total</span>
                      <span className="text-lg font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment History */}
              {allocations.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                    <CreditCard size={10} /> Riwayat Pembayaran ({allocations.length})
                  </p>
                  <div className="space-y-2">
                    {allocations.map((alloc: any) => (
                      <div key={alloc.id} className="flex items-center justify-between p-3 bg-green-50/50 border border-green-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-green-100 rounded">
                            <CreditCard size={13} className="text-green-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">{alloc.payment?.paymentNumber}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(alloc.payment?.date)}</p>
                          </div>
                        </div>
                        <span className="font-mono text-sm font-semibold text-green-600">
                          {formatRupiah(Number(alloc.allocatedAmount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deposit Applications */}
              {depositApplications.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                    <Wallet size={10} /> Riwayat Uang Muka ({depositApplications.length})
                  </p>
                  <div className="space-y-2">
                    {depositApplications.map((app: any) => (
                      <div key={app.id} className={cn(
                        'flex items-center justify-between p-3 rounded-lg',
                        app.isCancelled
                          ? 'bg-gray-50 border border-gray-200 opacity-50'
                          : isSales ? 'bg-teal-50/50 border border-teal-100' : 'bg-amber-50/50 border border-amber-100'
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn('p-1.5 rounded', app.isCancelled ? 'bg-gray-100' : isSales ? 'bg-teal-100' : 'bg-amber-100')}>
                            <Wallet size={13} className={app.isCancelled ? 'text-gray-400' : isSales ? 'text-teal-600' : 'text-amber-600'} />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">
                              {app.depositPayment?.paymentNumber}
                              {app.isCancelled && <span className="ml-1.5 text-[10px] text-red-400">(Dibatalkan)</span>}
                            </p>
                            <p className="text-[10px] text-gray-400">{formatDate(app.appliedAt ?? app.depositPayment?.date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('font-mono text-sm font-semibold', app.isCancelled ? 'text-gray-400 line-through' : isSales ? 'text-teal-600' : 'text-amber-600')}>
                            {formatRupiah(Number(app.appliedAmount))}
                          </span>
                          {!app.isCancelled && invoice.status !== 'Cancelled' && (
                            <button
                              onClick={() => setCancelDepositAppId(app.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                              title="Batalkan alokasi uang muka"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply Deposit Banner (has outstanding) */}
              {outstanding > 0.01 && invoice.status !== 'Cancelled' && (
                <div className="px-6 py-3 border-b border-gray-100">
                  <button
                    onClick={() => isSales ? setIsApplyCustomerDepositOpen(true) : setIsApplyDepositOpen(true)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                      isSales
                        ? 'bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    )}
                  >
                    <Wallet size={14} /> Gunakan Uang Muka
                  </button>
                </div>
              )}

              {/* Notes */}
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan</p>
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      placeholder="Catatan invoice..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {editMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {invoice.notes || <span className="text-gray-300 italic">Tidak ada catatan</span>}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cancel Invoice Confirm */}
      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan Invoice"
        message="Yakin ingin membatalkan invoice ini? Semua jurnal GL, stok, dan saldo akan di-reverse. Invoice yang sudah ada pembayaran atau alokasi uang muka harus dibatalkan terlebih dahulu."
        confirmLabel="Batalkan Invoice"
        variant="danger"
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
        onCancel={() => setConfirmCancel(false)}
      />

      {/* Cancel Deposit Application Confirm */}
      <ConfirmDialog
        open={cancelDepositAppId !== null}
        title="Batalkan Alokasi Uang Muka"
        message="Yakin ingin membatalkan alokasi uang muka ini? Saldo deposit akan dikembalikan dan outstanding invoice akan bertambah kembali."
        confirmLabel="Batalkan Alokasi"
        variant="danger"
        onConfirm={() => { if (cancelDepositAppId) cancelDepositAppMutation.mutate(cancelDepositAppId); setCancelDepositAppId(null); }}
        onCancel={() => setCancelDepositAppId(null)}
      />

      {/* Apply Deposit Modal (Purchase) */}
      {!isSales && invoice && (
        <ApplyDepositModal
          isOpen={isApplyDepositOpen}
          onClose={() => setIsApplyDepositOpen(false)}
          purchaseInvoiceId={invoiceId!}
          partyId={invoice.partyId ?? invoice.supplier?.id ?? ''}
          invoiceOutstanding={outstanding}
        />
      )}

      {/* Apply Customer Deposit Modal (Sales) */}
      {isSales && invoice && (
        <ApplyCustomerDepositModal
          isOpen={isApplyCustomerDepositOpen}
          onClose={() => setIsApplyCustomerDepositOpen(false)}
          salesInvoiceId={invoiceId!}
          partyId={invoice.partyId ?? invoice.customer?.id ?? ''}
          invoiceOutstanding={outstanding}
        />
      )}
    </>
  );
};

export default InvoiceDetailDrawer;
