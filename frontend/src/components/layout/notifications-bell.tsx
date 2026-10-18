'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  FileText,
  HeartHandshake,
  Inbox,
  MessageCircle,
  RotateCcw,
  Share2,
  TrendingUp,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';

const TYPE_ICONS: Record<string, LucideIcon> = {
  CASE_NEW: FileText,
  CASE_SHARED: Share2,
  CASE_PROGRESS: TrendingUp,
  CHAT_NEW: MessageCircle,
  COUNSELING_REQUEST: HeartHandshake,
  SCHEDULE_NEW: CalendarPlus,
  SCHEDULE_UPDATE: CalendarClock,
  APPOINTMENT_REQUEST: CalendarCheck,
  SYSTEM_ERROR: AlertTriangle,
};

/** Warna aksen per tipe — error merah, sisanya netral-primary. */
function iconClasses(type: string): string {
  return type === 'SYSTEM_ERROR'
    ? 'bg-[#fef3f2] text-[#b42318]'
    : 'bg-primary/10 text-primary';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hr lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'dismissed'>('active');
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    active,
    dismissed,
    unread,
    loading,
    refresh,
    refreshDismissed,
    markRead,
    markAllRead,
    dismiss,
    undismiss,
    remove,
    clearDismissed,
  } = useNotifications();

  // Klik di luar / Escape menutup panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openPanel = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setTab('active');
      void refresh();
    }
  };

  const switchTab = (next: 'active' | 'dismissed') => {
    setTab(next);
    if (next === 'dismissed') void refreshDismissed();
  };

  const openNotification = (item: NotificationItem) => {
    if (!item.is_read) void markRead(item.notification_id);
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  const items = tab === 'active' ? active : dismissed;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openPanel}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-secondary-text transition-colors hover:bg-accent hover:text-heading"
        aria-label={`Notifikasi${unread > 0 ? ` (${unread} belum dibaca)` : ''}`}
      >
        <Bell className="size-[1.125rem]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-card">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="dialog"
          aria-label="Panel notifikasi"
        >
          {/* Header + tab */}
          <div className="border-b border-border px-4 pt-3">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-bold text-heading">Notifikasi</p>
              {tab === 'active' && unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <CheckCheck className="size-3.5" />
                  Tandai semua dibaca
                </button>
              )}
              {tab === 'dismissed' && dismissed.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearDismissed()}
                  className="flex items-center gap-1 text-xs font-semibold text-[#b42318] hover:underline"
                >
                  <Trash2 className="size-3.5" />
                  Hapus semua
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['active', 'Aktif'],
                  ['dismissed', 'Ditutup'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTab(key)}
                  className={[
                    'rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    tab === key
                      ? 'border-b-2 border-primary text-primary'
                      : 'border-b-2 border-transparent text-muted-foreground hover:text-heading',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Daftar */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Inbox className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {tab === 'active' ? 'Tidak ada notifikasi.' : 'Tidak ada notifikasi yang ditutup.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? Bell;
                  return (
                    <li key={item.notification_id} className="group relative">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => tab === 'active' && openNotification(item)}
                        onKeyDown={(e) => {
                          if (tab === 'active' && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            openNotification(item);
                          }
                        }}
                        className={[
                          'flex w-full cursor-pointer items-start gap-3 px-4 py-3 pr-16 text-left transition-colors hover:bg-accent/60',
                          tab === 'active' && !item.is_read ? 'bg-primary/5' : '',
                        ].join(' ')}
                      >
                        <span
                          className={['mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', iconClasses(item.type)].join(' ')}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[0.8125rem] font-semibold text-heading">
                              {item.title}
                            </span>
                            {tab === 'active' && !item.is_read && (
                              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            )}
                          </span>
                          {item.body && (
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
                              {item.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[0.6875rem] text-muted-foreground/70">
                            {timeAgo(item.created_at)}
                          </span>
                        </span>
                      </div>

                      {/* Aksi per baris — close (X) di tab aktif, restore/delete di tab ditutup */}
                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {tab === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void dismiss(item.notification_id)}
                            disabled={loading}
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-heading"
                            aria-label="Tutup notifikasi"
                            title="Tutup"
                          >
                            <X className="size-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void undismiss(item.notification_id)}
                              disabled={loading}
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-heading"
                              aria-label="Buka lagi notifikasi"
                              title="Buka lagi"
                            >
                              <RotateCcw className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(item.notification_id)}
                              disabled={loading}
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-[#fef3f2] hover:text-[#b42318]"
                              aria-label="Hapus notifikasi"
                              title="Hapus"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
