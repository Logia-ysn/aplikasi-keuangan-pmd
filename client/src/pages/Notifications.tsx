import { useState } from 'react';
import {
  Bell, FileWarning, CreditCard, Package, Info,
  CheckCheck, Loader2, Filter
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: any;
  createdAt: string;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatTimestamp(dateStr);
}

function notificationIcon(type: string) {
  switch (type) {
    case 'invoice_overdue':
      return <FileWarning size={16} className="text-red-500" />;
    case 'payment_received':
      return <CreditCard size={16} className="text-green-500" />;
    case 'low_stock':
      return <Package size={16} className="text-amber-500" />;
    default:
      return <Info size={16} className="text-blue-500" />;
  }
}

function typeBadge(type: string) {
  const labels: Record<string, { label: string; color: string }> = {
    invoice_overdue: { label: 'Jatuh Tempo', color: 'bg-red-100 text-red-700' },
    payment_received: { label: 'Pembayaran', color: 'bg-green-100 text-green-700' },
    low_stock: { label: 'Stok Rendah', color: 'bg-amber-100 text-amber-700' },
    system: { label: 'Sistem', color: 'bg-gray-100 text-gray-700' },
  };
  const info = labels[type] || labels.system;
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', info!.color)}>
      {info!.label}
    </span>
  );
}

export const Notifications = () => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-all'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return res.data;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const notifications: Notification[] = data?.data || [];
  const unreadCount = data?.unreadCount || 0;
  const filtered = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Notifikasi
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {unreadCount > 0 ? `${unreadCount} notifikasi belum dibaca` : 'Semua notifikasi sudah dibaca'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck size={14} />
            Tandai Semua Dibaca
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} style={{ color: 'var(--color-text-muted)' }} />
        <div className="flex border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
              style={filter !== f ? { backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' } : undefined}
            >
              {f === 'all' ? 'Semua' : `Belum Dibaca (${unreadCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      <div
        className="border rounded-xl divide-y overflow-hidden"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
          divideColor: 'var(--color-border-light)',
        }}
      >
        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat notifikasi...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Bell size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {filter === 'unread' ? 'Tidak ada notifikasi belum dibaca.' : 'Belum ada notifikasi.'}
            </p>
          </div>
        ) : (
          filtered.map((notif) => (
            <div
              key={notif.id}
              onClick={() => {
                if (!notif.isRead) markReadMutation.mutate(notif.id);
              }}
              className={cn(
                'flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors',
                'hover:bg-gray-50 dark:hover:bg-gray-800/30',
                !notif.isRead && 'bg-blue-50/40 dark:bg-blue-900/10'
              )}
            >
              <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                {notificationIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p
                    className={cn('text-sm', !notif.isRead ? 'font-semibold' : 'font-medium')}
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {notif.title}
                  </p>
                  {typeBadge(notif.type)}
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {notif.message}
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {relativeTime(notif.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
