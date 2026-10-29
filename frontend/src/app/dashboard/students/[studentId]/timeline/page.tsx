'use client';

import { useEffect, useState, use } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard, ProgressPill } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classificationLabel } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  AlertTriangle,
  Award,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Filter,
  History,
  RotateCcw,
  Stethoscope,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'INCIDENT' | 'INTERVENTION' | 'OBSERVATION' | 'CASE_STATUS_CHANGE';
  date: string;
  category: string;
  severity?: string;
  description: string;
  reported_by_name?: string;
  case_id?: string;
  relevance_weight: number;
}

interface StudentProgress {
  has_data: boolean;
  cases: { total: number; open: number; monitoring: number; closed: number; closure_rate: number };
  interventions: { total: number; completed: number; scheduled: number; completion_rate: number };
  incidents: { total: number };
  observations: { total: number };
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  progress_percentage: number;
}

const RISK_LABEL: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  MONITORING: 'Dipantau',
  CLOSED: 'Ditutup',
};

const CASE_TYPE_LABEL: Record<string, string> = {
  BEHAVIORAL: 'Perilaku',
  EMOTIONAL: 'Emosional',
  MEDICAL: 'Medis',
  ACADEMIC: 'Akademik',
  POSITIVE: 'Positif',
};

function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[String(value).toUpperCase()] ?? value;
}

interface StudentCase {
  case_id: string;
  case_type: 'BEHAVIORAL' | 'EMOTIONAL' | 'MEDICAL' | 'ACADEMIC' | 'POSITIVE';
  status: 'OPEN' | 'MONITORING' | 'CLOSED';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  opened_date: string | null;
  closed_date: string | null;
  summary: string | null;
  assigned_counselor_name: string | null;
  incident_count: number;
  intervention_count: number;
  latest_incident_at: string | null;
}

const CASE_TYPE_ICON: Record<string, typeof Activity> = {
  BEHAVIORAL: AlertTriangle,
  EMOTIONAL: Activity,
  MEDICAL: Stethoscope,
  ACADEMIC: ClipboardList,
  POSITIVE: Award,
};

type EventTone = 'red' | 'green' | 'blue' | 'slate';

/** Warna semantik tiap jenis aktivitas pada linimasa. */
const eventMeta: Record<
  string,
  { label: string; dot: string; text: string; soft: string; ring: string; icon: typeof Activity }
> = {
  INCIDENT: {
    label: 'Insiden',
    dot: 'bg-event-incident',
    text: 'text-event-incident',
    soft: 'bg-event-incident/10',
    ring: 'ring-event-incident/25',
    icon: AlertTriangle,
  },
  OBSERVATION: {
    label: 'Prestasi',
    dot: 'bg-event-observation',
    text: 'text-event-observation',
    soft: 'bg-event-observation/10',
    ring: 'ring-event-observation/25',
    icon: Award,
  },
  INTERVENTION: {
    label: 'Intervensi',
    dot: 'bg-event-intervention',
    text: 'text-event-intervention',
    soft: 'bg-event-intervention/10',
    ring: 'ring-event-intervention/25',
    icon: Activity,
  },
  CASE_STATUS_CHANGE: {
    label: 'Perubahan Kasus',
    dot: 'bg-event-case-change',
    text: 'text-event-case-change',
    soft: 'bg-event-case-change/10',
    ring: 'ring-event-case-change/25',
    icon: ClipboardList,
  },
};

const TONE_TO_ICON: Record<EventTone, 'red' | 'green' | 'blue' | 'slate'> = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  slate: 'slate',
};

function eventIconTone(type: string): EventTone {
  switch (type) {
    case 'INCIDENT':
      return 'red';
    case 'OBSERVATION':
      return 'green';
    case 'INTERVENTION':
      return 'blue';
    default:
      return 'slate';
  }
}

function getRelevanceLabel(weight: number): { label: string; color: string } {
  if (weight > 0.7) return { label: 'Tinggi', color: 'text-success' };
  if (weight > 0.4) return { label: 'Sedang', color: 'text-warning' };
  return { label: 'Rendah', color: 'text-muted-foreground' };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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

export default function StudentTimelinePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { user } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [cases, setCases] = useState<StudentCase[]>([]);
  const [studentName, setStudentName] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudent = async () => {
      try {
        const res = await apiClient<{ student_id: string; full_name: string }>(
          `/students/${resolvedParams.studentId}`,
        );
        if (res.success && res.data) setStudentName(res.data.full_name);
      } catch {
        /* non-fatal: title falls back to generic */
      }
    };
    fetchStudent();
  }, [resolvedParams.studentId]);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const res = await apiClient<StudentProgress>(
          `/students/${resolvedParams.studentId}/progress`,
        );
        if (res.success && res.data) setProgress(res.data);
      } catch {
        /* non-fatal: timeline still renders */
      }
    };
    fetchProgress();
  }, [resolvedParams.studentId]);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const res = await apiClient<StudentCase[]>(
          `/students/${resolvedParams.studentId}/cases`,
        );
        if (res.success && res.data) setCases(res.data);
      } catch {
        /* non-fatal */
      }
    };
    fetchCases();
  }, [resolvedParams.studentId]);

  useEffect(() => {
    const fetchTimeline = async () => {
      setIsLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '100' });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', new Date(fromDate).toISOString());
      if (toDate) params.set('to', new Date(toDate).toISOString());

      const res = await apiClient<TimelineEvent[]>(
        `/students/${resolvedParams.studentId}/timeline?${params.toString()}`,
      );
      if (res.success && res.data) {
        setEvents(res.data);
      }
      setIsLoading(false);
    };
    fetchTimeline();
  }, [resolvedParams.studentId, typeFilter, fromDate, toDate]);

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasFilters = typeFilter !== 'all' || Boolean(fromDate) || Boolean(toDate);
  const interventionRate =
    progress && progress.interventions.total > 0
      ? Math.round((progress.interventions.completed / progress.interventions.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={studentName ? `Linimasa Siswa, ${studentName}` : 'Linimasa Siswa'}
        description="Riwayat kronologis kasus, prestasi, insiden, dan intervensi siswa dalam satu alur."
        actions={
          <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2">
            <History className="size-4 text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">
              {resolvedParams.studentId.slice(0, 8)}...
            </span>
          </div>
        }
      />

      {/* Ringkasan angka */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kemajuan Siswa"
          value={`${progress?.progress_percentage ?? 0}%`}
          hint="Persentase penyelesaian penanganan kasus siswa."
          icon={<Activity className="size-5" />}
          iconTone="blue"
          progress={progress?.progress_percentage ?? 0}
          progressLabel="Kemajuan penanganan kasus"
        />
        <StatCard
          label="Kasus Siswa"
          value={progress?.cases.total ?? cases.length}
          hint={`${progress?.cases.open ?? 0} terbuka · ${progress?.cases.closed ?? 0} ditutup`}
          icon={<ClipboardList className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Insiden"
          value={progress?.incidents.total ?? 0}
          hint="Total insiden yang tercatat untuk siswa ini."
          icon={<AlertTriangle className="size-5" />}
          iconTone="red"
        />
        <StatCard
          label="Prestasi"
          value={progress?.observations.total ?? 0}
          hint="Catatan positif dan pencapaian siswa."
          icon={<Award className="size-5" />}
          iconTone="green"
        />
      </div>

      {/* Penyaring */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Filter className="size-4 text-primary" />
            Penyaring
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline-type">Jenis Aktivitas</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
              <SelectTrigger id="timeline-type" className="w-56" aria-label="Saring jenis aktivitas">
                <SelectValue placeholder="Semua aktivitas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Aktivitas</SelectItem>
                <SelectItem value="INCIDENT">Insiden</SelectItem>
                <SelectItem value="OBSERVATION">Prestasi</SelectItem>
                <SelectItem value="INTERVENTION">Intervensi</SelectItem>
                <SelectItem value="CASE_STATUS_CHANGE">Perubahan Kasus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline-from">Dari Tanggal</Label>
            <Input
              id="timeline-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-44"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline-to">Sampai Tanggal</Label>
            <Input
              id="timeline-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-44"
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter('all');
                setFromDate('');
                setToDate('');
              }}
            >
              <RotateCcw className="size-4" />
              Atur Ulang Penyaring
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Linimasa */}
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2.5">
                    <IconBox tone="blue" size="sm">
                      <CalendarDays />
                    </IconBox>
                    Linimasa Aktivitas
                  </CardTitle>
                  <CardDescription>
                    Klik salah satu baris untuk melihat detail aktivitas.
                  </CardDescription>
                </div>
                <StatusBadge
                  tone="neutral"
                  label={`${events.length} aktivitas`}
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                </div>
              ) : events.length === 0 ? (
                <EmptyState
                  icon={<History />}
                  title="Belum ada aktivitas"
                  description="Belum ada aktivitas yang tercatat. Coba ubah rentang tanggal atau jenis aktivitas."
                />
              ) : (
                <ol className="relative space-y-3 pl-6">
                  {/* Garis penghubung antar titik */}
                  <span
                    aria-hidden="true"
                    className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
                  />
                  {events.map((event) => {
                    const meta = eventMeta[event.type] ?? eventMeta['CASE_STATUS_CHANGE']!;
                    const isExpanded = expandedEvents.has(event.id);
                    const relevance = getRelevanceLabel(event.relevance_weight);
                    const isBoardMember = user?.role === 'BOARD_MEMBER';
                    const EventIcon = meta.icon;

                    return (
                      <li key={event.id} className="relative">
                        <span
                          aria-hidden="true"
                          className={`absolute -left-6 top-4 flex size-3.5 items-center justify-center rounded-full ring-4 ${meta.dot} ${meta.soft}`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpand(event.id)}
                          aria-expanded={isExpanded}
                          className="w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-primary-softer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <IconBox tone={TONE_TO_ICON[eventIconTone(event.type)]} size="sm">
                                <EventIcon />
                              </IconBox>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-xs font-semibold ${meta.text}`}>
                                    {meta.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDateTime(event.date)}
                                  </span>
                                  {event.severity && (
                                    <StatusBadge
                                      tone={severityTone(event.severity)}
                                      label={classificationLabel(event.severity)}
                                    />
                                  )}
                                </div>
                                <p className="mt-1 text-sm font-medium text-heading">
                                  {event.category}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`text-[11px] font-medium ${relevance.color}`}>
                                Relevansi {relevance.label}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="size-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-border pt-3">
                              <p className="text-sm leading-relaxed text-secondary-text">
                                {isBoardMember
                                  ? '[Konten dibatasi untuk Anggota Dewan]'
                                  : event.description}
                              </p>
                              {event.reported_by_name && !isBoardMember && (
                                <p className="text-xs text-muted-foreground">
                                  Dilaporkan oleh: {event.reported_by_name}
                                </p>
                              )}
                              {event.case_id && (
                                <a
                                  href={`/dashboard/cases/${event.case_id}`}
                                  className="action-link text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Lihat Kasus
                                </a>
                              )}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sisi: progres & kasus */}
        <div className="space-y-6">
          {progress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5">
                  <IconBox tone="green" size="sm">
                    <Activity />
                  </IconBox>
                  Progres Siswa
                </CardTitle>
                <CardDescription>
                  Ringkasan penanganan kasus dan intervensi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {!progress.has_data ? (
                  <EmptyState
                    icon={<Activity />}
                    title="Belum ada data"
                    description="Belum ada kasus, intervensi, maupun insiden yang tercatat untuk siswa ini."
                  />
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Kemajuan keseluruhan
                        </span>
                        {progress.risk_level && (
                          <StatusBadge
                            tone={severityTone(progress.risk_level)}
                            label={`Risiko ${label(RISK_LABEL, progress.risk_level)}`}
                          />
                        )}
                      </div>
                      <ProgressPill
                        value={progress.progress_percentage}
                        label="Kemajuan keseluruhan siswa"
                      />
                      <p className="text-xs text-muted-foreground">
                        {progress.progress_percentage}% dari rangkaian penanganan telah selesai.
                      </p>
                    </div>

                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <span className="card-label">Intervensi</span>
                        <span className="text-sm font-semibold text-heading">
                          {progress.interventions.completed}/{progress.interventions.total}
                        </span>
                      </div>
                      <ProgressPill
                        value={interventionRate}
                        tone="green"
                        label="Tingkat penyelesaian intervensi"
                      />
                      <p className="text-xs text-muted-foreground">
                        {progress.interventions.scheduled} intervensi terjadwal ·{' '}
                        {progress.interventions.completed} selesai
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Terbuka</p>
                        <p className="text-lg font-bold text-heading">{progress.cases.open}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Dipantau</p>
                        <p className="text-lg font-bold text-heading">
                          {progress.cases.monitoring}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Ditutup</p>
                        <p className="text-lg font-bold text-heading">{progress.cases.closed}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <IconBox tone="purple" size="sm">
                  <ClipboardList />
                </IconBox>
                Kasus Siswa ({cases.length})
              </CardTitle>
              <CardDescription>
                Semua kasus yang tercatat untuk siswa ini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cases.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList />}
                  title="Belum ada kasus"
                  description="Belum ada kasus yang tercatat untuk siswa ini."
                />
              ) : (
                <div className="space-y-2">
                  {cases.map((c) => {
                    const TypeIcon = CASE_TYPE_ICON[c.case_type] ?? ClipboardList;
                    return (
                      <a
                        key={c.case_id}
                        href={`/dashboard/cases/${c.case_id}`}
                        className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-primary-softer"
                      >
                        <IconBox tone="slate" size="sm">
                          <TypeIcon />
                        </IconBox>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-heading">
                              {label(CASE_TYPE_LABEL, c.case_type)}
                            </span>
                            <StatusBadge
                              tone={severityTone(c.status)}
                              label={label(CASE_STATUS_LABEL, c.status)}
                            />
                            {c.risk_level && (
                              <StatusBadge
                                tone={severityTone(c.risk_level)}
                                label={label(RISK_LABEL, c.risk_level)}
                              />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Dibuka {formatDate(c.opened_date)}
                          </p>
                          {c.summary && (
                            <p className="mt-1 line-clamp-2 text-xs text-secondary-text">
                              {c.summary}
                            </p>
                          )}
                          <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{c.incident_count} insiden</span>
                            <span>{c.intervention_count} intervensi</span>
                            {c.assigned_counselor_name && (
                              <span>Konselor: {c.assigned_counselor_name}</span>
                            )}
                          </p>
                        </div>
                        <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}