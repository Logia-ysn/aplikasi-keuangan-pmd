import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { LogOut } from 'lucide-react';

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
  'settings': 'Pengaturan',
};

export const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      {/* Skip nav link (ACC-05) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-white px-4 py-2 rounded text-sm font-medium text-blue-700 shadow"
      >
        Langsung ke konten utama
      </a>

      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden main-content">
        {/* Header */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 justify-between shrink-0" data-no-print>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span>Finance</span>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-900">{pageName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 pr-3 border-r border-gray-200">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-gray-900 leading-none">{user?.fullName || 'User'}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{user?.role || 'Role'}</p>
              </div>
            </div>
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
        <div id="main-content" className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
