'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import CounselingSessions from '@/components/counselor/CounselingSessions';

interface EmployeeCounselingSubmission {
  submission_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  is_high_priority: boolean;
  submission_status: 'submitted' | 'in_progress' | 'completed' | 'closed';
  counselor_name: string | null;
  submitted_at: string;
  submitted_by_name: string | null;
  /** Booking fields (migration 050) — null/'standalone' for the old form. */
  booking_status?: 'standalone' | 'combined';
  nik_verified?: boolean;
  scheduled_at?: string | null;
  slot_start?: string | null;
  slot_end?: string | null;
  appointment_status?: string | null;
}

function formatSchedule(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const d = new Date(start);
  const date = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (!end) return `${date}, ${time}`;
  const e = new Date(end).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}–${e}`;
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Baru',
  in_progress: 'Sedang Berjalan',
  completed: 'Selesai',
  closed: 'Ditutup',
};

const FILTER_DESCRIPTION: Record<'all' | 'high' | 'mine', string> = {
  all: 'Semua pengajuan konseling karyawan yang masuk ke sistem.',
  high: 'Hanya pengajuan dengan prioritas tinggi yang perlu ditindaklanjuti.',
  mine: 'Hanya pengajuan yang sudah ditugaskan kepada Anda.',
};

export default function EmployeeCounselingCounselorPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<EmployeeCounselingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high' | 'mine'>('all');

  const load = async () => {
    setLoading(true);
    let path = '/employee-counseling/submissions?limit=100';
    if (filter === 'high') path += '&is_high_priority=true';
    if (filter === 'mine') path += '&my_assignments=true';
    const res = await apiClient<{ data: EmployeeCounselingSubmission[] }>(path);
    if (res.success && Array.isArray(res.data)) setSubmissions(res.data as EmployeeCounselingSubmission[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.role === 'COUNSELOR' || user?.role === 'PSYCHOLOGIST') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, filter]);

  const stats = useMemo(() => {
    const high = submissions.filter((s) => s.is_high_priority).length;
    const unassigned = submissions.filter((s) => !s.counselor_name).length;
    const inProgress = submissions.filter((s) => s.submission_status === 'in_progress').length;
    const done = submissions.filter((s) => s.submission_status === 'completed' || s.submission_status === 'closed').length;
    const handledRate = submissions.length > 0 ? Math.round(((submissions.length - unassigned) / submissions.length) * 100) : 0;
    return { total: submissions.length, high, unassigned, inProgress, done, handledRate };
  }, [submissions]);

  if (!user || (user.role !== 'COUNSELOR' && user.role !== 'PSYCHOLOGIST')) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Konseling Karyawan"
          description="Kelola pengajuan konseling dan catat sesi karyawan."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={<ShieldAlert className="size-6" />}
              title="Akses dibatasi"
              description="Halaman ini hanya dapat diakses oleh Konselor atau Psikolog. Silakan hubungi administrator sekolah bila Anda merasa seharusnya memiliki akses."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Konseling Karyawan"
        description="Kelola pengajuan konseling dan catat sesi karyawan."
        actions={
          <>
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
            >
              Semua
            </Button>
            <Button
              variant={filter === 'high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('high')}
              aria-pressed={filter === 'high'}
              className="gap-1.5"
            >
              <AlertTriangle className="size-3.5" />
              Prioritas Tinggi
            </Button>
            <Button
              variant={filter === 'mine' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('mine')}
              aria-pressed={filter === 'mine'}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-3.5" />
              Tugas Saya
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Muat ulang
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Pengajuan"
          value={loading ? '—' : stats.total}
          hint="Seluruh pengajuan pada tampilan aktif"
          icon={<Inbox className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Prioritas Tinggi"
          value={loading ? '—' : stats.high}
          hint="Perlu ditangani lebih dahulu"
          icon={<AlertTriangle className="size-5" />}
          iconTone="red"
          trend={!loading && stats.high > 0 ? 'up' : 'flat'}
          trendLabel={!loading && stats.high > 0 ? 'Perlu ditindaklanjuti' : 'Tidak ada'}
        />
        <StatCard
          label="Belum Ditugaskan"
          value={loading ? '—' : stats.unassigned}
          hint="Menunggu konselor yang menangani"
          icon={<UserCheck className="size-5" />}
          iconTone="yellow"
        />
        <StatCard
          label="Ditangani Konselor"
          value={loading ? '—' : `${stats.handledRate}%`}
          hint={`${stats.inProgress} sedang berjalan · ${stats.done} selesai`}
          icon={<Users className="size-5" />}
          iconTone="green"
          progress={loading ? 0 : stats.handledRate}
          progressLabel="Persentase pengajuan yang sudah ditugaskan"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengajuan</CardTitle>
          <CardDescription>{FILTER_DESCRIPTION[filter]}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
              <p className="text-sm text-muted-foreground">Memuat pengajuan…</p>
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-6" />}
              title="Belum ada pengajuan konseling karyawan"
              description="Anda belum memiliki pengajuan pada filter ini. Coba ganti filter atau muat ulang halaman."
              action={
                filter !== 'all' ? (
                  <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                    Tampilkan semua pengajuan
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Karyawan</TableHeaderCell>
                  <TableHeaderCell scope="col">Jadwal</TableHeaderCell>
                  <TableHeaderCell scope="col">Prioritas</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                  <TableHeaderCell scope="col">Konselor</TableHeaderCell>
                  <TableHeaderCell scope="col">Diajukan</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.submission_id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                          {s.employee_name?.charAt(0)?.toUpperCase() ?? '?'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-heading">{s.employee_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[s.unit, s.position].filter(Boolean).join(' · ') || 'Unit belum diisi'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.booking_status === 'combined' && s.scheduled_at ? (
                        <div className="space-y-1">
                          <p className="whitespace-nowrap text-sm font-medium text-heading">
                            {formatSchedule(s.slot_start ?? s.scheduled_at, s.slot_end)}
                          </p>
                          {s.nik_verified && (
                            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                              <ShieldCheck className="size-3" />
                              NIK terverifikasi
                            </span>
                          )}
                          {s.appointment_status === 'cancelled' && (
                            <StatusBadge tone="warning" label="Dibatalkan" dot={false} />
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground/70">Belum dijadwalkan</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.is_high_priority ? (
                        <StatusBadge tone="danger" label="Prioritas Tinggi" />
                      ) : (
                        <StatusBadge tone="neutral" label="Normal" dot={false} />
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={severityTone(s.submission_status)}
                        label={STATUS_LABEL[s.submission_status] ?? s.submission_status}
                      />
                    </TableCell>
                    <TableCell>
                      {s.counselor_name ? (
                        <span className="text-sm text-secondary-text">{s.counselor_name}</span>
                      ) : (
                        <StatusBadge
                          tone={s.submission_status === 'submitted' ? 'warning' : 'neutral'}
                          label={s.submission_status === 'submitted' ? 'Belum ditugaskan' : '—'}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-secondary-text">
                        {format(new Date(s.submitted_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                      </p>
                      {s.submitted_by_name && (
                        <p className="text-xs text-muted-foreground">oleh {s.submitted_by_name}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        className="gap-1.5"
                        render={
                          <Link href={`/dashboard/counselor/employee-counseling/${s.submission_id}`} />
                        }
                      >
                        <Eye className="size-3.5" />
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Menampilkan {submissions.length} pengajuan
            {filter !== 'all' ? ` pada filter ${FILTER_DESCRIPTION[filter].charAt(0).toLowerCase()}${FILTER_DESCRIPTION[filter].slice(1)}` : ''}.
          </p>
        </CardFooter>
      </Card>

      <CounselingSessions />
    </div>
  );
}