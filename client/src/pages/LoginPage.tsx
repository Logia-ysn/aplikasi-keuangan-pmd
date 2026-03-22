import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Lock, User, AlertCircle, Eye, EyeOff, BarChart3, ShieldCheck, TrendingUp } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../lib/version';

// Fallback brand logo (SVG generic finance branding)
const AppLogoFallback = () => (
  <svg viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-10 w-auto">
    {/* Bar 1 */}
    <rect x="0" y="10" width="14" height="30" fill="#6B7280" />
    {/* Bar 2 */}
    <rect x="18" y="4" width="14" height="36" fill="#6B7280" />
    {/* Bar 3 */}
    <rect x="36" y="18" width="14" height="22" fill="#6B7280" />
    {/* Blue diagonal stripe */}
    <path d="M0 34 L50 6" stroke="#2563EB" strokeWidth="5" strokeLinecap="round" />
    {/* Accent dot */}
    <circle cx="47" cy="8" r="4" fill="#2563EB" />
    {/* App name */}
    <text x="58" y="26" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="16" fill="#111827" letterSpacing="1">Keuangan</text>
    <text x="58" y="36" fontFamily="Arial, sans-serif" fontWeight="500" fontSize="6" fill="#6B7280" letterSpacing="1.5">FINANCE SYSTEM</text>
  </svg>
);

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Try to load logo from settings (cached by browser, no auth needed for this)
  const [logoUrl] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login gagal. Periksa kembali email dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel: Branding ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between overflow-hidden bg-[#111827]">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-[#111827] to-gray-950" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Blue glow — top left */}
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[100px]" />
        {/* Gray glow — bottom right */}
        <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] rounded-full bg-gray-600/20 blur-[100px]" />

        {/* Top: Logo */}
        <div className="relative z-10 p-10">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
          ) : (
            <AppLogoFallback />
          )}
        </div>

        {/* Center: Headline */}
        <div className="relative z-10 px-12 pb-4">
          <p className="text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">
            Sistem ERP Keuangan
          </p>
          <h2 className="text-4xl font-bold text-white leading-tight mb-5">
            Kelola keuangan<br />perusahaan dengan<br />lebih efisien.
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
            Platform terintegrasi untuk pengelolaan penjualan, pembelian, dan laporan keuangan real-time.
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-3 mt-8">
            {[
              { icon: BarChart3, label: 'Laporan Real-time' },
              { icon: ShieldCheck, label: 'Data Aman' },
              { icon: TrendingUp, label: 'Multi-modul' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"
              >
                <Icon className="w-4 h-4 text-blue-400" />
                <span className="text-gray-300 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Footer */}
        <div className="relative z-10 px-12 py-8 border-t border-white/5 flex items-center justify-between">
          <p className="text-gray-600 text-xs">
            © {new Date().getFullYear()} Keuangan ERP. All rights reserved.
          </p>
          <span className="text-gray-600 text-[10px] font-mono bg-white/5 border border-white/10 rounded px-2 py-0.5">
            v{APP_VERSION}
          </span>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-10">
            <AppLogoFallback />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Selamat datang</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-600 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all shadow-sm"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="admin@perusahaan.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl py-3 pl-10 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all shadow-sm"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Masukkan password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl text-sm shadow-md shadow-blue-500/20 active:scale-[0.99] transition-all mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Memproses...
                </span>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: 'var(--color-text-muted)' }}>
            Lupa password?{' '}
            <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Hubungi Administrator</span>
          </p>

          {/* Version badge */}
          <div className="mt-10 flex items-center justify-center gap-2">
            <span className="text-[10px] font-mono rounded px-2 py-0.5"
              style={{
                color: 'var(--color-text-muted)',
                backgroundColor: 'var(--color-bg-tertiary)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
              }}
            >
              v{APP_VERSION}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>build {APP_BUILD_DATE}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
