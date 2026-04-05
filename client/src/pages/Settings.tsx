import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import {
  Calendar, Lock, Unlock, Plus, CheckCircle2, ChevronRight,
  Building2, Save, Settings, Loader2, Upload, X, ImageIcon,
  Info, Tag, Clock, Sparkles, ExternalLink, RefreshCw, CheckCircle, ArrowUpCircle,
  Receipt, Edit2, Trash2, ToggleLeft, ToggleRight,
  HardDrive, Download, RotateCcw, AlertTriangle, Shield, Database,
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { APP_VERSION, APP_BUILD_DATE, APP_NAME, CHANGELOG } from '../lib/version';
import { SystemAccountsTab } from '../components/SystemAccountsTab';

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
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null);

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

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/fiscal-years/${id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku berhasil dibuka kembali.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuka tahun buku.')
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

              <div className="mt-4 flex gap-2">
                {!year.isClosed ? (
                  <button
                    onClick={() => setConfirmClose(year.id)}
                    disabled={closeMutation.isPending}
                    className="w-full btn-secondary justify-center text-xs py-2 disabled:opacity-50"
                  >
                    <Lock size={13} /> Tutup Buku
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmReopen(year.id)}
                    disabled={reopenMutation.isPending}
                    className="w-full btn-secondary justify-center text-xs py-2 disabled:opacity-50"
                  >
                    <Unlock size={13} /> Buka Kembali
                  </button>
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
        message="Yakin ingin menutup tahun buku ini? Jurnal penutup akan dibuat dan saldo revenue/expense akan direset."
        confirmLabel="Tutup Buku"
        variant="danger"
        onConfirm={() => { if (confirmClose) closeMutation.mutate(confirmClose); setConfirmClose(null); }}
        onCancel={() => setConfirmClose(null)}
      />

      {/* Confirm reopen dialog */}
      <ConfirmDialog
        open={confirmReopen !== null}
        title="Buka Kembali Tahun Buku"
        message="Yakin ingin membuka kembali tahun buku ini? Jurnal penutup akan dihapus dan saldo revenue/expense akan dipulihkan."
        confirmLabel="Buka Kembali"
        variant="danger"
        onConfirm={() => { if (confirmReopen) reopenMutation.mutate(confirmReopen); setConfirmReopen(null); }}
        onCancel={() => setConfirmReopen(null)}
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
    companyName: '',
    address: '',
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
    { key: 'companyName', label: 'Nama Perusahaan', placeholder: 'Nama Perusahaan Anda', type: 'text' },
    { key: 'address', label: 'Alamat', placeholder: 'Alamat perusahaan', type: 'text' },
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
interface UpdateInfo {
  status: 'latest' | 'available' | 'error';
  remoteVersion?: string;
  remoteChangelog?: Array<{ version: string; date: string; title: string; changes: string[] }>;
  errorMsg?: string;
}

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/Logia-ysn/aplikasi-keuangan-pmd/main/client/src/lib/version.ts';

/** Parse APP_VERSION and CHANGELOG from the raw version.ts file content */
function parseRemoteVersion(source: string): { version: string; changelog: UpdateInfo['remoteChangelog'] } {
  // Extract APP_VERSION
  const versionMatch = source.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const version = versionMatch?.[1] || '';

  // Extract CHANGELOG entries — simple regex approach
  const changelog: UpdateInfo['remoteChangelog'] = [];
  const entryRegex = /\{\s*version:\s*'([^']+)',\s*date:\s*'([^']+)',\s*title:\s*'([^']+)',\s*changes:\s*\[([\s\S]*?)\],?\s*\}/g;
  let match;
  while ((match = entryRegex.exec(source)) !== null) {
    const changes = [...match[4].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    changelog.push({ version: match[1], date: match[2], title: match[3], changes });
  }

  return { version, changelog };
}

/** Compare semver strings: returns 1 if a > b, -1 if a < b, 0 if equal */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

interface RuntimeInfo {
  platform: string;
  domain: string;
  hostname: string;
  nodeVersion: string;
  memory: string;
  uptime: number;
  env: string;
}

const AboutTab: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    api.get('/settings/runtime').then(res => setRuntime(res.data)).catch(() => {
      setRuntime({ platform: '-', domain: window.location.origin, hostname: '-', nodeVersion: '-', memory: '-', uptime: 0, env: '-' });
    });
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateInfo(null);
    try {
      const res = await fetch(GITHUB_RAW_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const source = await res.text();
      const { version, changelog } = parseRemoteVersion(source);

      if (!version) throw new Error('Gagal membaca versi dari repository.');

      if (compareSemver(version, APP_VERSION) > 0) {
        // Newer version available — find new entries
        const newEntries = changelog?.filter((e) => compareSemver(e.version, APP_VERSION) > 0) || [];
        setUpdateInfo({ status: 'available', remoteVersion: version, remoteChangelog: newEntries });
      } else {
        setUpdateInfo({ status: 'latest', remoteVersion: version });
      }
    } catch (err: any) {
      setUpdateInfo({ status: 'error', errorMsg: err?.message || 'Gagal memeriksa pembaruan.' });
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
                <p className="text-blue-100 text-xs">Sistem ERP Keuangan</p>
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
              <p className="text-sm font-bold text-gray-900">{runtime?.platform || '...'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ExternalLink size={12} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Domain</span>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">{runtime?.domain || window.location.origin}</p>
            </div>
          </div>

          {/* Check for updates */}
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheckUpdate}
                disabled={checking}
                className="btn-secondary text-xs py-2"
              >
                {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {checking ? 'Memeriksa...' : 'Periksa Pembaruan'}
              </button>

              {updateInfo?.status === 'latest' && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle size={14} />
                  <span className="font-medium">Aplikasi sudah versi terbaru (v{updateInfo.remoteVersion}).</span>
                </div>
              )}
              {updateInfo?.status === 'error' && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <Info size={14} />
                  <span className="font-medium">{updateInfo.errorMsg}</span>
                </div>
              )}
            </div>

            {/* Update available card */}
            {updateInfo?.status === 'available' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle size={16} className="text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">
                      Pembaruan tersedia: v{updateInfo.remoteVersion}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-blue-500 bg-blue-100 px-2 py-0.5 rounded">
                    v{APP_VERSION} → v{updateInfo.remoteVersion}
                  </span>
                </div>

                {/* New changes */}
                {updateInfo.remoteChangelog && updateInfo.remoteChangelog.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-blue-700">Perubahan baru:</p>
                    {updateInfo.remoteChangelog.map((entry) => (
                      <div key={entry.version} className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                            v{entry.version}
                          </span>
                          <span className="text-xs font-medium text-gray-800">{entry.title}</span>
                          <span className="text-[10px] text-gray-400 font-mono ml-auto">{entry.date}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {entry.changes.map((c, i) => (
                            <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                              <span className="text-blue-400 mt-0.5">•</span> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white/60 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="font-semibold text-gray-700">Cara update di server:</p>
                  <pre className="bg-gray-900 text-green-300 rounded-lg p-2.5 text-[11px] font-mono overflow-x-auto">
{`cd ~/aplikasi-keuangan-pmd
git pull origin main
docker compose up -d --build`}</pre>
                </div>
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

// ─── Tax Config Tab ──────────────────────────────────────
interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  type: string;
  accountId: string | null;
  isActive: boolean;
}

const TaxConfigTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', rate: '', type: 'sales', accountId: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: configs, isLoading } = useQuery<TaxConfig[]>({
    queryKey: ['tax-configs'],
    queryFn: async () => { const res = await api.get('/tax/config'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => api.post('/tax/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat konfigurasi pajak.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api.put(`/tax/config/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setEditingId(null);
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil diperbarui.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal memperbarui konfigurasi pajak.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/tax/config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success('Konfigurasi pajak dinonaktifkan.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus konfigurasi pajak.'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/tax/config/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mengubah status.'),
  });

  const resetForm = () => {
    setFormData({ name: '', rate: '', type: 'sales', accountId: '' });
    setEditingId(null);
  };

  const handleEdit = (config: TaxConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      rate: String(config.rate),
      type: config.type,
      accountId: config.accountId || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      name: formData.name,
      rate: parseFloat(formData.rate),
      type: formData.type,
      accountId: formData.accountId || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    sales: { label: 'Penjualan', color: 'badge-blue' },
    purchase: { label: 'Pembelian', color: 'badge-yellow' },
    withholding: { label: 'Pemotongan', color: 'badge-purple' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Konfigurasi Pajak</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Kelola tarif PPN, PPh, dan pajak lainnya.
          </p>
        </div>
        <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary">
          <Plus size={15} /> Tambah Pajak
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Pajak</th>
                <th className="text-right">Tarif (%)</th>
                <th className="text-center">Tipe</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!configs || configs.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Belum ada konfigurasi pajak
                  </td>
                </tr>
              ) : (
                configs.map((config) => (
                  <tr key={config.id} className={cn(!config.isActive && 'opacity-50')}>
                    <td className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {config.name}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {Number(config.rate).toFixed(2)}%
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', typeLabels[config.type]?.color || 'badge-gray')}>
                        {typeLabels[config.type]?.label || config.type}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => toggleMutation.mutate({ id: config.id, isActive: !config.isActive })}
                        className="inline-flex items-center gap-1"
                        title={config.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {config.isActive ? (
                          <ToggleRight size={20} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={20} style={{ color: 'var(--color-text-muted)' }} />
                        )}
                      </button>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(config)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={13} className="text-blue-500" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(config.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Nonaktifkan"
                        >
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Tax Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {editingId ? 'Edit Konfigurasi Pajak' : 'Tambah Konfigurasi Pajak'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Nama Pajak *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder='Contoh: "PPN 11%", "PPh 23"'
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                  style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Tarif (%) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    placeholder="11.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Tipe *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="sales">Penjualan (PPN Keluaran)</option>
                    <option value="purchase">Pembelian (PPN Masukan)</option>
                    <option value="withholding">Pemotongan (PPh)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.rate || createMutation.isPending || updateMutation.isPending}
                className="flex-1 btn-primary justify-center disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Nonaktifkan Pajak"
        message="Yakin ingin menonaktifkan konfigurasi pajak ini?"
        confirmLabel="Nonaktifkan"
        variant="danger"
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

// ─── Backup Tab ─────────────────────────────────────────
const BackupTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoreInput, setRestoreInput] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/generate-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dibuat: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.journals} jurnal, ${r.inventoryItems} item`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat data dummy.'),
  });

  const deleteDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/delete-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dihapus: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.inventoryItems} item`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus data dummy.'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => api.post('/settings/reset-data', { confirmation: 'RESET' }),
    onSuccess: () => {
      toast.success('Data berhasil direset. Login ulang...');
      localStorage.removeItem('user');
      localStorage.removeItem('onboardingDone');
      localStorage.removeItem('widgetPrefs');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mereset data.'),
  });

  const { data: backups, isLoading } = useQuery<Array<{ filename: string; size: number; date: string }>>({
    queryKey: ['backups'],
    queryFn: async () => { const res = await api.get('/backup/list'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/backup/create'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success('Backup berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat backup.'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (filename: string) => api.post('/backup/restore', { filename }),
    onSuccess: () => {
      toast.success('Restore berhasil. Silakan refresh halaman.');
      setConfirmRestore(null);
      setRestoreInput('');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal restore backup.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/backup/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(res.data.message || 'File backup berhasil diupload.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mengupload file backup.'),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.sql.gz')) {
      toast.error('Hanya file .sql.gz yang diperbolehkan.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleDownload = (filename: string) => {
    const baseUrl = (import.meta as any).env?.VITE_API_URL || '/api';
    const url = `${baseUrl}/backup/download/${encodeURIComponent(filename)}`;
    // Cookie-based auth — no need for Authorization header
    fetch(url, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error('Gagal mengunduh backup.'));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const lastBackup = backups?.[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Backup & Restore</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Kelola cadangan database aplikasi.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql.gz"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn-secondary"
          >
            {uploadMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploadMutation.isPending ? 'Mengupload...' : 'Upload Backup'}
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
            {createMutation.isPending ? 'Memproses...' : 'Buat Backup'}
          </button>
        </div>
      </div>

      {/* Last backup info */}
      {lastBackup && (
        <div
          className="flex items-center gap-4 p-4 rounded-xl border"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Backup Terakhir
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(lastBackup.date).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' '}&middot; {formatSize(lastBackup.size)}
            </p>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
        <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <p className="font-semibold text-yellow-800 dark:text-yellow-400">Perhatian:</p>
          <p>Restore akan <strong>menimpa seluruh data</strong> yang ada. Pastikan Anda membuat backup sebelum melakukan restore. Maksimal 5 backup disimpan secara otomatis.</p>
        </div>
      </div>

      {/* Backup list */}
      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama File</th>
                <th className="text-right">Ukuran</th>
                <th>Tanggal</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!backups || backups.length === 0) ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Belum ada file backup
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td>
                      <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {backup.filename}
                      </span>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatSize(backup.size)}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(backup.date).toLocaleString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDownload(backup.filename)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Unduh"
                        >
                          <Download size={13} className="text-blue-500" />
                        </button>
                        <button
                          onClick={() => { setConfirmRestore(backup.filename); setRestoreInput(''); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Restore"
                        >
                          <RotateCcw size={13} className="text-orange-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setConfirmRestore(null)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Konfirmasi Restore
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Aksi ini tidak dapat dibatalkan
                </p>
              </div>
            </div>

            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Restore akan menimpa <strong>seluruh data</strong> saat ini dengan data dari:
            </p>
            <p className="text-xs font-mono font-semibold mb-4 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
              {confirmRestore}
            </p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Ketik <strong>RESTORE</strong> untuk mengonfirmasi:
            </p>
            <input
              type="text"
              value={restoreInput}
              onChange={(e) => setRestoreInput(e.target.value)}
              placeholder="Ketik RESTORE"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-red-400 outline-none mb-4"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button onClick={() => setConfirmRestore(null)} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={() => restoreMutation.mutate(confirmRestore)}
                disabled={restoreInput !== 'RESTORE' || restoreMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoreMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {restoreMutation.isPending ? 'Memproses...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dummy Data — Development */}
      <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-start gap-3">
            <Database size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-400">Data Dummy (Testing)</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Generate data transaksi contoh (customer, supplier, invoice, jurnal, inventory) untuk testing.
                Data dummy bisa dihapus tanpa mempengaruhi data asli.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => generateDummyMutation.mutate()}
                  disabled={generateDummyMutation.isPending || deleteDummyMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {generateDummyMutation.isPending ? <><Loader2 size={12} className="animate-spin inline mr-1" /> Membuat...</> : '+ Generate Dummy'}
                </button>
                <button
                  onClick={() => deleteDummyMutation.mutate()}
                  disabled={generateDummyMutation.isPending || deleteDummyMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 dark:text-orange-300 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteDummyMutation.isPending ? <><Loader2 size={12} className="animate-spin inline mr-1" /> Menghapus...</> : 'Hapus Dummy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Data — Development Only */}
      <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-400">Reset Seluruh Data</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Hapus semua data transaksi, akun, mitra, dan pengguna. Database akan dikembalikan ke kondisi awal (seed data).
              Fitur ini hanya untuk development/testing.
            </p>
            <button
              onClick={() => { setShowResetConfirm(true); setResetInput(''); }}
              className="mt-3 px-4 py-2 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
            >
              Reset Data
            </button>
          </div>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setShowResetConfirm(false)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Reset Seluruh Data
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Aksi ini tidak dapat dibatalkan
                </p>
              </div>
            </div>

            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Semua data akan dihapus dan dikembalikan ke kondisi awal:
            </p>
            <ul className="text-xs mb-4 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <li>• Semua transaksi (invoice, payment, journal)</li>
              <li>• Semua mitra (customer, supplier)</li>
              <li>• Semua akun (COA) dan saldo</li>
              <li>• Semua user (akan dibuat ulang dari seed)</li>
              <li>• Semua stok dan gerakan inventori</li>
            </ul>

            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Ketik <strong>RESET</strong> untuk mengonfirmasi:
            </p>
            <input
              type="text"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder="Ketik RESET"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-red-400 outline-none mb-4"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetInput !== 'RESET' || resetMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {resetMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                {resetMutation.isPending ? 'Mereset...' : 'Reset Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Settings Page ───────────────────────────────────
export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fiscal' | 'company' | 'accounts' | 'tax' | 'backup' | 'about'>('fiscal');
  const tabs = [
    { id: 'fiscal', label: 'Tahun Buku', icon: Calendar },
    { id: 'company', label: 'Profil Perusahaan', icon: Building2 },
    { id: 'accounts', label: 'Akun Sistem', icon: Shield },
    { id: 'tax', label: 'Pajak', icon: Receipt },
    { id: 'backup', label: 'Backup', icon: HardDrive },
    { id: 'about', label: 'Tentang Aplikasi', icon: Info },
  ];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <Settings size={18} className="text-gray-400" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pengaturan</h1>
          <p className="text-sm text-gray-500">Konfigurasi sistem Keuangan.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {activeTab === 'fiscal' && <FiscalYearsTab />}
      {activeTab === 'company' && <CompanySettingsTab />}
      {activeTab === 'accounts' && <SystemAccountsTab />}
      {activeTab === 'tax' && <TaxConfigTab />}
      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'about' && <AboutTab />}
    </div>
  );
};
