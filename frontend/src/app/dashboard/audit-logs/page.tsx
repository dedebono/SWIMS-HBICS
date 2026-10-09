'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DataTable,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { IconBox, type IconTone } from '@/components/ui/icon-box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { format, parseISO } from 'date-fns';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutGrid,
  Paperclip,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLogRow {
  log_id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditLogMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface Filters {
  action: string;
  entity_type: string;
  from: string;
  to: string;
}

// ─── Konfigurasi aksi (label Bahasa Indonesia + tone semantik) ───────────────

const ACTION_META: Record<string, { label: string; tone: StatusTone }> = {
  // Autentikasi
  LOGIN: { label: 'Masuk', tone: 'info' },
  LOGOUT: { label: 'Keluar', tone: 'neutral' },
  USER_CREATED: { label: 'Pengguna Baru', tone: 'success' },
  USER_UPDATED: { label: 'Pengguna Diperbarui', tone: 'warning' },
  // Kasus
  CASE_CREATED: { label: 'Kasus Dibuat', tone: 'purple' },
  CASE_UPDATED: { label: 'Kasus Diperbarui', tone: 'warning' },
  CASE_CLOSED: { label: 'Kasus Ditutup', tone: 'success' },
  // Insiden
  INCIDENT_CREATED: { label: 'Insiden Dibuat', tone: 'danger' },
  INCIDENT_UPDATED: { label: 'Insiden Diperbarui', tone: 'warning' },
  // Intervensi
  INTERVENTION_CREATED: { label: 'Intervensi Dibuat', tone: 'info' },
  INTERVENTION_UPDATED: { label: 'Intervensi Diperbarui', tone: 'info' },
  // Laporan
  REPORT_GENERATED: { label: 'Laporan Dibuat', tone: 'purple' },
  // RTBF
  RTBF_EXECUTED: { label: 'RTBF Dijalankan', tone: 'danger' },
  RTBF_PDF_GENERATED: { label: 'Sertifikat RTBF', tone: 'danger' },
  // Persetujuan
  CONSENT_UPDATED: { label: 'Persetujuan Diperbarui', tone: 'success' },
  // Media
  MEDIA_UPLOADED: { label: 'Media Diunggah', tone: 'purple' },
  MEDIA_DELETED: { label: 'Media Dihapus', tone: 'danger' },
  // Observasi positif
  POSITIVE_OBSERVATION_CREATED: { label: 'Observasi Positif', tone: 'success' },
  // AI
  AI_INSIGHTS_GENERATED: { label: 'Insight AI', tone: 'purple' },
  // Deteksi pola
  PATTERN_DETECTED: { label: 'Pola Terdeteksi', tone: 'warning' },
};

/** Kategori yang dikenal → tone. Entri tak dikenal tetap tampil netral. */
const CATEGORY_TONE: Record<string, StatusTone> = {
  LOGIN: 'info',
  LOGOUT: 'neutral',
  USER: 'success',
  CASE: 'purple',
  INCIDENT: 'danger',
  INTERVENTION: 'info',
  REPORT: 'purple',
  RTBF: 'danger',
  CONSENT: 'success',
  MEDIA: 'purple',
  POSITIVE: 'success',
  AI: 'purple',
  PATTERN: 'warning',
};

function getActionMeta(action: string): { label: string; tone: StatusTone } {
  const known = ACTION_META[action];
  if (known) return known;

  const category = action.split('_')[0];
  const tone = CATEGORY_TONE[category] ?? 'neutral';
  const pretty = category.charAt(0) + category.slice(1).toLowerCase();
  return { label: `${pretty}: ${action.toLowerCase().replace(/_/g, ' ')}`, tone };
}

// ─── Metadata entitas ────────────────────────────────────────────────────────

const ENTITY_META: Record<string, { label: string; icon: ReactNode; tone: IconTone }> = {
  cases: { label: 'Kasus', icon: <FileText className="size-4" />, tone: 'purple' },
  incidents: { label: 'Insiden', icon: <ShieldCheck className="size-4" />, tone: 'red' },
  interventions: { label: 'Intervensi', icon: <Wrench className="size-4" />, tone: 'teal' },
  students: { label: 'Siswa', icon: <User className="size-4" />, tone: 'blue' },
  users: { label: 'Pengguna', icon: <Users className="size-4" />, tone: 'slate' },
  reports: { label: 'Laporan', icon: <LayoutGrid className="size-4" />, tone: 'blue' },
  consents: { label: 'Persetujuan', icon: <ClipboardList className="size-4" />, tone: 'green' },
  media_assets: { label: 'Media', icon: <Paperclip className="size-4" />, tone: 'yellow' },
  positive_observations: { label: 'Observasi Positif', icon: <Star className="size-4" />, tone: 'green' },
};

function getEntityMeta(entityType: string) {
  return (
    ENTITY_META[entityType] ?? {
      label: entityType || 'Entitas lain',
      icon: <ScrollText className="size-4" />,
      tone: 'slate' as IconTone,
    }
  );
}

/** Base UI menampilkan `value` apa adanya; `items` memetakan label. */
const ENTITY_FILTER_ITEMS: Record<string, string> = {
  all: 'Semua Entitas',
  cases: 'Kasus',
  incidents: 'Insiden',
  interventions: 'Intervensi',
  students: 'Siswa',
  users: 'Pengguna',
  reports: 'Laporan',
  consents: 'Persetujuan',
  media_assets: 'Media',
  positive_observations: 'Observasi Positif',
};

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMM yyyy, HH:mm:ss');
  } catch {
    return iso;
  }
}

function formatDay(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMMM yyyy');
  } catch {
    return iso;
  }
}

// ─── Panel statistik ─────────────────────────────────────────────────────────

function StatPanel({
  label,
  value,
  hint,
  icon,
  iconTone,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
  iconTone: IconTone;
  progress?: number;
}) {
  return (
    <StatCard
      label={label}
      value={value}
      hint={hint}
      icon={icon}
      iconTone={iconTone}
      progress={progress}
    />
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (k: keyof Filters, v: string) => void;
  onClear: () => void;
}) {
  const hasFilters = Boolean(filters.action || filters.entity_type || filters.from || filters.to);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2">
        <Label htmlFor="filter-action">Cari Aksi</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filter-action"
            aria-label="Cari jenis aksi pada log audit"
            placeholder="cth. CASE_CREATED"
            value={filters.action}
            onChange={(e) => onChange('action', e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-entity">Jenis Entitas</Label>
        <Select
          value={filters.entity_type || 'all'}
          onValueChange={(v) => onChange('entity_type', v && v !== 'all' ? v : '')}
          items={ENTITY_FILTER_ITEMS}
        >
          <SelectTrigger id="filter-entity" className="w-full">
            <SelectValue placeholder="Semua entitas" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ENTITY_FILTER_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-from">Tanggal Mulai</Label>
        <Input
          id="filter-from"
          type="date"
          value={filters.from}
          onChange={(e) => onChange('from', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-to">Tanggal Akhir</Label>
        <Input
          id="filter-to"
          type="date"
          value={filters.to}
          onChange={(e) => onChange('to', e.target.value)}
        />
      </div>

      {hasFilters ? (
        <div className="sm:col-span-2 xl:col-span-4">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-3.5" />
            Bersihkan Filter
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Detail satu log ─────────────────────────────────────────────────────────

function LogDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[132px_1fr]">
      <span className="text-xs font-semibold text-heading">{label}</span>
      <span
        className={
          mono
            ? 'font-mono text-xs break-all text-muted-foreground'
            : 'text-xs break-all text-muted-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}

function LogRow({ log }: { log: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const action = getActionMeta(log.action);
  const entity = getEntityMeta(log.entity_type);
  const shortId = log.entity_id ? log.entity_id.slice(0, 8) : null;

  return (
    <>
      <TableRow interactive>
        <TableCell>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-2.5 text-left"
          >
            <IconBox tone={entity.tone} size="sm">
              {entity.icon}
            </IconBox>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-heading">{entity.label}</span>
              {shortId ? (
                <span className="block font-mono text-xs text-muted-foreground">#{shortId}</span>
              ) : null}
            </span>
          </button>
        </TableCell>
        <TableCell>
          <StatusBadge tone={action.tone} label={action.label} />
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{log.entity_type || '—'}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {log.actor_id ? `#${log.actor_id.slice(0, 8)}` : '—'}
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{log.ip_address ?? '—'}</TableCell>
        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(log.created_at)}</TableCell>
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={expanded ? `Sembunyikan detail log ${action.label}` : `Lihat detail log ${action.label}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/40">
            <div className="grid gap-3 py-3">
              <LogDetail label="ID Log" value={log.log_id} mono />
              <LogDetail label="ID;Aktor" value={log.actor_id || '—'} mono />
              <LogDetail label="ID Instansi" value={log.tenant_id || '—'} mono />
              <LogDetail label="Tanggal" value={formatDay(log.created_at)} />
              {log.ip_address ? <LogDetail label="Alamat IP" value={log.ip_address} mono /> : null}
              {log.user_agent ? <LogDetail label="Perangkat" value={log.user_agent} /> : null}
              {log.before_state ? (
                <div className="grid gap-1 sm:grid-cols-[132px_1fr]">
                  <span className="text-xs font-semibold text-heading">Sebelum</span>
                  <pre className="scroll-slim max-h-56 overflow-auto rounded-lg border border-border bg-card p-2.5 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(log.before_state, null, 2)}
                  </pre>
                </div>
              ) : null}
              {log.after_state ? (
                <div className="grid gap-1 sm:grid-cols-[132px_1fr]">
                  <span className="text-xs font-semibold text-heading">Sesudah</span>
                  <pre className="scroll-slim max-h-56 overflow-auto rounded-lg border border-border bg-card p-2.5 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(log.after_state, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const LIMIT = 30;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [meta, setMeta] = useState<AuditLogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({ action: '', entity_type: '', from: '', to: '' });

  const fetchLogs = useCallback(async (pg: number, f: Filters) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
    if (f.action) params.set('action', f.action);
    if (f.entity_type) params.set('entity_type', f.entity_type);
    if (f.from) params.set('from', new Date(f.from).toISOString());
    if (f.to) params.set('to', new Date(`${f.to}T23:59:59`).toISOString());

    const res = await apiClient<AuditLogRow[]>(`/audit-logs?${params.toString()}`);
    if (res.success && res.data) {
      setLogs(res.data);
      setMeta(res.meta as AuditLogMeta);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(page, filters);
  }, [page, filters, fetchLogs]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ action: '', entity_type: '', from: '', to: '' });
    setPage(1);
  }, []);

  const totalPages = meta && meta.total > 0 ? Math.ceil(meta.total / LIMIT) : 1;
  const hasFilters = Boolean(filters.action || filters.entity_type || filters.from || filters.to);

  const distinctActors = useMemo(() => new Set(logs.map((l) => l.actor_id)).size, [logs]);
  const sensitiveCount = useMemo(
    () => logs.filter((l) => ACTION_META[l.action]?.tone === 'danger').length,
    [logs],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Audit"
        description="Catatan semua tindakan sensitif di lingkungan sekolah. Data tidak dapat diubah atau dihapus."
        actions={
          <Button variant="outline" onClick={() => fetchLogs(page, filters)} disabled={loading}>
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
            Muat Ulang
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatPanel
          label="Total Catatan"
          value={meta ? meta.total.toLocaleString('id-ID') : '…'}
          hint="Seluruh aktivitas yang tercatat di sistem"
          icon={<ScrollText className="size-5" />}
          iconTone="blue"
        />
        <StatPanel
          label="Aktor pada Halaman Ini"
          value={logs.length > 0 ? distinctActors : '—'}
          hint="Pengguna unik yang melakukan aktivitas"
          icon={<Users className="size-5" />}
          iconTone="purple"
        />
        <StatPanel
          label="Aksi Sensitif"
          value={logs.length > 0 ? sensitiveCount : '—'}
          hint="Perubahan berisiko tinggi pada halaman ini"
          icon={<ShieldCheck className="size-5" />}
          iconTone="red"
        />
        <StatPanel
          label="Halaman"
          value={`${page} / ${totalPages}`}
          hint={meta?.hasMore ? 'Masih ada halaman berikutnya' : 'Ini halaman terakhir'}
          icon={<FolderTree className="size-5" />}
          iconTone="slate"
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="slate" size="sm">
              <SlidersHorizontal className="size-4" />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Filter Log</CardTitle>
              <CardDescription>
                Saring berdasarkan jenis aksi, entitas, atau rentang tanggal.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IconBox tone="blue" size="sm">
                <Activity className="size-4" />
              </IconBox>
              <div className="space-y-1">
                <CardTitle>Aktivitas Tercatat</CardTitle>
                <CardDescription>
                  {meta
                    ? `Menampilkan ${logs.length} dari ${meta.total.toLocaleString('id-ID')} catatan.`
                    : 'Memuat catatan…'}
                </CardDescription>
              </div>
            </div>
            {hasFilters ? (
              <Badge variant="soft">Filter aktif</Badge>
            ) : (
              <Badge variant="muted">Semua catatan</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <span className="size-7 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">Memuat log audit…</p>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title={hasFilters ? 'Log tidak ditemukan' : 'Belum ada log audit'}
              description={
                hasFilters
                  ? 'Tidak ada catatan yang cocok dengan filter Anda. Coba ubah atau bersihkan filter.'
                  : 'Belum ada aktivitas yang tercatat. Log akan muncul otomatis saat ada tindakan di sistem.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    <X className="size-4" />
                    Bersihkan Filter
                  </Button>
                ) : null
              }
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Entitas</TableHeaderCell>
                  <TableHeaderCell scope="col">Aksi</TableHeaderCell>
                  <TableHeaderCell scope="col">Jenis</TableHeaderCell>
                  <TableHeaderCell scope="col">Aktor</TableHeaderCell>
                  <TableHeaderCell scope="col">Alamat IP</TableHeaderCell>
                  <TableHeaderCell scope="col">Waktu</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">
                    Detail
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => (
                  <LogRow key={log.log_id} log={log} />
                ))}
                {logs.length === 0 ? <TableEmptyRow colSpan={7}>Belum ada log audit.</TableEmptyRow> : null}
              </TableBody>
            </DataTable>
          )}
        </CardContent>

        {totalPages > 1 && !loading && logs.length > 0 ? (
          <CardFooter className="justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4" />
              Sebelumnya
            </Button>
            <span className="text-xs text-muted-foreground">
              Halaman {page} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!meta?.hasMore}
            >
              Berikutnya
              <ChevronRight className="size-4" />
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}