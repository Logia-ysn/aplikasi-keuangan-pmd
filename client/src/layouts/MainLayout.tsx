import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { LogOut, Search, Keyboard, KeyRound, Menu } from 'lucide-react';
import { NotificationBell } from '../components/NotificationBell';
import { useHotkey } from '../hooks/useHotkeys';
import { CommandPalette } from '../components/CommandPalette';
import { ShortcutHelp } from '../components/ShortcutHelp';
import ChangePasswordModal from '../components/ChangePasswordModal';
import OnboardingWizard from '../components/OnboardingWizard';

const routeNames: Record<string, string> = {
  '': 'Dashboard',
  'coa': 'Bagan Akun',
  'gl': 'Buku Besar',
  'sales': 'Penjualan',
  'purchase': 'Pembelian',
  'payments': 'Bank & Kas',
  'parties': 'Pelanggan & Vendor',
  'reports': 'Laporan Keuangan',
  'inventory': 'Stok & Gudang',
  'reconciliation': 'Rekonsiliasi Bank',
  'settings': 'Pengaturan',
  'users': 'Manajemen User',
  'audit': 'Jejak Audit',
  'notifications': 'Notifikasi',
  'recurring': 'Transaksi Berulang',
};

export const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem('onboardingDone');
    if (done !== 'true') {
      setShowOnboarding(true);
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useHotkey('mod+k', () => setIsSearchOpen(true));
  useHotkey('?', () => setIsShortcutHelpOpen(true), !isSearchOpen && !isShortcutHelpOpen);

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {}

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const segment = location.pathname.split('/').filter(Boolean)[0] || '';
  const pageName = routeNames[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      {/* Skip nav link (ACC-05) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-white px-4 py-2 rounded text-sm font-medium text-blue-700 shadow"
      >
        Langsung ke konten utama
      </a>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out">
            <Sidebar mobileOpen={true} onMobileClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden main-content">
        {/* Header */}
        <header
          className="h-14 border-b flex items-center px-3 lg:px-6 justify-between shrink-0"
          style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          data-no-print
        >
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {/* Hamburger menu button - only on mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1 mr-1 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline">Finance</span>
            <span className="hidden sm:inline" style={{ color: 'var(--color-text-muted)' }}>/</span>
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{pageName}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--color-text-muted)' }}
              title="Pencarian (Ctrl+K)"
            >
              <Search className="w-4 h-4" />
            </button>
            {/* Shortcuts help button */}
            <button
              onClick={() => setIsShortcutHelpOpen(true)}
              className="hidden sm:block p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--color-text-muted)' }}
              title="Pintasan Keyboard (?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            {/* Notification bell */}
            <NotificationBell />
            <div className="flex items-center gap-2 sm:gap-2.5 pl-1.5 sm:pl-2 ml-0.5 sm:ml-1 border-l" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold leading-none" style={{ color: 'var(--color-text-primary)' }}>{user?.fullName || 'User'}</p>
                <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{user?.role || 'Role'}</p>
              </div>
            </div>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              aria-label="Ganti Password"
              className="hidden sm:block p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--color-text-muted)' }}
              title="Ganti Password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              aria-label="Logout"
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div id="main-content" className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Shortcut Help */}
      <ShortcutHelp isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />

      {/* Change Password Modal */}
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      {/* Onboarding Wizard */}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
};
