'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface NotificationItem {
  notification_id: string;
  type: string;
  title: string;
  body: string | null;
  /** Path frontend tujuan saat notifikasi diklik. */
  link: string | null;
  is_read: boolean;
  dismissed_at: string | null;
  created_at: string;
}

interface NotificationEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * Bel notifikasi: polling inbox aktif + jumlah belum dibaca tiap `pollMs`.
 * Semua aksi (baca, tutup, hapus) menuliskan perubahan ke API lalu me-refresh
 * state dari server — tidak ada optimistic update yang bisa jadi bohong.
 */
export function useNotifications(pollMs = 30000) {
  const [active, setActive] = useState<NotificationItem[]>([]);
  const [dismissed, setDismissed] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        apiClient<NotificationItem[]>('/notifications?limit=50'),
        apiClient<{ count: number }>('/notifications/unread-count'),
      ]);
      if (listRes.success && listRes.data) setActive(listRes.data);
      if (countRes.success && countRes.data) setUnread(countRes.data.count);
    } catch {
      /* polling — kegagalan sesekali dibiarkan diam */
    }
  }, []);

  const refreshDismissed = useCallback(async () => {
    try {
      const res = await apiClient<NotificationItem[]>('/notifications/dismissed?limit=50');
      if (res.success && res.data) setDismissed(res.data);
    } catch {
      /* idem */
    }
  }, []);

  const withLoading = useCallback(
    async (fn: () => Promise<unknown>, after?: () => Promise<void>) => {
      setLoading(true);
      try {
        await fn();
        await refresh();
        if (after) await after();
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const markRead = useCallback(
    (id: string) => withLoading(() => apiClient(`/notifications/${id}/read`, { method: 'PATCH', body: { is_read: true } })),
    [withLoading],
  );

  const markAllRead = useCallback(
    () => withLoading(() => apiClient('/notifications/read-all', { method: 'POST' })),
    [withLoading],
  );

  const dismiss = useCallback(
    (id: string) =>
      withLoading(() => apiClient(`/notifications/${id}/dismiss`, { method: 'PATCH', body: { dismissed: true } }), refreshDismissed),
    [withLoading, refreshDismissed],
  );

  const undismiss = useCallback(
    (id: string) =>
      withLoading(() => apiClient(`/notifications/${id}/undismiss`, { method: 'PATCH', body: { dismissed: false } }), refreshDismissed),
    [withLoading, refreshDismissed],
  );

  const remove = useCallback(
    (id: string) =>
      withLoading(() => apiClient(`/notifications/${id}`, { method: 'DELETE' }), refreshDismissed),
    [withLoading, refreshDismissed],
  );

  const clearDismissed = useCallback(
    () => withLoading(() => apiClient('/notifications/dismissed', { method: 'DELETE' }), refreshDismissed),
    [withLoading, refreshDismissed],
  );

  // Poll hanya saat tab terlihat — tab background tidak perlu jaringan.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refresh();
      }
    }, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return {
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
  };
}
