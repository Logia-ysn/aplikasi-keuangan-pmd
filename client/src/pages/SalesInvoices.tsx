import { useState } from 'react';
import { Plus, Search, MoreHorizontal, FileText, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import SalesInvoiceModal from '../components/SalesInvoiceModal';
import PDFDownloadButton from '../components/PDFDownloadButton';
import InvoicePDF from '../lib/pdf/InvoicePDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

export const SalesInvoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const company = useCompanyPDF();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const response = await api.get('/sales/invoices');
      return response.data.data ?? response.data;
    }
  });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoice Penjualan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola faktur penjualan dan piutang pelanggan.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={15} /> Buat Invoice Baru
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor invoice atau pelanggan..."
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
              <th scope="col">Nomor Invoice</th>
              <th scope="col">Pelanggan</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col" className="text-right">Sisa Tagihan</th>
              <th scope="col" className="text-center">Status</th>
              <th scope="col" className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                  Memuat data invoice...
                </td>
              </tr>
            ) : invoices?.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada invoice penjualan.</p>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Buat invoice pertama
                  </button>
                </td>
              </tr>
            ) : (
              invoices?.filter((inv: any) =>
                !searchTerm ||
                inv.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((invoice: any) => (
                <tr key={invoice.id}>
                  <td className="text-gray-500 whitespace-nowrap">{formatDate(invoice.date)}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{invoice.invoiceNumber}</span>
                  </td>
                  <td>
                    <p className="font-medium text-gray-800">{invoice.customer?.name ?? '—'}</p>
                    <p className="text-[10px] text-gray-400">{invoice.customer?.phone || '—'}</p>
                  </td>
                  <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(Number(invoice.grandTotal))}</td>
                  <td className="text-right">
                    <span className={cn('font-mono font-medium tabular-nums', Number(invoice.outstanding) > 0 ? 'text-red-500' : 'text-green-600')}>
                      {formatRupiah(Number(invoice.outstanding))}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={cn(
                      'badge',
                      invoice.status === 'Paid' ? 'badge-green' :
                      invoice.status === 'Draft' ? 'badge-gray' : 'badge-yellow'
                    )}>
                      {invoice.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5 justify-end pr-1">
                      <PDFDownloadButton
                        variant="icon"
                        fileName={`${invoice.invoiceNumber}.pdf`}
                        label="Unduh Faktur PDF"
                        document={
                          <InvoicePDF
                            type="sales"
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
                              name: invoice.customer?.name ?? '—',
                              address: invoice.customer?.address,
                              phone: invoice.customer?.phone,
                              email: invoice.customer?.email,
                              taxId: invoice.customer?.taxId,
                            }}
                            items={(invoice.items ?? []).map((it: any) => ({
                              itemName: it.itemName,
                              quantity: it.quantity,
                              unit: it.unit,
                              rate: it.rate,
                              discount: it.discount ?? 0,
                              amount: it.amount,
                              description: it.description,
                            }))}
                            company={company}
                          />
                        }
                      />
                      <button className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SalesInvoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
