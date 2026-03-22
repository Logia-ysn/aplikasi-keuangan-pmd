import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Users, Loader2, Shield, ShieldCheck, Eye, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatDate } from '../lib/formatters';
import UserFormModal from '../components/UserFormModal';

interface UserData {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: async () => {
      const params: any = { limit: 200 };
      if (searchTerm.trim()) params.search = searchTerm;
      const response = await api.get('/users', { params });
      return response.data;
    },
  });

  const users: UserData[] = data?.data ?? [];

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuUserId(null);
      }
    };
    if (menuUserId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuUserId]);

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/toggle`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      const user = res.data;
      toast.success(`User ${user.fullName} ${user.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengubah status user.');
    },
  });

  const handleEdit = (user: UserData) => {
    setMenuUserId(null);
    setEditUser(user);
    setIsModalOpen(true);
  };

  const handleToggle = (user: UserData) => {
    setMenuUserId(null);
    toggleMutation.mutate(user.id);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditUser(null);
  };

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminUsers = users.filter(u => u.role === 'Admin').length;

  const roleBadge = (role: string) => {
    switch (role) {
      case 'Admin':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><ShieldCheck size={10} /> Admin</span>;
      case 'Accountant':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"><Shield size={10} /> Accountant</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"><Eye size={10} /> Viewer</span>;
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Manajemen User</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Kelola akun pengguna aplikasi.</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditUser(null); setIsModalOpen(true); }}>
          <Plus size={15} /> Tambah User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total User', value: totalUsers, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'User Aktif', value: activeUsers, color: 'text-green-600 dark:text-green-400' },
          { label: 'Admin', value: adminUsers, color: 'text-purple-600 dark:text-purple-400' },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Cari nama, username, atau email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Nama Lengkap</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Username</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Login Terakhir</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat data user...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Users className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Belum ada data user.</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30',
                      !user.isActive && 'opacity-50'
                    )}
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-semibold text-xs flex-shrink-0">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{user.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.username}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{user.email}</td>
                    <td className="px-4 py-3">{roleBadge(user.role)}</td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">Aktif</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" ref={menuUserId === user.id ? menuRef : undefined}>
                        <button
                          onClick={() => setMenuUserId(menuUserId === user.id ? null : user.id)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuUserId === user.id && (
                          <div
                            className="absolute right-0 top-8 z-50 w-44 border rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1"
                            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
                          >
                            <button
                              onClick={() => handleEdit(user)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              onClick={() => handleToggle(user)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                              style={{ color: user.isActive ? '#dc2626' : '#16a34a' }}
                            >
                              {user.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                              {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      <UserFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editUser={editUser}
      />
    </div>
  );
};
