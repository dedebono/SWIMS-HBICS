'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { IconBox, type IconTone } from '@/components/ui/icon-box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react';

interface IncidentRow {
  incident_id: string;
  student_id: string;
  case_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  student_grade?: string | null;
  incident_at: string;
  immediate_actions: string | null;
  reported_by: string;
  involved_teacher?: string | null;
  involved_teacher_name?: string | null;
  metadata: {
    involved_students?: string[];
    evidence?: Record<string, boolean>;
    initial_assessment?: Record<string, boolean>;
    manual_involved_teacher?: string;
  };
}

// Name map filled from /my-students
interface StudentName {
  student_id: string;
  full_name: string;
}

/** Endpoint /my-reports bisa membalas array polos atau objek berpage. */
interface IncidentPage {
  data?: IncidentRow[];
  total?: number;
}

const PAGE_SIZE = 50;

/** DB stores LOW/MEDIUM/HIGH/CRITICAL; users see the Classification scale. */
const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Minor',
  MEDIUM: 'Moderat',
  HIGH: 'Mayor',
  CRITICAL: 'Serius',
};

/** Base UI's <SelectValue> renders the raw item `value`, not the <SelectItem>
 *  children — without `items` the filter trigger would show "CRITICAL". */
const SEVERITY_FILTER_ITEMS: Record<string, string> = {
  all: 'Semua Klasifikasi',
  ...SEVERITY_LABELS,
};

function severityLabel(severity?: string): string {
  if (!severity) return 'Tidak diketahui';
  return SEVERITY_LABELS[severity.toUpperCase()] ?? severity;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EVIDENCE_LABELS: Record<string, string> = {
  photo: 'Foto',
  video: 'Video',
  witness: 'Saksi',
  statement: 'Pernyataan',
  medical: 'Dokumen medis',
};

// Roles that see only their own reports
const REPORTER_ROLES = ['TEACHER', 'SUBSTITUTE_TEACHER'];

export default function IncidentsPage() {
  const { user } = useAuth();
  const isReporterOnly = REPORTER_ROLES.includes(user?.role ?? '');

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchIncidents = useCallback(async () => {
    setIsLoading(true);
    try {
      // Teachers see only their own reports; others see all (paginated)
      // Backend incidents routes mounted at /api → paths: /my-reports, /my-students

      const [incRes, stuRes] = await Promise.all([
        apiClient<IncidentRow[] | IncidentPage>(`/my-reports?page=${page}&limit=${PAGE_SIZE}`),
        apiClient<StudentName[]>('/my-students'),
      ]);

      if (incRes.success && incRes.data) {
        const raw = incRes.data;
        const paged = !Array.isArray(raw) ? (raw as IncidentPage) : null;
        const list: IncidentRow[] = Array.isArray(raw) ? raw : (paged?.data ?? []);
        setIncidents(list);
        setTotal(paged?.total ?? list.length);
      }

      if (stuRes.success && stuRes.data) {
        const nameMap: Record<string, string> = {};
        const arr = Array.isArray(stuRes.data) ? stuRes.data : [];
        for (const s of arr) {
          nameMap[s.student_id] = s.full_name;
        }
        setStudentNames(nameMap);
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, isReporterOnly]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const filtered = useMemo(
    () =>
      incidents.filter((inc) => {
        const matchesSeverity = severityFilter === 'all' || inc.severity === severityFilter;
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          (inc.category ?? '').toLowerCase().includes(q) ||
          (inc.description ?? '').toLowerCase().includes(q) ||
          (studentNames[inc.student_id] ?? '').toLowerCase().includes(q) ||
          (inc.involved_teacher_name ?? inc.involved_teacher ?? '').toLowerCase().includes(q);
        return matchesSeverity && matchesSearch;
      }),
    [incidents, severityFilter, search, studentNames],
  );

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inc of filtered) {
      counts[inc.severity] = (counts[inc.severity] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  const activeFilters = Boolean(search.trim()) || severityFilter !== 'all';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statCards: {
    label: string;
    value: ReactNode;
    hint: string;
    icon: ReactNode;
    iconTone: IconTone;
  }[] = [
    {
      label: 'Total Insiden',
      value: isLoading ? '…' : total.toLocaleString('id-ID'),
      hint: isReporterOnly ? 'Laporan yang Anda buat sendiri' : 'Seluruh laporan insiden di sekolah',
      icon: <FileText className="size-5" />,
      iconTone: 'blue',
    },
    {
      label: 'Tingkat Serius',
      value: isLoading ? '…' : (severityCounts.CRITICAL ?? 0),
      hint: 'Klasifikasi tertinggi yang perlu perhatian segera',
      icon: <ShieldAlert className="size-5" />,
      iconTone: 'red',
    },
    {
      label: 'Klasifikasi Mayor',
      value: isLoading ? '…' : (severityCounts.HIGH ?? 0),
      hint: 'Perlu tindak lanjut segera dari tim sekolah',
      icon: <AlertTriangle className="size-5" />,
      iconTone: 'yellow',
    },
    {
      label: 'Menampilkan',
      value: isLoading ? '…' : filtered.length,
      hint: activeFilters ? 'Setelah filter diterapkan' : 'Seluruh insiden pada halaman ini',
      icon: <ClipboardCheck className="size-5" />,
      iconTone: 'green',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isReporterOnly ? 'Laporan Insiden Saya' : 'Daftar Insiden'}
        description={
          isReporterOnly
            ? 'Insiden yang pernah Anda laporkan beserta status tindak lanjutannya.'
            : 'Seluruh laporan insiden yang tercatat di sekolah beserta klasifikasi dan tindak lanjutnya.'
        }
        actions={
          <Link href="/dashboard/incidents/new">
            <Button>
              <Plus className="size-4" />
              Lapor Insiden
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            hint={s.hint}
            icon={s.icon}
            iconTone={s.iconTone}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="slate" size="sm">
              <Search className="size-4" />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Cari Insiden</CardTitle>
              <CardDescription>Saring berdasarkan nama siswa, kategori, atau deskripsi.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="incident-search">Kata Kunci</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="incident-search"
                  aria-label="Cari insiden"
                  placeholder="Nama siswa, kategori, deskripsi…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="incident-severity">Klasifikasi</Label>
              <Select
                value={severityFilter}
                onValueChange={(v) => setSeverityFilter(v ?? 'all')}
                items={SEVERITY_FILTER_ITEMS}
              >
                <SelectTrigger id="incident-severity" className="w-full">
                  <SelectValue placeholder="Semua klasifikasi" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEVERITY_FILTER_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilters ? (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setSeverityFilter('all');
                  }}
                >
                  Bersihkan Filter
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="space-y-1">
            <CardTitle>Daftar Insiden</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Memuat data insiden…'
                : `Menampilkan ${filtered.length} dari ${total.toLocaleString('id-ID')} laporan.`}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <span className="size-7 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">Memuat daftar insiden…</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle />}
              title={activeFilters ? 'Insiden tidak ditemukan' : 'Belum ada insiden'}
              description={
                activeFilters
                  ? 'Tidak ada insiden yang cocok dengan pencarian atau filter Anda. Coba ubah kata kunci atau klasifikasi.'
                  : 'Anda belum memiliki data. Mulai dengan menambahkan laporan insiden.'
              }
              action={
                activeFilters ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setSeverityFilter('all');
                    }}
                  >
                    Bersihkan Filter
                  </Button>
                ) : (
                  <Link href="/dashboard/incidents/new">
                    <Button>
                      <Plus className="size-4" />
                      Lapor Insiden
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <div className="grid gap-3">
              {filtered.map((inc) => {
                const studentName = studentNames[inc.student_id];
                const evidence = inc.metadata?.evidence ?? {};
                const activeEvidence = Object.entries(evidence)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k.toUpperCase());
                const assessment = inc.metadata?.initial_assessment ?? {};
                const flags: string[] = [];
                if (assessment.needs_escalation) flags.push('Perlu eskalasi');
                if (assessment.needs_parent_comm) flags.push('Perlu komunikasi orang tua');

                const involvedTeacher =
                  inc.metadata?.manual_involved_teacher ?? inc.involved_teacher_name ?? inc.involved_teacher;

                return (
                  <Link key={inc.incident_id} href={`/dashboard/cases/${inc.case_id}`}>
                    <Card interactive>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <IconBox tone={severityTone(inc.severity) === 'danger' ? 'red' : 'yellow'} size="sm">
                              <AlertTriangle className="size-4" />
                            </IconBox>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-heading">{inc.category}</p>
                              {inc.sub_category ? (
                                <p className="truncate text-xs text-muted-foreground">{inc.sub_category}</p>
                              ) : null}
                            </div>
                          </div>
                          <StatusBadge
                            tone={severityTone(inc.severity)}
                            label={severityLabel(inc.severity)}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="size-3.5" />
                            {formatDateTime(inc.incident_at)}
                          </span>
                          {inc.location ? (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="size-3.5" />
                              {inc.location}
                            </span>
                          ) : null}
                          {studentName ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                              <UserRound className="size-3.5" />
                              {studentName}
                              {inc.student_grade ? ` · Kelas ${inc.student_grade}` : ''}
                            </span>
                          ) : null}
                          {involvedTeacher ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="size-3.5" />
                              Guru terkait: {involvedTeacher}
                            </span>
                          ) : null}
                        </div>

                        <p className="line-clamp-2 text-sm text-secondary-text">{inc.description}</p>

                        {inc.immediate_actions ? (
                          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                            <p className="card-label">Tindakan langsung</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-secondary-text">
                              {inc.immediate_actions}
                            </p>
                          </div>
                        ) : null}

                        {activeEvidence.length > 0 || flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {activeEvidence.map((e) => (
                              <Badge key={e} variant="secondary">
                                Bukti: {EVIDENCE_LABELS[e.toLowerCase()] ?? e}
                              </Badge>
                            ))}
                            {flags.map((f) => (
                              <Badge key={f} variant="warning">
                                {f}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>

        {total > PAGE_SIZE && !isLoading && filtered.length > 0 ? (
          <CardFooter className="justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
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