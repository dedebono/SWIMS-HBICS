'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge, severityTone, type StatusTone } from '@/components/ui/status-badge';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { AlertTriangle, FileText, Users, Lock, ShieldAlert, Loader2, CheckCircle2, CircleDot } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface Submission {
  submission_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  is_high_priority: boolean;
  submission_status: 'submitted' | 'in_progress' | 'completed' | 'closed';
  counselor_name: string | null;
  submitted_at: string;
  submitted_by_name: string | null;
}

/** Friendly Indonesian labels for each submission status. */
const STATUS_LABEL: Record<string, string> = {
  submitted: 'Terkirim',
  in_progress: 'Diproses',
  completed: 'Selesai',
  closed: 'Ditutup',
};

/** Semantic tone for each submission status. */
const STATUS_TONE: Record<string, StatusTone> = {
  submitted: 'info',
  in_progress: 'warning',
  completed: 'success',
  closed: 'neutral',
};

export default function EmployeeCounselingAdminPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'IT_ADMIN') return;
    const load = async () => {
      setLoading(true);
      const res = await apiClient<{ data: Submission[] }>('/employee-counseling/submissions?limit=200');
      if (res.success && Array.isArray(res.data)) setSubmissions(res.data as Submission[]);
      setLoading(false);
    };
    load();
  }, [user?.role]);

  if (user?.role !== 'IT_ADMIN') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Konseling Karyawan"
          description="Ringkasan dan catatan akses untuk data konseling karyawan."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={<Lock />}
              title="Akses dibatasi"
              description="Halaman ini hanya dapat dibuka oleh Admin IT. Hubungi Admin IT sekolah bila Anda membutuhkan akses."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const highCount = submissions.filter((s) => s.is_high_priority).length;
  const doneCount = submissions.filter(
    (s) => s.submission_status === 'completed' || s.submission_status === 'closed',
  ).length;
  const newCount = submissions.filter((s) => s.submission_status === 'submitted').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Konseling Karyawan"
        description="Ringkasan dan catatan akses untuk data konseling karyawan."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Pengajuan"
          value={submissions.length}
          hint="Seluruh pengajuan konseling karyawan"
          icon={<Users className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Prioritas Tinggi"
          value={highCount}
          hint="Perlu ditangani segera oleh konselor"
          icon={<AlertTriangle className="size-5" />}
          iconTone="red"
          progress={
            submissions.length > 0 ? Math.round((highCount / submissions.length) * 100) : 0
          }
          progressLabel="Persentase pengajuan prioritas tinggi"
        />
        <StatCard
          label="Pengajuan Baru"
          value={newCount}
          hint="Menunggu tindak lanjut konselor"
          icon={<FileText className="size-5" />}
          iconTone="yellow"
        />
        <StatCard
          label="Selesai / Ditutup"
          value={doneCount}
          hint="Pengajuan yang sudah diselesaikan"
          icon={<CheckCircle2 className="size-5" />}
          iconTone="green"
          progress={
            submissions.length > 0 ? Math.round((doneCount / submissions.length) * 100) : 0
          }
          progressLabel="Persentase pengajuan selesai"
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="blue">
              <FileText />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Semua Pengajuan</CardTitle>
              <CardDescription>
                Daftar lengkap pengajuan konseling karyawan yang tercatat di sistem.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Memuat pengajuan konseling…</p>
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="Belum ada pengajuan"
              description="Belum ada pengajuan konseling karyawan yang masuk. Halaman ini akan terisi otomatis saat karyawan mengirim pengajuan."
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Karyawan</TableHeaderCell>
                  <TableHeaderCell scope="col">Unit</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                  <TableHeaderCell scope="col">Prioritas</TableHeaderCell>
                  <TableHeaderCell scope="col">Konselor</TableHeaderCell>
                  <TableHeaderCell scope="col">Tanggal</TableHeaderCell>
                  <TableHeaderCell scope="col">Pengaju</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.submission_id} interactive>
                    <TableCell className="font-medium text-heading">{s.employee_name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.unit || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={STATUS_TONE[s.submission_status] ?? severityTone(s.submission_status)}
                        label={STATUS_LABEL[s.submission_status] ?? s.submission_status}
                      />
                    </TableCell>
                    <TableCell>
                      {s.is_high_priority ? (
                        <StatusBadge tone="danger" label="Tinggi" />
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CircleDot className="size-3" />
                          Normal
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.counselor_name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(s.submitted_at), 'dd MMM yyyy', { locale: id })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.submitted_by_name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
      </Card>

      <Card className="border-warning-soft bg-warning-soft/40">
        <CardContent className="flex items-start gap-3 p-5">
          <IconBox tone="yellow" size="sm">
            <ShieldAlert />
          </IconBox>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-heading">Catatan Kerahasiaan</p>
            <p className="text-sm leading-relaxed text-secondary-text">
              Data konseling karyawan bersifat rahasia. Setiap kali data dibuka, sistem otomatis
              mencatat log akses untuk keperluan pengawasan.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}