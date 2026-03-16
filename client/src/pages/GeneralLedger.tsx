import { useState } from 'react';
import {
  Plus, Search, MoreHorizontal, Calendar as CalendarIcon,
  Loader2, FileSpreadsheet
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import JournalEntryModal from '../components/JournalEntryModal';
import { formatRupiah, formatDate } from '../lib/formatters';

export const GeneralLedger = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: journals, isLoading } = useQuery({
    queryKey: ['journals'],
    queryFn: async () => {
      const response = await api.get('/journals');
      return response.data.data ?? response.data;
    }
  });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Buku Besar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola dan tinjau semua transaksi jurnal harian.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus size={15} /> Buat Jurnal Baru
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
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
        <button className="btn-secondary text-xs py-2 px-3">
          <CalendarIcon size={14} /> Bulan Ini
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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

                return (
                  <tr key={journal.id}>
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
                        journal.status === 'Submitted' ? 'badge-green' : 'badge-gray'
                      )}>
                        {journal.status === 'Submitted' ? 'Posted' : journal.status}
                      </span>
                    </td>
                    <td>
                      <button className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
