import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import {
  Calendar, Lock, Unlock, Plus, CheckCircle2, ChevronRight,
  Building2, Save, Settings, Loader2, Upload, X, ImageIcon,
  Info, Tag, Clock, Sparkles, ExternalLink, RefreshCw, CheckCircle, ArrowUpCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { APP_VERSION, APP_BUILD_DATE, APP_NAME, CHANGELOG } from '../lib/version';

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt: string | null;
}

// ─── Fiscal Year Tab ──────────────────────────────────────
const FiscalYearsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const { data: years, isLoading } = useQuery<FiscalYear[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => { const res = await api.get('/fiscal-years'); return res.data; }
  });

  const createMutation = useMutation({
    mutationFn: async (d: any) => api.post('/fiscal-years', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      setIsModalOpen(false); setNewName(''); setNewStart(''); setNewEnd('');
      toast.success('Tahun buku berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat tahun buku.')
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/fiscal-years/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku berhasil ditutup.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menutup tahun buku.')
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Periode Akuntansi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Kelola tahun buku dan proses tutup buku.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus size={15} /> Tahun Buku Baru
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center text-gray-400 gap-2 text-sm">
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {years?.map((year) => (
            <div key={year.id} className={cn(
              'bg-white border rounded-xl p-5 transition-all',
              year.isClosed ? 'border-gray-200 opacity-70' : 'border-gray-200 shadow-sm'
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                  {year.isClosed
                    ? <Lock size={14} className="text-gray-500" />
                    : <Unlock size={14} className="text-blue-500" />}
                </div>
                <span className={cn('badge', year.isClosed ? 'badge-gray' : 'badge-blue')}>
                  {year.isClosed ? 'Closed' : 'Open'}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-gray-900">Tahun {year.name}</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mt-2">
                <Calendar size={12} />
                <span>{format(new Date(year.startDate), 'dd MMM yyyy', { locale: id })}</span>
                <ChevronRight size={10} className="text-gray-300" />
                <span>{format(new Date(year.endDate), 'dd MMM yyyy', { locale: id })}</span>
              </div>

              {year.isClosed && year.closedAt && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3">
                  <CheckCircle2 size={11} className="text-green-500" />
                  Ditutup {format(new Date(year.closedAt), 'Pp', { locale: id })}
                </div>
              )}

              <div className="mt-4">
                {!year.isClosed ? (
                  <button
                    onClick={() => setConfirmClose(year.id)}
                    disabled={closeMutation.isPending}
                    className="w-full btn-secondary justify-center text-xs py-2 disabled:opacity-50"
                  >
                    <Lock size={13} /> Tutup Buku
                  </button>
                ) : (
                  <p className="text-center text-xs text-gray-400 py-2">Periode dikunci</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm close dialog */}
      <ConfirmDialog
        open={confirmClose !== null}
        title="Tutup Tahun Buku"
        message="Yakin ingin menutup tahun buku ini? Proses ini tidak dapat dibatalkan."
        confirmLabel="Tutup Buku"
        variant="danger"
        onConfirm={() => { if (confirmClose) closeMutation.mutate(confirmClose); setConfirmClose(null); }}
        onCancel={() => setConfirmClose(null)}
      />

      {/* New fiscal year modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fy-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-md">
            <h2 id="fy-modal-title" className="text-base font-semibold text-gray-900 mb-4">Tambah Tahun Buku</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="fy-name" className="block text-xs font-medium text-gray-700 mb-1">Nama Tahun</label>
                <input id="fy-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="2027"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fy-start" className="block text-xs font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                  <input id="fy-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
                </div>
                <div>
                  <label htmlFor="fy-end" className="block text-xs font-medium text-gray-700 mb-1">Tanggal Selesai</label>
                  <input id="fy-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 btn-secondary justify-center">Batal</button>
              <button
                onClick={() => createMutation.mutate({ name: newName, startDate: newStart, endDate: newEnd })}
                disabled={!newName || !newStart || !newEnd || createMutation.isPending}
                className="flex-1 btn-primary justify-center"
              >
                {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Company Settings Tab ─────────────────────────────────
const CompanySettingsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState({
    companyName: 'PT Pangan Masa Depan',
    address: 'Cirebon, Jawa Barat',
    phone: '',
    email: '',
    taxId: '',
    defaultCurrency: 'IDR',
    logoUrl: null as string | null,
  });

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      try { const res = await api.get('/settings/company'); return res.data; } catch { return null; }
    },
    staleTime: 60000
  });

  React.useEffect(() => {
    if (settings && !isDirty) {
      setFormData((prev) => ({
        ...prev,
        companyName: settings.companyName || settings.name || prev.companyName,
        address: settings.address || prev.address,
        phone: settings.phone || '',
        email: settings.email || '',
        taxId: settings.taxId || '',
        defaultCurrency: settings.defaultCurrency || settings.currency || 'IDR',
        logoUrl: settings.logoUrl || null,
      }));
    }
  }, [settings, isDirty]);

  const handleChange = (key: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => api.put('/settings/company', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      setIsDirty(false);
      toast.success('Pengaturan berhasil disimpan.');
    },
    onError: () => toast.error('Gagal menyimpan pengaturan.')
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      handleChange('logoUrl', ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    handleChange('logoUrl', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fields = [
    { key: 'companyName', label: 'Nama Perusahaan', placeholder: 'PT Pangan Masa Depan', type: 'text' },
    { key: 'address', label: 'Alamat', placeholder: 'Cirebon, Jawa Barat', type: 'text' },
    { key: 'phone', label: 'Nomor Telepon', placeholder: '+62 xxx', type: 'text' },
    { key: 'email', label: 'Email', placeholder: 'finance@company.com', type: 'email' },
    { key: 'taxId', label: 'NPWP', placeholder: '00.000.000.0-000.000', type: 'text' },
    { key: 'defaultCurrency', label: 'Mata Uang', placeholder: 'IDR', type: 'text' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Profil Perusahaan</h2>
        <p className="text-sm text-gray-500 mt-0.5">Informasi muncul di laporan keuangan dan tampilan aplikasi.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
        {/* Logo Upload Section */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-3">Logo Perusahaan</label>
          <div className="flex items-start gap-4">
            <div className="w-28 h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo preview" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <ImageIcon size={20} />
                  <span className="text-[10px]">Belum ada</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label htmlFor="logo-upload" className="btn-secondary cursor-pointer text-xs py-1.5 px-3">
                <Upload size={13} />
                {formData.logoUrl ? 'Ganti Logo' : 'Upload Logo'}
              </label>

              {formData.logoUrl && (
                <button type="button" onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
                  <X size={12} /> Hapus Logo
                </button>
              )}

              <p className="text-[11px] text-gray-400 mt-1">
                PNG, JPG, SVG · Maks. 2MB<br />
                Disarankan: background transparan
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`field-${f.key}`} className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <input
                id={`field-${f.key}`}
                type={f.type}
                value={(formData as any)[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── About & Changelog Tab ───────────────────────────────
const AboutTab: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<'latest' | 'available' | null>(null);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateResult(null);
    try {
      // Fetch latest release from GitHub API
      const res = await fetch('https://api.github.com/repos/Logia-ysn/aplikasi-keuangan-pmd/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const latestTag = (data.tag_name || '').replace(/^v/, '');
        if (latestTag && latestTag !== APP_VERSION) {
          setUpdateResult('available');
        } else {
          setUpdateResult('latest');
        }
      } else {
        // No releases or error — compare with latest commit
        const commitRes = await fetch('https://api.github.com/repos/Logia-ysn/aplikasi-keuangan-pmd/commits/main');
        if (commitRes.ok) {
          setUpdateResult('latest'); // Can't compare semver from commits
        }
      }
    } catch {
      setUpdateResult('latest');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* App Info Card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Sparkles size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{APP_NAME}</h3>
                <p className="text-blue-100 text-xs">Sistem ERP Keuangan — PT Pangan Masa Depan</p>
              </div>
            </div>
            <span className="bg-white/20 text-white text-sm font-mono font-bold px-3 py-1.5 rounded-lg">
              v{APP_VERSION}
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Tag size={12} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Versi</span>
              </div>
              <p className="text-sm font-bold text-gray-900 font-mono">{APP_VERSION}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Build Date</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{APP_BUILD_DATE}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Info size={12} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Platform</span>
              </div>
              <p className="text-sm font-bold text-gray-900">Raspberry Pi 5</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ExternalLink size={12} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Domain</span>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">keuangan.pmd</p>
            </div>
          </div>

          {/* Check for updates */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleCheckUpdate}
              disabled={checking}
              className="btn-secondary text-xs py-2"
            >
              {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {checking ? 'Memeriksa...' : 'Periksa Pembaruan'}
            </button>

            {updateResult === 'latest' && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle size={14} />
                <span className="font-medium">Aplikasi sudah versi terbaru.</span>
              </div>
            )}
            {updateResult === 'available' && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600">
                <ArrowUpCircle size={14} />
                <span className="font-medium">Pembaruan tersedia! Hubungi admin untuk update server.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Changelog */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Changelog</h2>
          <span className="badge badge-blue text-[10px]">{CHANGELOG.length} rilis</span>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[17px] top-8 bottom-4 w-px bg-gray-200" />

          <div className="space-y-1">
            {CHANGELOG.map((entry, idx) => (
              <div key={entry.version} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 mt-1 flex-shrink-0">
                  <div className={cn(
                    'w-[9px] h-[9px] rounded-full ring-4 ring-white',
                    idx === 0 ? 'bg-blue-500' : 'bg-gray-300'
                  )} />
                </div>

                {/* Content */}
                <div className={cn(
                  'flex-1 bg-white border rounded-xl p-4 mb-3 transition-all',
                  idx === 0 ? 'border-blue-200 shadow-sm' : 'border-gray-200'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'font-mono text-xs font-bold px-2 py-0.5 rounded',
                        idx === 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        v{entry.version}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{entry.date}</span>
                  </div>
                  <ul className="space-y-1">
                    {entry.changes.map((change, ci) => (
                      <li key={ci} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="text-gray-300 mt-0.5 flex-shrink-0">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Settings Page ───────────────────────────────────
export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fiscal' | 'company' | 'about'>('fiscal');
  const tabs = [
    { id: 'fiscal', label: 'Tahun Buku', icon: Calendar },
    { id: 'company', label: 'Profil Perusahaan', icon: Building2 },
    { id: 'about', label: 'Tentang Aplikasi', icon: Info },
  ];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <Settings size={18} className="text-gray-400" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pengaturan</h1>
          <p className="text-sm text-gray-500">Konfigurasi sistem PMD Finance.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fiscal' && <FiscalYearsTab />}
      {activeTab === 'company' && <CompanySettingsTab />}
      {activeTab === 'about' && <AboutTab />}
    </div>
  );
};
