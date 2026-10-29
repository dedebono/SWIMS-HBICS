import { apiClient } from './api-client';

/**
 * AI summary generation takes 80-100+s — longer than the ~100s Cloudflare
 * proxy timeout — so the POST only STARTS a background job on the backend and
 * we poll the status endpoint (every request is short, so nothing dies
 * mid-flight). Resolves when the job reports done/error or the budget runs out.
 */
export async function generateInsightAwait<T>(
  caseId: string,
  opts: { pollMs?: number; maxMs?: number } = {},
): Promise<{ ok: true; insight: T } | { ok: false; error: string }> {
  const pollMs = opts.pollMs ?? 5000;
  const maxMs = opts.maxMs ?? 5 * 60_000;

  const start = await apiClient<{ status: string; insight?: T }>(
    `/cases/${caseId}/insights/generate`,
    { method: 'POST' },
  );
  if (!start.success) {
    return { ok: false, error: start.error ?? 'Gagal memulai generate AI.' };
  }
  if (start.data?.status === 'done' && start.data.insight) {
    return { ok: true, insight: start.data.insight };
  }

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const st = await apiClient<{ status: string; insight?: T; error?: string }>(
      `/cases/${caseId}/insights/generate/status`,
    );
    if (!st.success || !st.data) {
      return { ok: false, error: st.error ?? 'Gagal memeriksa status generate AI.' };
    }
    if (st.data.status === 'done' && st.data.insight) {
      return { ok: true, insight: st.data.insight };
    }
    if (st.data.status === 'error') {
      return { ok: false, error: st.data.error ?? 'Generate AI gagal.' };
    }
    if (st.data.status === 'idle') {
      return { ok: false, error: 'Proses generate hilang (server restart). Coba lagi.' };
    }
  }
  return { ok: false, error: 'Waktu tunggu generate AI habis. Coba lagi.' };
}
