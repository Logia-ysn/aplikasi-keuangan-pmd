import { useState } from 'react';
import { Plus, Search, MoreHorizontal, Users, Loader2, Mail, Phone, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import PartyFormModal from '../components/PartyFormModal';

export const PartiesPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: parties, isLoading } = useQuery({
    queryKey: ['parties', filterType],
    queryFn: async () => {
      const params = filterType !== 'All' ? { type: filterType } : {};
      const response = await api.get('/parties', { params });
      return response.data.data ?? response.data;
    }
  });

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pelanggan & Vendor</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola data mitra bisnis, saldo piutang, dan hutang usaha.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={15} /> Tambah Mitra Baru
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, email, atau telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {['All', 'Customer', 'Supplier'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                filterType === type ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {type === 'All' ? 'Semua' : type === 'Customer' ? 'Pelanggan' : 'Vendor'}
            </button>
          ))}
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">Memuat data mitra...</p>
          </div>
        ) : parties?.length === 0 ? (
          <div className="col-span-full bg-white border border-gray-200 rounded-xl py-16 text-center">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada data mitra bisnis.</p>
          </div>
        ) : (
          parties?.filter((p: any) =>
            !searchTerm ||
            p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.phone?.includes(searchTerm)
          ).map((party: any) => (
            <div key={party.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold',
                    party.partyType === 'Customer' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                  )}>
                    {party.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{party.name}</h3>
                    <span className={cn(
                      'text-[10px] font-medium uppercase tracking-wider',
                      party.partyType === 'Customer' ? 'text-blue-500' : 'text-gray-400'
                    )}>
                      {party.partyType}
                    </span>
                  </div>
                </div>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-400 opacity-0 group-hover:opacity-100 transition-all">
                  <MoreHorizontal size={14} />
                </button>
              </div>

              <div className="space-y-1.5 mb-4">
                {party.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Mail size={12} className="text-gray-400" /> {party.email}
                  </div>
                )}
                {party.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone size={12} className="text-gray-400" /> {party.phone}
                  </div>
                )}
                {party.address && (
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{party.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Saldo Terutang</p>
                <p className={cn(
                  'text-base font-semibold font-mono tabular-nums',
                  Number(party.outstandingAmount) > 0 ? 'text-red-500' :
                  Number(party.outstandingAmount) < 0 ? 'text-green-600' : 'text-gray-400'
                )}>
                  {formatRupiah(Math.abs(Number(party.outstandingAmount)))}
                  {Number(party.outstandingAmount) !== 0 && (
                    <span className="text-[10px] font-normal ml-1 text-gray-400">
                      {Number(party.outstandingAmount) > 0 ? '(Tagihan)' : '(Deposit)'}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <PartyFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
