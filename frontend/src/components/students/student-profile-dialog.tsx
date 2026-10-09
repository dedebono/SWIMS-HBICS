'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { apiClient } from '@/lib/api-client';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import {
  DataTable,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Award, ArrowRight, ClipboardList, ShieldAlert, UserRound } from 'lucide-react';

interface StudentProfile {
  student_id: string;
  full_name: string;
  national_id: string;
  enrollment: {
    class_name: string;
    academic_year: string;
  };
  summary: {
    total_active_cases: number;
    total_incidents: number;
    risk_level: string;
    positive_count: number;
    last_incident_date: string | null;
  };
  timeline: Array<{
    date: string;
    type: string;
    status: string;
    handled_by: string;
  }>;
}

const RISK_LABEL: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

const TIMELINE_TYPE_LABEL: Record<string, string> = {
  INCIDENT: 'Insiden',
  INTERVENTION: 'Intervensi',
  OBSERVATION: 'Prestasi',
  CASE_STATUS_CHANGE: 'Perubahan Kasus',
};

/** Nilai "status" pada profil berisi klasifikasi insiden/intervensi (atau
 *  "RECORDED"), jadi dipetakan memakai skala klasifikasi yang sama. */
const STATUS_DISPLAY: Record<string, string> = {
  LOW: 'Minor',
  MEDIUM: 'Moderate',
  HIGH: 'Major',
  CRITICAL: 'Severe',
  RECORDED: 'Tercatat',
};

function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[String(value).toUpperCase()] ?? value;
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return STATUS_DISPLAY[String(value).toUpperCase()] ?? value;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StudentProfileDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && studentId) {
      setLoading(true);
      // Fetch the full aggregated profile for the popup tab
      apiClient(`/students/${studentId}/profile`)
        .then((res) => {
          if (res.success) {
            setProfile((res.data ?? null) as StudentProfile | null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setProfile(null);
    }
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-h-[90vh] !w-full !max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden sm:!max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <IconBox tone="blue" size="sm">
              <UserRound />
            </IconBox>
            Profil Siswa
          </DialogTitle>
          <DialogDescription>
            Ringkasan profil dan riwayat aktivitas siswa ini.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="size-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Informasi dasar */}
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dasar</CardTitle>
                <CardDescription>
                  Data identitas dan pendaftaran siswa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Nama Lengkap</dt>
                    <dd className="text-sm font-medium text-heading">
                      {profile.full_name || '—'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">NIS/NISN</dt>
                    <dd className="font-mono text-sm font-medium text-heading">
                      {profile.national_id || '—'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Kelas</dt>
                    <dd className="text-sm font-medium text-heading">
                      {profile.enrollment?.class_name || '—'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Tahun Ajaran</dt>
                    <dd className="text-sm font-medium text-heading">
                      {profile.enrollment?.academic_year || '—'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Ringkasan perilaku */}
            <div className="space-y-3">
              <div>
                <p className="card-label">Ringkasan Perilaku</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Kasus Aktif"
                  value={profile.summary?.total_active_cases || 0}
                  hint="Kasus yang masih berjalan sampai saat ini."
                  icon={<ClipboardList className="size-5" />}
                  iconTone="blue"
                />
                <StatCard
                  label="Insiden"
                  value={profile.summary?.total_incidents || 0}
                  hint={
                    profile.summary?.last_incident_date
                      ? `Insiden terakhir ${formatDate(profile.summary.last_incident_date)}`
                      : 'Belum ada insiden tercatat.'
                  }
                  icon={<AlertTriangle className="size-5" />}
                  iconTone="red"
                />
                <StatCard
                  label="Catatan Positif"
                  value={profile.summary?.positive_count || 0}
                  hint="Prestasi dan catatan positif siswa."
                  icon={<Award className="size-5" />}
                  iconTone="green"
                />
                <StatCard
                  label="Tingkat Risiko"
                  value={label(RISK_LABEL, profile.summary?.risk_level) === '—' ? 'Rendah' : label(RISK_LABEL, profile.summary.risk_level)}
                  hint="Klasifikasi risiko tertinggi dari kasus aktif."
                  icon={<ShieldAlert className="size-5" />}
                  iconTone="purple"
                />
              </div>
            </div>

            {/* Linimasa */}
            <div className="space-y-3">
              <div>
                <p className="card-label">Linimasa Kronologis</p>
              </div>
              <Card>
                <CardContent className="px-0 pb-0">
                  <DataTable>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell scope="col">Tanggal</TableHeaderCell>
                        <TableHeaderCell scope="col">Jenis</TableHeaderCell>
                        <TableHeaderCell scope="col">Status</TableHeaderCell>
                        <TableHeaderCell scope="col">Ditangani Oleh</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {profile.timeline?.length > 0 ? (
                        profile.timeline.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap text-sm text-secondary-text">
                              {formatDate(item.date)}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-heading">
                              {label(TIMELINE_TYPE_LABEL, item.type)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={severityTone(item.status)}
                                label={statusLabel(item.status)}
                              />
                            </TableCell>
                            <TableCell className="text-sm text-secondary-text">
                              {item.handled_by || '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableEmptyRow colSpan={4}>
                          Belum ada riwayat untuk siswa ini.
                        </TableEmptyRow>
                      )}
                    </TableBody>
                  </DataTable>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardFooter className="justify-between">
                <p className="text-xs text-muted-foreground">
                  Buka linimasa lengkap beserta filter dan grafik progres.
                </p>
                <Button render={<Link href={`/dashboard/students/${profile.student_id}/timeline`} />}>
                  Lihat Linimasa Lengkap
                  <ArrowRight className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={<UserRound />}
            title="Profil tidak ditemukan"
            description="Gagal memuat profil siswa. Silakan coba kembali beberapa saat lagi."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}