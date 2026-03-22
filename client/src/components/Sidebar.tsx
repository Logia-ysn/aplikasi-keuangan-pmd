import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  Users,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Package,
  Network,
  Warehouse,
  Sun,
  Moon,
  Monitor,
  Shield,
  ScrollText,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useTheme } from '../contexts/ThemeContext';

const baseNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Network, label: 'Bagan Akun', href: '/coa' },
  { icon: Receipt, label: 'Buku Besar', href: '/gl' },
  { icon: ShoppingCart, label: 'Penjualan', href: '/sales' },
  { icon: Package, label: 'Pembelian', href: '/purchase' },
  { icon: Warehouse, label: 'Stok & Gudang', href: '/inventory' },
  { icon: CreditCard, label: 'Bank & Kas', href: '/payments' },
  { icon: Users, label: 'Pelanggan & Vendor', href: '/parties' },
  { icon: FileBarChart, label: 'Laporan Keuangan', href: '/reports' },
  { icon: Settings, label: 'Pengaturan', href: '/settings' },
];

const adminNavItems = [
  { icon: Shield, label: 'Manajemen User', href: '/users' },
  { icon: ScrollText, label: 'Jejak Audit', href: '/audit' },
];

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const location = useLocation();
  const settings = useCompanySettings();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  const themeLabel = theme === 'dark' ? 'Tema: Gelap' : theme === 'system' ? 'Tema: Sistem' : 'Tema: Terang';

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const navItems = useMemo(() => {
    const items = [...baseNavItems];
    if (user?.role === 'Admin') {
      items.push(...adminNavItems);
    }
    return items;
  }, [user?.role]);

  return (
    <aside
      data-no-print
      className={cn(
        'h-screen border-r transition-all duration-300 flex flex-col z-50 flex-shrink-0',
        isCollapsed ? 'w-[60px]' : 'w-[220px]'
      )}
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="h-8 w-auto object-contain max-w-[120px]"
              />
            ) : (
              <>
                <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-[10px] leading-none">Rp</span>
                </div>
                <span className="text-sm font-bold text-gray-900 tracking-tight truncate">
                  {settings?.companyName || 'Keuangan'}
                </span>
              </>
            )}
          </div>
        )}
        {isCollapsed && settings?.logoUrl && (
          <img
            src={settings.logoUrl}
            alt="Logo"
            className="h-7 w-7 object-contain mx-auto"
          />
        )}
        {isCollapsed && !settings?.logoUrl && (
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center mx-auto">
            <span className="text-white font-black text-[9px] leading-none">Rp</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto flex-shrink-0"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              to={item.href}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 my-0.5 rounded-lg text-sm transition-colors duration-150',
                isActive
                  ? 'bg-blue-50 text-blue-800 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium'
              )}
            >
              <item.icon
                size={18}
                className={cn('flex-shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')}
              />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="px-2 pb-1">
        <button
          onClick={cycleTheme}
          title={themeLabel}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors',
            'hover:bg-gray-50 dark:hover:bg-gray-700/50'
          )}
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ThemeIcon size={16} className="flex-shrink-0" />
          {!isCollapsed && <span className="truncate text-xs font-medium">{themeLabel}</span>}
        </button>
      </div>

      {/* User */}
      <div className="border-t p-3" style={{ borderColor: 'var(--color-border-light)' }}>
        <div className={cn('flex items-center gap-2 p-2 rounded-lg', isCollapsed && 'justify-center')}>
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-xs text-blue-700 flex-shrink-0">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{user?.fullName || 'User'}</p>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{user?.role || 'Admin'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
