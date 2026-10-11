'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBox, type IconTone } from '@/components/ui/icon-box';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { ProgressPill, StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { AiSummaryPanel, type AiInsight } from '@/components/cases/ai-summary-panel';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CaseRow {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  opened_date: string;
  student_name?: string;
}

interface CaseSummaryResult {
  case_id: string;
  case_type: string;
  risk_level: string;
  student_name?: string;
  summary: string | null;
  insight?: AiInsight | null;
  status: 'pending' | 'loading' | 'done' | 'error';
  error?: string;
}

// ─── Labels Bahasa Indonesia ─────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

const CASE_TYPE_META: Record<string, { label: string; icon: ReactNode; tone: IconTone }> = {
  BEHAVIORAL: { label: 'Perilaku', icon: <AlertTriangle className="size-4" />, tone: 'red' },
  EMOTIONAL: { label: 'Emosional', icon: <Heart className="size-4" />, tone: 'blue' },
  MEDICAL: { label: 'Medis', icon: <Stethoscope className="size-4" />, tone: 'teal' },
  ACADEMIC: { label: 'Akademik', icon: <GraduationCap className="size-4" />, tone: 'purple' },
  POSITIVE: { label: 'Positif', icon: <Award className="size-4" />, tone: 'green' },
};

function riskLabel(risk?: string): string {
  if (!risk) return 'Tidak diketahui';
  return RISK_LABELS[risk.toUpperCase()] ?? risk;
}

function spinnerClass(): string {
  return 'size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary';
}

// ─── Individual Case Summary Card ─────────────────────────────────────────────

function CaseSummaryCard({ item }: { item: CaseSummaryResult }) {
  const [expanded, setExpanded] = useState(true);
  const meta = CASE_TYPE_META[item.case_type?.toUpperCase() ?? ''] ?? {
    label: 'Lainnya',
    icon: <FileText className="size-4" />,
    tone: 'slate' as IconTone,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-softer"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <IconBox tone={meta.tone} size="sm">
            {meta.icon}
          </IconBox>
          <span className="truncate text-sm font-semibold text-heading">
            {item.student_name ? `Kasus ${item.student_name} ` : 'Kasus '}
            #{item.case_id.slice(0, 8)}
          </span>
          <StatusBadge tone={severityTone(item.risk_level)} label={`Risiko ${riskLabel(item.risk_level)}`} />
          <span className="text-xs text-muted-foreground">{meta.label}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.status === 'loading' ? (
            <span className={spinnerClass()} aria-label="Sedang dianalisis" />
          ) : null}
          {item.status === 'done' ? (
            <StatusBadge tone="success" dot={false} label="Selesai" />
          ) : null}
          {item.status === 'error' ? (
            <AlertTriangle className="size-4 text-danger" aria-label="Gagal dianalisis" />
          ) : null}
          <Link
            href={`/dashboard/cases/${item.case_id}`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Buka detail kasus #${item.case_id.slice(0, 8)}`}
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <ExternalLink className="size-3.5" />
          </Link>
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border px-4 py-3.5">
          {item.status === 'pending' ? (
            <p className="text-xs text-muted-foreground">Menunggu analisis…</p>
          ) : null}
          {item.status === 'loading' ? (
            <div className="flex items-center gap-2">
              <span className={spinnerClass()} />
              <p className="text-xs text-primary">Sedang membuat ringkasan…</p>
            </div>
          ) : null}
          {item.status === 'error' ? (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <AlertTriangle className="size-3.5" />
              {item.error ?? 'Gagal membuat ringkasan.'}
            </p>
          ) : null}
          {item.status === 'done' && item.summary ? (
            <AiSummaryPanel
              summary={item.summary}
              insight={item.insight}
              isGenerating={false}
            />
          ) : null}
          {item.status === 'done' && !item.summary ? (
            <p className="text-xs text-muted-foreground">Ringkasan tidak tersedia untuk kasus ini.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Placeholder panels ──────────────────────────────────────────────────────

function PlaceholderPanel({
  tone,
  icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  tone: IconTone;
  icon: ReactNode;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <IconBox tone={tone} size="sm">
            {icon}
          </IconBox>
          <div className="min-w-0 space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <EmptyState icon={<BarChart3 className="size-6" />} title={emptyTitle} description={emptyDescription} />
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchoolHeadDashboard() {
  const { user } = useAuth();

  const [openCount, setOpenCount] = useState<number>();
  const [criticalCount, setCriticalCount] = useState<number>();
  const [pendingApprovals, setPendingApprovals] = useState<number>();
  const [loadingStats, setLoadingStats] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [summaryResults, setSummaryResults] = useState<CaseSummaryResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ─── Statistik dasar ────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    const [openRes, critRes, refRes] = await Promise.all([
      apiClient<CaseRow[]>('/cases?status=OPEN&limit=100'),
      apiClient<CaseRow[]>('/cases?status=OPEN&risk_level=CRITICAL&limit=100'),
      apiClient<unknown[]>('/referrals'),
    ]);
    if (openRes.success) setOpenCount(openRes.meta?.total ?? (openRes.data?.length ?? 0));
    if (critRes.success) setCriticalCount(critRes.meta?.total ?? (critRes.data?.length ?? 0));
    if (refRes.success) setPendingApprovals(refRes.data?.length ?? 0);
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ─── Generate AI summaries for all open cases ────────────────────────────────
  const handleGenerateAllSummaries = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setSummaryResults([]);
    setProgress({ done: 0, total: 0 });

    const casesRes = await apiClient<CaseRow[]>('/cases?status=OPEN&limit=100');
    if (!casesRes.success || !casesRes.data || casesRes.data.length === 0) {
      toast.info('Tidak ada kasus terbuka yang perlu diringkas.');
      setIsRunning(false);
      return;
    }

    const openCases = casesRes.data;
    const totalCases = openCases.length;

    const initialResults: CaseSummaryResult[] = openCases.map((c) => ({
      case_id: c.case_id,
      case_type: c.case_type,
      risk_level: c.risk_level,
      student_name: c.student_name,
      summary: null,
      status: 'pending',
    }));

    setSummaryResults(initialResults);
    setProgress({ done: 0, total: totalCases });

    let doneCount = 0;
    for (const c of openCases) {
      setSummaryResults((prev) =>
        prev.map((r) => (r.case_id === c.case_id ? { ...r, status: 'loading' } : r)),
      );

      try {
        const res = await apiClient<AiInsight>(`/cases/${c.case_id}/insights/generate`, {
          method: 'POST',
        });

        setSummaryResults((prev) =>
          prev.map((r) =>
            r.case_id === c.case_id
              ? {
                  ...r,
                  status: res.success ? 'done' : 'error',
                  summary: res.success && res.data ? res.data.summary : null,
                  insight: res.success && res.data ? res.data : null,
                  error: res.success ? undefined : (res.error ?? 'Terjadi kesalahan yang tidak diketahui'),
                }
              : r,
          ),
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Gangguan jaringan';
        setSummaryResults((prev) =>
          prev.map((r) => (r.case_id === c.case_id ? { ...r, status: 'error', error: message } : r)),
        );
      }

      doneCount += 1;
      setProgress({ done: doneCount, total: totalCases });
    }

    toast.success(`Ringkasan AI dibuat untuk ${totalCases} kasus terbuka.`);
    setIsRunning(false);
  }, [isRunning]);

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const doneSummaries = summaryResults.filter((r) => r.status === 'done').length;

  const stats: {
    label: string;
    value: number | string;
    hint: string;
    icon: ReactNode;
    iconTone: IconTone;
    progress?: number;
  }[] = [
    {
      label: 'Kasus Terbuka',
      value: loadingStats ? '…' : (openCount ?? 0),
      hint: 'Total kasus dengan status masih terbuka',
      icon: <Activity className="size-5" />,
      iconTone: 'blue',
    },
    {
      label: 'Insiden Kritis',
      value: loadingStats ? '…' : (criticalCount ?? 0),
      hint: 'Kasus terbuka dengan risiko kritis',
      icon: <ShieldAlert className="size-5" />,
      iconTone: 'red',
    },
    {
      label: 'Menunggu Persetujuan',
      value: loadingStats ? '…' : (pendingApprovals ?? 0),
      hint: 'Rujukan yang menunggu persetujuan kepala sekolah',
      icon: <FileText className="size-5" />,
      iconTone: 'yellow',
    },
    {
      label: 'Diselesaikan Minggu Ini',
      value: '—',
      hint: 'Rincian mingguan belum tersedia',
      icon: <CheckCircle2 className="size-5" />,
      iconTone: 'green',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dasbor Kepala Sekolah"
        description={
          user?.full_name
            ? `Selamat datang, ${user.full_name}. Ringkasan metrik sekolah, eskalasi kritis, dan insight AI untuk seluruh kasus terbuka.`
            : 'Ringkasan metrik sekolah, eskalasi kritis, dan insight AI untuk seluruh kasus terbuka.'
        }
        actions={
          <Button variant="outline" onClick={fetchStats} disabled={loadingStats}>
            <RefreshCw className={loadingStats ? 'size-4 animate-spin' : 'size-4'} />
            Muat Ulang
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            hint={s.hint}
            icon={s.icon}
            iconTone={s.iconTone}
            progress={s.progress}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PlaceholderPanel
          tone="red"
          icon={<ShieldAlert className="size-4" />}
          title="Eskalasi Kritis Terakhir"
          description="Kasus yang dieskalasi konselor dan perlu ditinjau kepala sekolah."
          emptyTitle="Tidak ada eskalasi kritis"
          emptyDescription="Belum ada eskalasi kritis yang menunggu peninjauan Anda."
        />
        <PlaceholderPanel
          tone="purple"
          icon={<BarChart3 className="size-4" />}
          title="Analitik Institusi"
          description="Tren tingkat tinggi di seluruh fase sekolah."
          emptyTitle="Analitik belum tersedia"
          emptyDescription="Ringkasan tren kasus dan kesejahteraan siswa akan tampil di sini."
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <IconBox tone="blue">
                <Sparkles className="size-5" />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>Ringkasan AI — Semua Kasus Terbuka</CardTitle>
                <CardDescription>
                  Buat insight singkat untuk setiap kasus terbuka dalam satu klik.
                </CardDescription>
              </div>
            </div>
            <Button onClick={handleGenerateAllSummaries} disabled={isRunning} className="shrink-0">
              <Bot className="size-4" />
              {isRunning ? `Menganalisis… (${progress.done}/${progress.total})` : 'Buat Ringkasan AI'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isRunning && progress.total > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Memproses kasus</span>
                <span className="font-semibold text-heading">{progressPct}%</span>
              </div>
              <ProgressPill value={progressPct} tone="blue" label="Kemajuan pemrosesan kasus" />
            </div>
          ) : null}

          {!isRunning && summaryResults.length === 0 ? (
            <EmptyState
              icon={<Bot />}
              title="Belum ada ringkasan AI"
              description="Klik “Buat Ringkasan AI” untuk menganalisis seluruh kasus terbuka dan menghasilkan insight untuk setiap kasus."
            />
          ) : null}

          {summaryResults.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {doneSummaries} dari {summaryResults.length} kasus telah diringkas
                </p>
                {!isRunning ? (
                  <Button variant="ghost" size="xs" onClick={() => setSummaryResults([])}>
                    Bersihkan hasil
                  </Button>
                ) : null}
              </div>

              {summaryResults.map((item) => (
                <CaseSummaryCard key={item.case_id} item={item} />
              ))}
            </div>
          ) : null}
        </CardContent>

        {summaryResults.length > 0 && !isRunning ? (
          <CardFooter className="text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            Ringkasan dibuat oleh AI. Mohon periksa setiap ringkasan sebelum digunakan mengambil tindakan.
          </CardFooter>
        ) : null}
      </Card>

    </div>
  );
}