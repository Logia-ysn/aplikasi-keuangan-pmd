import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const defaultForm = {
  date: today(),
  itemId: '',
  movementType: 'In' as 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut',
  quantity: '',
  unitCost: '',
  offsetAccountId: '',
  referenceType: '',
  referenceNumber: '',
  notes: '',
};

export function StockMovementModal({ isOpen, onClose }: StockMovementModalProps) {
  const [form, setForm] = useState({ ...defaultForm, date: today() });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setForm({ ...defaultForm, date: today() });
      setError('');
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const { data: itemsRaw } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: () =>
      api.get('/inventory/items', { params: { isActive: 'true' } }).then(r => r.data.data ?? r.data),
    enabled: isOpen,
  });
  const items: any[] = itemsRaw ?? [];

  const { data: coaData } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: () => api.get('/coa/flat').then(r => r.data),
    enabled: isOpen,
  });
  const nonGroupAccounts = (coaData ?? []).filter((a: any) => !a.isGroup);

  // Find selected item to check if it has accountId
  const selectedItem = items.find((i: any) => i.id === form.itemId);
  const showOffsetAccount = Boolean(selectedItem?.accountId);

  const qty = Number(form.quantity) || 0;
  const unitCost = Number(form.unitCost) || 0;
  const totalValue = qty * unitCost;

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/movements', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items-active'] });
      toast.success('Gerakan stok berhasil dicatat.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal mencatat gerakan stok.';
      setError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate({
      date: form.date,
      itemId: form.itemId,
      movementType: form.movementType,
      quantity: Number(form.quantity),
      unitCost: unitCost,
      offsetAccountId: form.offsetAccountId || undefined,
      referenceType: form.referenceType || undefined,
      referenceNumber: form.referenceNumber || undefined,
      notes: form.notes || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="movement-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="movement-modal-title" className="text-base font-semibold text-gray-900">
            Catat Gerakan Stok
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">

            {/* Tanggal */}
            <div>
              <label htmlFor="mov-date" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tanggal <span className="text-red-500">*</span>
              </label>
              <input
                id="mov-date"
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Item */}
            <div>
              <label htmlFor="mov-item" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Item <span className="text-red-500">*</span>
              </label>
              <select
                id="mov-item"
                required
                value={form.itemId}
                onChange={e => setForm(f => ({ ...f, itemId: e.target.value, offsetAccountId: '' }))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih Item —</option>
                {items.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.name} ({item.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Tipe Gerakan */}
            <div>
              <label htmlFor="mov-type" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tipe Gerakan <span className="text-red-500">*</span>
              </label>
              <select
                id="mov-type"
                required
                value={form.movementType}
                onChange={e => setForm(f => ({ ...f, movementType: e.target.value as typeof form.movementType }))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="In">Masuk (In)</option>
                <option value="Out">Keluar (Out)</option>
                <option value="AdjustmentIn">Penyesuaian Naik (AdjustmentIn)</option>
                <option value="AdjustmentOut">Penyesuaian Turun (AdjustmentOut)</option>
              </select>
            </div>

            {/* Kuantitas */}
            <div>
              <label htmlFor="mov-qty" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Kuantitas <span className="text-red-500">*</span>
              </label>
              <input
                id="mov-qty"
                type="number"
                required
                min={0.001}
                step="any"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {selectedItem && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Stok saat ini: {Number(selectedItem.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {selectedItem.unit}
                </p>
              )}
            </div>

            {/* Harga Satuan */}
            <div>
              <label htmlFor="mov-unit-cost" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Harga Satuan
              </label>
              <input
                id="mov-unit-cost"
                type="number"
                min={0}
                step="any"
                value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Total Nilai (read-only) */}
            <div>
              <label htmlFor="mov-total" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Total Nilai
              </label>
              <input
                id="mov-total"
                type="text"
                readOnly
                value={totalValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                className="w-full border border-gray-100 rounded-lg py-2 px-3 text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
              />
            </div>

            {/* Akun Lawan — only show if selected item has accountId */}
            {showOffsetAccount && (
              <div>
                <label htmlFor="mov-offset-account" className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Akun Lawan
                  <span className="ml-1.5 text-[10px] font-normal text-blue-500">Diperlukan untuk posting GL</span>
                </label>
                <select
                  id="mov-offset-account"
                  value={form.offsetAccountId}
                  onChange={e => setForm(f => ({ ...f, offsetAccountId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Tidak Dipilih —</option>
                  {nonGroupAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tipe Referensi */}
            <div>
              <label htmlFor="mov-ref-type" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tipe Referensi
              </label>
              <select
                id="mov-ref-type"
                value={form.referenceType}
                onChange={e => setForm(f => ({ ...f, referenceType: e.target.value, referenceNumber: '' }))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Tidak Ada —</option>
                <option value="PurchaseInvoice">Invoice Pembelian</option>
                <option value="SalesInvoice">Invoice Penjualan</option>
              </select>
            </div>

            {/* Nomor Referensi — show when refType selected */}
            {form.referenceType && (
              <div>
                <label htmlFor="mov-ref-number" className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Nomor Referensi
                </label>
                <input
                  id="mov-ref-number"
                  type="text"
                  value={form.referenceNumber}
                  onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  placeholder="Nomor dokumen referensi"
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Catatan */}
            <div>
              <label htmlFor="mov-notes" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Catatan
              </label>
              <textarea
                id="mov-notes"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan opsional tentang gerakan stok ini"
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Gerakan'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
