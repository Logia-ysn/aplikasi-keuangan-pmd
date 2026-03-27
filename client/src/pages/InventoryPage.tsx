import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Warehouse, PackageSearch, Edit2, XCircle, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatDate, formatRupiah } from '../lib/formatters';
import { toast } from 'sonner';
import { InventoryItemModal } from '../components/InventoryItemModal';
import { StockMovementModal } from '../components/StockMovementModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProductionRunModal } from '../components/ProductionRunModal';

type TabType = 'items' | 'movements' | 'production';

const formatNumber = (val: number | string, decimals = 3) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const movementTypeConfig: Record<string, { label: string; className: string }> = {
  In: { label: 'Masuk', className: 'badge badge-green' },
  Out: { label: 'Keluar', className: 'badge badge-red' },
  AdjustmentIn: { label: 'Penyesuaian +', className: 'badge badge-blue' },
  AdjustmentOut: { label: 'Penyesuaian −', className: 'badge badge-orange' },
};

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('items');

  // --- Items tab state ---
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // --- Movements tab state ---
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [filterItemId, setFilterItemId] = useState('');
  const [filterMovementType, setFilterMovementType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // --- Production tab state ---
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [filterProdStartDate, setFilterProdStartDate] = useState('');
  const [filterProdEndDate, setFilterProdEndDate] = useState('');
  const [cancelProdTarget, setCancelProdTarget] = useState<string | null>(null);
  const [isCancellingProd, setIsCancellingProd] = useState(false);

  const queryClient = useQueryClient();

  const userRole = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? '';
    } catch {
      return '';
    }
  }, []);

  // --- Queries ---
  const { data: itemsRaw, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/inventory/items').then(r => r.data),
  });
  const items: any[] = Array.isArray(itemsRaw)
    ? itemsRaw
    : (itemsRaw?.data ?? []);

  const movementFilters = useMemo(() => ({
    ...(filterItemId ? { itemId: filterItemId } : {}),
    ...(filterMovementType ? { movementType: filterMovementType } : {}),
    ...(filterStartDate ? { startDate: filterStartDate } : {}),
    ...(filterEndDate ? { endDate: filterEndDate } : {}),
  }), [filterItemId, filterMovementType, filterStartDate, filterEndDate]);

  const { data: movementsRaw, isLoading: movementsLoading } = useQuery({
    queryKey: ['stock-movements', movementFilters],
    queryFn: () => api.get('/inventory/movements', { params: movementFilters }).then(r => r.data),
    enabled: activeTab === 'movements',
  });
  const movements: any[] = Array.isArray(movementsRaw)
    ? movementsRaw
    : (movementsRaw?.data ?? []);

  const prodFilters = useMemo(() => ({
    ...(filterProdStartDate ? { startDate: filterProdStartDate } : {}),
    ...(filterProdEndDate ? { endDate: filterProdEndDate } : {}),
  }), [filterProdStartDate, filterProdEndDate]);

  const { data: productionRaw, isLoading: productionLoading } = useQuery({
    queryKey: ['production-runs', prodFilters],
    queryFn: () => api.get('/inventory/production-runs', { params: prodFilters }).then(r => r.data),
    enabled: activeTab === 'production',
  });
  const productionRuns: any[] = Array.isArray(productionRaw)
    ? productionRaw
    : (productionRaw?.data ?? []);

  // --- Handlers ---
  const handleOpenAdd = () => {
    setEditItem(null);
    setItemModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    setItemModalOpen(true);
  };

  const handleCancelMovement = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await api.put(`/inventory/movements/${cancelTarget}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Gerakan stok berhasil dibatalkan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan gerakan stok.');
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
    }
  };

  const handleCancelProduction = async () => {
    if (!cancelProdTarget) return;
    setIsCancellingProd(true);
    try {
      await api.put(`/inventory/production-runs/${cancelProdTarget}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Proses produksi berhasil dibatalkan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan proses produksi.');
    } finally {
      setIsCancellingProd(false);
      setCancelProdTarget(null);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stok &amp; Gudang</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola master item, pantau stok, dan catat gerakan persediaan.</p>
        </div>
        {activeTab === 'items' ? (
          <button onClick={handleOpenAdd} className="btn-primary">
            <Plus size={15} /> Tambah Item
          </button>
        ) : activeTab === 'movements' ? (
          <button onClick={() => setMovementModalOpen(true)} className="btn-primary">
            <Plus size={15} /> Catat Gerakan
          </button>
        ) : (
          <button onClick={() => setProductionModalOpen(true)} className="btn-primary">
            <Plus size={15} /> Proses Produksi
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('items')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'items'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Master Item
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Riwayat Gerakan Stok
        </button>
        <button
          onClick={() => setActiveTab('production')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'production'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Proses Produksi
        </button>
      </div>

      {/* ─── Tab 1: Master Item ─── */}
      {activeTab === 'items' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Satuan</th>
                <th scope="col">Kategori</th>
                <th scope="col" className="text-right">Stok Saat Ini</th>
                <th scope="col" className="text-right">Stok Min</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data item...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Warehouse className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada item persediaan.</p>
                  </td>
                </tr>
              ) : (
                items.map((item: any) => {
                  const currentStock = Number(item.currentStock);
                  const minStock = Number(item.minimumStock);
                  const isLow = currentStock < minStock && minStock > 0;
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                          {item.code}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{item.name}</span>
                        {item.description && (
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{item.description}</p>
                        )}
                      </td>
                      <td className="text-gray-500">{item.unit}</td>
                      <td className="text-gray-500">{item.category ?? '—'}</td>
                      <td className="text-right">
                        <span className="font-mono tabular-nums text-gray-800">
                          {formatNumber(currentStock)} {item.unit}
                        </span>
                        {isLow && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                            ⚠ Stok Menipis
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="font-mono tabular-nums text-gray-500">
                          {formatNumber(minStock)}
                        </span>
                      </td>
                      <td className="text-center">
                        <span
                          className={cn(
                            'badge',
                            item.isActive !== false ? 'badge-green' : 'badge-red'
                          )}
                        >
                          {item.isActive !== false ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit item"
                        >
                          <Edit2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
         </div>
        </div>
      )}

      {/* ─── Tab 2: Riwayat Gerakan Stok ─── */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Item</label>
              <select
                value={filterItemId}
                onChange={e => setFilterItemId(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Item</option>
                {items.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tipe</label>
              <select
                value={filterMovementType}
                onChange={e => setFilterMovementType(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Tipe</option>
                <option value="In">Masuk</option>
                <option value="Out">Keluar</option>
                <option value="AdjustmentIn">Penyesuaian +</option>
                <option value="AdjustmentOut">Penyesuaian −</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
           <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">No. Gerakan</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="text-center">Tipe</th>
                  <th scope="col" className="text-right">Kuantitas</th>
                  <th scope="col">Satuan</th>
                  <th scope="col" className="text-right">Nilai</th>
                  <th scope="col">Referensi</th>
                  <th scope="col">Catatan</th>
                  <th scope="col" className="w-10">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                      Memuat riwayat gerakan stok...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <PackageSearch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Belum ada riwayat gerakan stok.</p>
                    </td>
                  </tr>
                ) : (
                  movements.map((mov: any) => {
                    const typeConf = movementTypeConfig[mov.movementType] ?? { label: mov.movementType, className: 'badge' };
                    const isCancelled = mov.isCancelled;
                    return (
                      <tr
                        key={mov.id}
                        className={cn(isCancelled && 'opacity-50')}
                      >
                        <td className={cn('text-gray-500 whitespace-nowrap', isCancelled && 'line-through')}>
                          {formatDate(mov.date)}
                        </td>
                        <td className={cn('whitespace-nowrap', isCancelled && 'line-through')}>
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                            {mov.movementNumber ?? mov.id?.slice(0, 8)}
                          </span>
                        </td>
                        <td className={cn(isCancelled && 'line-through')}>
                          <span className="font-medium text-gray-800">
                            {mov.item?.name ?? '—'}
                          </span>
                          {mov.item?.code && (
                            <span className="text-[10px] text-gray-400 uppercase ml-1.5">{mov.item.code}</span>
                          )}
                        </td>
                        <td className="text-center">
                          {isCancelled ? (
                            <span className="badge badge-red">Dibatalkan</span>
                          ) : (
                            <span className={typeConf.className}>{typeConf.label}</span>
                          )}
                        </td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {formatNumber(mov.quantity)}
                        </td>
                        <td className="text-gray-500">{mov.item?.unit ?? '—'}</td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {mov.totalValue != null
                            ? Number(mov.totalValue).toLocaleString('id-ID', { maximumFractionDigits: 0 })
                            : '—'}
                        </td>
                        <td className="text-gray-500 text-xs">
                          {mov.referenceNumber ? (
                            <>
                              <span className="text-gray-400">{mov.referenceType}</span>
                              <br />
                              <span className="font-mono">{mov.referenceNumber}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="text-gray-500 text-xs max-w-[140px] truncate">
                          {mov.notes ?? '—'}
                        </td>
                        <td>
                          {!isCancelled && userRole === 'Admin' && (
                            <button
                              onClick={() => setCancelTarget(mov.id)}
                              className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                              title="Batalkan gerakan"
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
        </div>
      )}

      {/* ─── Tab 3: Proses Produksi ─── */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterProdStartDate}
                onChange={e => setFilterProdStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterProdEndDate}
                onChange={e => setFilterProdEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
           <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">No. Produksi</th>
                  <th scope="col">Referensi</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col" className="text-right">Rendemen %</th>
                  <th scope="col">Catatan</th>
                  <th scope="col" className="w-10">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {productionLoading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                      Memuat data proses produksi...
                    </td>
                  </tr>
                ) : productionRuns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <PackageSearch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Belum ada proses produksi.</p>
                    </td>
                  </tr>
                ) : (
                  productionRuns.map((run: any) => {
                    const isCancelled = run.isCancelled;
                    const inputLines = (run.items ?? []).filter((i: any) => i.lineType === 'Input');
                    const outputLines = (run.items ?? []).filter((i: any) => i.lineType === 'Output');
                    return (
                      <tr key={run.id} className={cn(isCancelled && 'opacity-50')}>
                        <td className={cn('text-gray-500 whitespace-nowrap', isCancelled && 'line-through')}>
                          {formatDate(run.date)}
                        </td>
                        <td className={cn('whitespace-nowrap', isCancelled && 'line-through')}>
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                            {run.runNumber}
                          </span>
                        </td>
                        <td className="text-gray-500 text-xs">
                          {run.referenceNumber ? (
                            <span className="font-mono">{run.referenceNumber}</span>
                          ) : '—'}
                        </td>
                        <td className={cn('text-xs', isCancelled && 'line-through')}>
                          {inputLines.map((line: any) => (
                            <div key={line.id} className="text-gray-700">
                              <span className="font-medium">{line.item?.name}</span>
                              <span className="text-gray-400 ml-1">
                                {formatNumber(Number(line.quantity))} {line.item?.unit}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td className={cn('text-xs', isCancelled && 'line-through')}>
                          {outputLines.map((line: any) => (
                            <div key={line.id} className="text-gray-700">
                              <span className="font-medium">{line.item?.name}</span>
                              <span className="text-gray-400 ml-1">
                                {formatNumber(Number(line.quantity))} {line.item?.unit}
                              </span>
                              {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                                <span className="text-blue-500 ml-1 font-mono">
                                  @{formatRupiah(Number(line.unitPrice))}
                                </span>
                              )}
                            </div>
                          ))}
                        </td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {run.rendemenPct != null
                            ? `${Number(run.rendemenPct).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="text-gray-500 text-xs max-w-[140px] truncate">
                          {run.notes ?? '—'}
                        </td>
                        <td>
                          {!isCancelled && userRole === 'Admin' && (
                            <button
                              onClick={() => setCancelProdTarget(run.id)}
                              className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                              title="Batalkan proses produksi"
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
        </div>
      )}

      {/* Modals */}
      <InventoryItemModal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        editItem={editItem}
      />

      <StockMovementModal
        isOpen={movementModalOpen}
        onClose={() => setMovementModalOpen(false)}
      />

      <ProductionRunModal
        isOpen={productionModalOpen}
        onClose={() => setProductionModalOpen(false)}
        items={items}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Batalkan Gerakan Stok"
        message="Batalkan gerakan stok ini? Stok item akan dikembalikan."
        confirmLabel={isCancelling ? 'Membatalkan...' : 'Ya, Batalkan'}
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancelMovement}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={cancelProdTarget !== null}
        title="Batalkan Proses Produksi"
        message="Batalkan proses produksi ini? Semua gerakan stok terkait akan dibalik."
        confirmLabel={isCancellingProd ? 'Membatalkan...' : 'Ya, Batalkan'}
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancelProduction}
        onCancel={() => setCancelProdTarget(null)}
      />
    </div>
  );
}
