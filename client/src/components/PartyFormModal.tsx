import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, User, Building2, Phone, Mail, MapPin, CreditCard, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

type PartyType = 'Customer' | 'Supplier' | 'Both';

interface PartyFormData {
  name: string;
  partyType: PartyType;
  phone: string;
  email: string;
  address: string;
  npwp: string;
  website: string;
  contactPerson: string;
}

const defaultForm = (): PartyFormData => ({
  name: '', partyType: 'Customer', phone: '', email: '',
  address: '', npwp: '', website: '', contactPerson: ''
});

interface PartyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pass party data to enable edit mode */
  editParty?: any | null;
}

const PartyFormModal: React.FC<PartyFormModalProps> = ({ isOpen, onClose, editParty }) => {
  const [form, setForm] = useState<PartyFormData>(defaultForm());
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const isEdit = !!editParty;

  // Pre-fill form when editing
  useEffect(() => {
    if (isOpen && editParty) {
      setForm({
        name: editParty.name || '',
        partyType: editParty.partyType || 'Customer',
        phone: editParty.phone || '',
        email: editParty.email || '',
        address: editParty.address || '',
        npwp: editParty.taxId || '',
        website: '',
        contactPerson: '',
      });
      setError('');
    } else if (isOpen) {
      setForm(defaultForm());
      setError('');
    }
  }, [isOpen, editParty]);

  const set = (field: keyof PartyFormData, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['parties'] });
    queryClient.invalidateQueries({ queryKey: ['parties-customers'] });
    queryClient.invalidateQueries({ queryKey: ['parties-suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['parties-all'] });
  };

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/parties/${editParty.id}`, data) : api.post('/parties', data),
    onSuccess: () => {
      invalidateAll();
      setForm(defaultForm());
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan data mitra.')
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('Nama mitra wajib diisi.'); return; }
    const { npwp, website: _w, contactPerson: _cp, ...rest } = form;
    mutation.mutate({ ...rest, taxId: npwp || undefined });
  };

  if (!isOpen) return null;

  const inputCls = 'w-full border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300';
  const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2 text-gray-300';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="party-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="party-modal-title" className="text-base font-semibold text-gray-900">
              {isEdit ? 'Edit Mitra' : 'Tambah Mitra Baru'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? `Mengubah data ${editParty.name}` : 'Pelanggan, vendor, atau keduanya'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Tipe Mitra */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tipe Mitra</p>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['Customer', 'Supplier', 'Both'] as PartyType[]).map(type => (
                <button
                  key={type}
                  onClick={() => set('partyType', type)}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-semibold transition-colors',
                    form.partyType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {type === 'Customer' ? 'Pelanggan' : type === 'Supplier' ? 'Vendor / Supplier' : 'Keduanya'}
                </button>
              ))}
            </div>
          </div>

          {/* Identitas */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Identitas</p>
            <div className="space-y-3">
              {/* Nama */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nama / Perusahaan <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Building2 size={14} className={iconCls} />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="PT Maju Bersama / Budi Santoso"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* NPWP */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">NPWP</label>
                <div className="relative">
                  <CreditCard size={14} className={iconCls} />
                  <input
                    type="text"
                    value={form.npwp}
                    onChange={e => set('npwp', e.target.value)}
                    placeholder="00.000.000.0-000.000"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Kontak */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Kontak</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Telepon / WhatsApp</label>
                <div className="relative">
                  <Phone size={14} className={iconCls} />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="08xx-xxxx-xxxx"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <div className="relative">
                  <Mail size={14} className={iconCls} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="email@perusahaan.com"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Alamat */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Alamat</p>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3 text-gray-300" />
              <textarea
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Jl. Sudirman No. 1, Kelurahan ..., Kota ..., Provinsi ..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {form.partyType === 'Customer' ? 'Pelanggan' : form.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor'}
            {form.name ? ` — ${form.name}` : ''}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button
              onClick={handleSubmit}
              disabled={!form.name.trim() || mutation.isPending}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : isEdit ? 'Simpan Perubahan' : 'Simpan Mitra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyFormModal;
