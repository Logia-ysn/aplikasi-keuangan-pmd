import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';


interface InvoiceItem {
  id: string;
  itemName: string;
  inventoryItemId: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number; // percent
}

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const defaultItem = (): InvoiceItem => ({
  id: crypto.randomUUID(), itemName: '', inventoryItemId: '', description: '', quantity: 1, unit: 'Kg', rate: 0, discount: 0
});

const PurchaseInvoiceModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [taxPct, setTaxPct] = useState(0);
  const [potongan, setPotongan] = useState(0);
  const [biayaLain, setBiayaLain] = useState(0);
  const [items, setItems] = useState<InvoiceItem[]>([defaultItem()]);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-suppliers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Supplier');
      return res.data.data ?? res.data;
    }
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  const selectedParty = parties?.find((p: any) => p.id === partyId);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/purchase/invoices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setPartyId('');
      setNotes('');
      setTaxPct(0);
      setPotongan(0);
      setBiayaLain(0);
      setItems([defaultItem()]);
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan invoice.')
  });

  const addItem = () => setItems([...items, defaultItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const selectInventoryItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === inventoryId);
    const next = [...items];
    if (inv) {
      next[idx] = { ...next[idx], inventoryItemId: inventoryId, itemName: inv.name, unit: inv.unit || 'Kg' };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };

  const lineTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.rate;
    return base - (base * (item.discount / 100));
  };
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = subtotal * (taxPct / 100);
  const grandTotal = subtotal + taxAmount - potongan + biayaLain;
  const canSubmit = partyId && items.some(i => i.itemName && i.rate > 0) && grandTotal > 0 && !mutation.isPending;

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="purchase-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}>
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* ── HEADER BAR ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="purchase-modal-title" className="text-base font-semibold text-gray-900">Invoice Pembelian Baru</h2>
            <p className="text-xs text-gray-400 mt-0.5">Draft • belum disimpan</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Top meta section */}
          <div className="p-6 grid grid-cols-2 gap-8 border-b border-gray-100">

            {/* LEFT — Supplier */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Supplier / Pemasok</p>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              >
                <option value="">— Pilih Supplier —</option>
                {parties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedParty && (
                <div className="text-xs text-gray-500 space-y-0.5 mt-1 pl-1">
                  {selectedParty.email && <p>{selectedParty.email}</p>}
                  {selectedParty.phone && <p>{selectedParty.phone}</p>}
                  {selectedParty.address && <p className="text-gray-400">{selectedParty.address}</p>}
                </div>
              )}
            </div>

            {/* RIGHT — Invoice details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal Invoice</label>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jatuh Tempo</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">PPN (%)</label>
                <div className="relative max-w-[50%]">
                  <input
                    type="number"
                    value={taxPct === 0 ? '' : taxPct}
                    onChange={e => setTaxPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                    placeholder="0"
                    min={0} max={100}
                    className="w-full border border-gray-200 rounded-lg py-2 pl-3 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ITEMS TABLE ── */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Daftar Barang / Jasa</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus size={13} /> Tambah Baris
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3 min-w-[200px]">Nama Barang / Jasa</th>
                    <th className="text-center px-3 py-3 w-20">Qty</th>
                    <th className="text-left px-3 py-3 w-24">Satuan</th>
                    <th className="text-right px-3 py-3 w-36">Harga Satuan</th>
                    <th className="text-right px-3 py-3 w-24">Diskon %</th>
                    <th className="text-right px-4 py-3 w-36">Jumlah</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="group border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center text-xs text-gray-300 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <select
                          value={item.inventoryItemId}
                          onChange={e => selectInventoryItem(idx, e.target.value)}
                          className="w-full bg-transparent text-sm text-gray-800 border-none focus:ring-0 focus:outline-none p-0 cursor-pointer mb-0.5"
                        >
                          <option value="">— Pilih dari Stok Gudang —</option>
                          {inventoryItems?.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.code} — {inv.name} ({inv.currentStock} {inv.unit})
                            </option>
                          ))}
                        </select>
                        {!item.inventoryItemId && (
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={e => updateItem(idx, 'itemName', e.target.value)}
                            placeholder="Atau ketik nama barang/jasa manual..."
                            className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-300"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          min={1}
                          className="w-full bg-transparent text-sm text-gray-800 text-center font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(idx, 'unit', e.target.value)}
                            className="w-full bg-transparent text-sm text-gray-600 border-none focus:ring-0 focus:outline-none p-0 appearance-none cursor-pointer pr-4"
                          >
                            {UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.rate || ''}
                          onChange={e => updateItem(idx, 'rate', Number(e.target.value))}
                          placeholder="0"
                          className="w-full bg-transparent text-sm text-gray-800 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.discount || ''}
                          onChange={e => updateItem(idx, 'discount', Math.min(100, Number(e.target.value)))}
                          placeholder="0"
                          min={0} max={100}
                          className="w-full bg-transparent text-sm text-gray-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm font-medium text-gray-900 tabular-nums">
                          {formatRupiah(lineTotal(item))}
                        </span>
                      </td>
                      <td className="pr-3 py-3 text-center">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)}
                            className="p-1 rounded text-gray-200 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SUMMARY + NOTES ── */}
          <div className="px-6 pb-6 grid grid-cols-2 gap-8 items-start">

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Misal: No. PO, referensi pesanan, atau catatan internal..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300"
              />
            </div>

            {/* Totals */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="space-y-2.5">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(subtotal)}</span>
                </div>

                {/* PPN */}
                {taxPct > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">PPN {taxPct}%</span>
                    <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(taxAmount)}</span>
                  </div>
                )}

                {/* Potongan */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-500">Potongan</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-gray-400 text-xs">−</span>
                    <input
                      type="number"
                      value={potongan || ''}
                      onChange={e => setPotongan(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-28 text-right font-mono text-red-500 bg-transparent border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Biaya Lain */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-500">Biaya Lain</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-gray-400 text-xs">+</span>
                    <input
                      type="number"
                      value={biayaLain || ''}
                      onChange={e => setBiayaLain(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-28 text-right font-mono text-gray-700 bg-transparent border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Grand Total */}
                <div className="border-t border-gray-200 pt-2.5 flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-700">Total</span>
                  <span className="text-2xl font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {canSubmit ? `Total: ${formatRupiah(grandTotal)}` : 'Lengkapi supplier dan minimal 1 item untuk melanjutkan'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button
              onClick={() => mutation.mutate({
                date: invoiceDate, dueDate, partyId, notes, taxPct, potongan, biayaLain,
                items: items.map(i => ({ ...i, inventoryItemId: i.inventoryItemId || null })),
              })}
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Invoice'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PurchaseInvoiceModal;
