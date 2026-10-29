'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  MapPin,
  Plus,
  Users,
} from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { classificationLabel } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyStudent {
  student_id: string;
  full_name: string;
  incident_count: number;
  last_incident_at: string;
  last_severity: string;
}

interface MyIncident {
  incident_id: string;
  student_id: string;
  case_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  incident_at: string;
  immediate_actions: string | null;
  metadata: {
    involved_students?: string[];
    evidence?: Record<string, boolean>;
    initial_assessment?: Record<string, boolean>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIMEZONE = 'Asia/Jakarta';

const formatDate = (value?: string | null) =>
  value
    ? formatInTimeZone(new Date(value), TIMEZONE, 'dd MMM yyyy', { locale: localeId })
    : 'Belum ada';

const formatDateTime = (value?: string | null) =>
  value
    ? formatInTimeZone(new Date(value), TIMEZONE, 'dd MMM yyyy · HH:mm', { locale: localeId })
    : 'Belum ada';

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      <p className="text-sm text-muted-foreground">Memuat data Anda…</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [myStudents, setMyStudents] = useState<MyStudent[]>([]);
  const [myIncidents, setMyIncidents] = useState<MyIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Waktu pemuatan terakhir — dipakai sebagai acuan "30 hari terakhir". */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [studentsRes, incidentsRes] = await Promise.all([
          apiClient<MyStudent[]>('/my-students'),
          apiClient<{ data: MyIncident[] }>('/my-reports?limit=50'),
        ]);

        if (studentsRes.success && studentsRes.data) {
          setMyStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
        }
        if (incidentsRes.success && incidentsRes.data) {
          const raw = incidentsRes.data as unknown as { data?: MyIncident[] };
          setMyIncidents(Array.isArray(raw) ? raw : (raw?.data ?? []));
        }
      } catch (err) {
        console.error('Gagal memuat data guru:', err);
      } finally {
        setLoadedAt(Date.now());
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const firstName = user?.full_name?.split(' ')[0] ?? '';

  const stats = useMemo(() => {
    const criticalCount = myIncidents.filter((i) => i.severity === 'CRITICAL').length;
    const highCount = myIncidents.filter((i) => i.severity === 'HIGH').length;
    const cutoff = (loadedAt ?? 0) - 30 * 24 * 60 * 60 * 1000;
    const last30 = myIncidents.filter(
      (i) => new Date(i.incident_at).getTime() >= cutoff,
    ).length;
    const total = myIncidents.length;
    return {
      total,
      criticalCount,
      highCount,
      urgent: criticalCount + highCount,
      last30,
      last30Pct: total > 0 ? Math.round((last30 / total) * 100) : 0,
    };
  }, [myIncidents, loadedAt]);

  const recentIncidents = useMemo(() => myIncidents.slice(0, 6), [myIncidents]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Selamat datang, ${firstName}` : 'Dashboard Guru'}
        description="Pantau laporan insiden yang Anda buat dan siswa yang pernah Anda ampu."
        actions={
          <Button render={<Link href="/dashboard/incidents/new" />}>
            <Plus className="size-4" />
            Buat Laporan
          </Button>
        }
      />

      {/* Baris kartu statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Laporan dari Anda"
          value={isLoading ? '—' : stats.total}
          hint="Insiden yang pernah Anda laporkan."
          icon={<FileText />}
          iconTone="blue"
        />
        <StatCard
          label="Perlu Perhatian"
          value={isLoading ? '—' : stats.urgent}
          hint={`${stats.criticalCount} klasifikasi kritis · ${stats.highCount} klasifikasi tinggi`}
          icon={<AlertTriangle />}
          iconTone="red"
          trend={stats.urgent > 0 ? 'up' : 'down'}
          trendLabel={stats.urgent > 0 ? 'perlu ditindaklanjuti' : 'aman'}
        />
        <StatCard
          label="Siswa yang Dilaporkan"
          value={isLoading ? '—' : myStudents.length}
          hint="Siswa berbeda yang muncul di laporan Anda."
          icon={<Users />}
          iconTone="teal"
        />
        <StatCard
          label="Laporan 30 Hari Terakhir"
          value={isLoading ? '—' : stats.last30}
          hint="Aktivitas laporan dalam sebulan terakhir."
          icon={<CalendarDays />}
          iconTone="purple"
          progress={stats.last30Pct}
          progressLabel="Porsi laporan 30 hari terakhir"
        />
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          {/* Laporan Terbaru */}
          <Card className="xl:col-span-3">
            <CardHeader className="border-b">
              <CardTitle>Laporan Terbaru</CardTitle>
              <CardDescription>
                Enam laporan terakhir yang Anda buatkan beserta kasusnya.
              </CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/dashboard/incidents" />}
                >
                  Lihat semua
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {recentIncidents.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title="Belum ada laporan"
                  description="Anda belum membuat laporan insiden. Mulai dengan menambahkan laporan insiden."
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col">Laporan</TableHeaderCell>
                      <TableHeaderCell scope="col">Siswa</TableHeaderCell>
                      <TableHeaderCell scope="col">Klasifikasi</TableHeaderCell>
                      <TableHeaderCell scope="col">Waktu</TableHeaderCell>
                      <TableHeaderCell scope="col">Lokasi</TableHeaderCell>
                      <TableHeaderCell scope="col">
                        <span className="sr-only">Tindakan</span>
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentIncidents.map((incident) => {
                      const student = myStudents.find(
                        (s) => s.student_id === incident.student_id,
                      );
                      return (
                        <TableRow key={incident.incident_id}>
                          <TableCell>
                            <p className="font-medium text-heading">
                              {incident.category}
                            </p>
                            {incident.sub_category ? (
                              <p className="text-xs text-muted-foreground">
                                {incident.sub_category}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-secondary-text">
                            {student?.full_name ?? 'Siswa tidak ditemukan'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={severityTone(incident.severity)}
                              label={classificationLabel(incident.severity)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-secondary-text">
                            {formatDateTime(incident.incident_at)}
                          </TableCell>
                          <TableCell className="text-secondary-text">
                            {incident.location ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="xs"
                              render={
                                <Link href={`/dashboard/cases/${incident.case_id}`} />
                              }
                            >
                              Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </DataTable>
              )}
              {myIncidents.length > recentIncidents.length ? (
                <p className="pt-3 text-center text-xs text-muted-foreground">
                  Menampilkan {recentIncidents.length} dari {myIncidents.length} laporan.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Siswa yang Dilaporkan */}
          <Card className="xl:col-span-2">
            <CardHeader className="border-b">
              <CardTitle>Siswa yang Dilaporkan</CardTitle>
              <CardDescription>
                Klik nama siswa untuk membuka Linimasa Siswa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myStudents.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Belum ada data"
                  description="Siswa yang Anda laporkan akan tampil di sini setelah laporan pertama dibuat."
                />
              ) : (
                <ul className="scroll-slim -mx-1 max-h-[28rem] space-y-2.5 overflow-y-auto px-1">
                  {myStudents.map((student) => (
                    <li key={student.student_id}>
                      <Link
                        href={`/dashboard/students/${student.student_id}/timeline`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-primary-softer"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                          {initialOf(student.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-heading">
                            {student.full_name}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="size-3.5 shrink-0" />
                            {student.incident_count} laporan · terakhir{' '}
                            {formatDate(student.last_incident_at)}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-border text-muted-foreground"
                        >
                          {classificationLabel(student.last_severity)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Panduan singkat */}
      {!isLoading && myIncidents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                <MapPin className="size-5" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-heading">
                  Buat laporan pertama Anda
                </p>
                <p className="text-xs text-muted-foreground">
                  Catat insiden segera setelah kejadian agar penanganan bisa lebih cepat.
                </p>
              </div>
            </div>
            <Button render={<Link href="/dashboard/incidents/new" />}>
              <Plus className="size-4" />
              Buat Laporan
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}