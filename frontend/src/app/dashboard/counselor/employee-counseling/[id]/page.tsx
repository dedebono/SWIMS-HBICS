'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Hourglass,
  Info,
  NotebookPen,
  Phone,
  ShieldAlert,
  UserCog,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { ProgressPill, StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone, type StatusTone } from '@/components/ui/status-badge';
import { IconBox } from '@/components/ui/icon-box';
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
import { toast } from 'sonner';
import { SessionNoteDialog, type EditableSession } from './session-note-dialog';

interface SessionNote {
  session_id: string;
  session_number: number;
  session_date: string | null;
  session_time?: string | null;
  method: string | null;
  section_2_presenting_concern: string | null;
  section_3_key_points?: string[] | null;
  section_4_observation?: string | null;
  section_5_intervention?: { type?: string; note?: string } | null;
  section_6_employee_insight?: string | null;
  section_7_action_plan?: string[] | null;
  section_8_risk: { level: string; safety_action: string; concern_description?: string } | null;
  section_9_followup: {
    status: string;
    target_sesi_berikutnya: string;
    tanggal_follow_up?: string | null;
  } | null;
  created_at: string;
}

interface Submission {
  submission_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  contact_number: string | null;
  answers: any;
  // Top-level column on the row (migration 044 / EmployeeCounselingSubmissionRow).
  // It was missing here, which is why the consent panel reached into `answers`
  // and always rendered "Belum".
  consents?: { consent_confidentiality?: boolean; consent_emergency_protocol?: boolean };
  is_high_priority: boolean;
  submission_status: 'submitted' | 'in_progress' | 'completed' | 'closed';
  assigned_counselor_id: string | null;
  counselor_name: string | null;
  submitted_at: string;
}

const ANSWER_LABELS_Q1: Record<string, string> = {
  'Masalah pribadi': 'Masalah pribadi',
  'Keluarga/pernikahan': 'Keluarga / Pernikahan',
  'Relasi dengan orang lain': 'Relasi dengan orang lain',
  'Pekerjaan': 'Pekerjaan',
  'Konflik di tempat kerja': 'Konflik di tempat kerja',
  'Tekanan/stres': 'Tekanan / Stres',
  'Emosi yang sulit dikelola': 'Emosi yang sulit dikelola',
  'Kehilangan/dukacita': 'Kehilangan / Dukacita',
  'Pengambilan keputusan': 'Pengambilan keputusan',
  'Pertumbuhan pribadi/kariter': 'Pertumbuhan pribadi/karakter',
  'Kehidupan rohani': 'Kehidupan rohani',
  'Membutuhkan seseorang untuk mendengarkan': 'Membutuhkan seseorang untuk mendengarkan',
  'Lainnya': 'Lainnya',
};

const AREA_LABELS: Record<string, string> = {
  'Konsentrasi': 'Konsentrasi',
  'Produktivitas kerja': 'Produktivitas kerja',
  'Hubungan dengan orang lain': 'Hubungan dengan orang lain',
  'Kondisi emosi': 'Kondisi emosi',
  'Tidur/istirahat': 'Tidur / Istirahat',
  'Aktivitas sehari-hari': 'Aktivitas sehari-hari',
  'Kehidupan keluarga': 'Kehidupan keluarga',
  'Kehidupan rohani': 'Kehidupan rohani',
  'Tidak ada dampak yang signifikan': 'Tidak ada dampak signifikan',
  'Lainnya': 'Lainnya',
};

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Baru',
  in_progress: 'Sedang Berjalan',
  completed: 'Selesai',
  closed: 'Ditutup',
};

const RISK_LABELS: Record<string, string> = {
  no_risk: 'Tidak ada risiko',
  low: 'Risiko rendah',
  moderate: 'Risiko sedang',
  medium: 'Risiko sedang',
  high: 'Risiko tinggi',
};

const RISK_TONES: Record<string, StatusTone> = {
  no_risk: 'success',
  low: 'info',
  moderate: 'warning',
  medium: 'warning',
  high: 'danger',
};

const SAFETY_ACTION_LABELS: Record<string, string> = {
  tidak_dibutuhkan: 'Tidak diperlukan',
  safety_plan: 'Rencana keselamatan',
  emergency_protocol: 'Protokol darurat',
  referral_profesional: 'Rujukan profesional',
  emergency_referral: 'Rujukan darurat',
};

const FOLLOWUP_LABELS: Record<string, string> = {
  selesai: 'Selesai',
  follow_up_disarankan: 'Follow-up disarankan',
  follow_up_dijadwalkan: 'Follow-up dijadwalkan',
  referral_direkomendasikan: 'Rujukan direkomendasikan',
  referral_dilakukan: 'Rujukan dilakukan',
};

const YES_NO_LABELS: Record<string, string> = { ya: 'Ya', tidak: 'Tidak' };

const methodLabel = (method?: string | null): string =>
  method === 'tatap_muka' ? 'Tatap muka' : method === 'online' ? 'Online' : '—';

/** Risiko sesi memakai peta lokal, dengan fallback ke severityTone. */
const riskTone = (level?: string | null): StatusTone =>
  RISK_TONES[(level || '').toLowerCase()] ?? severityTone(level);

/** Baris label/nilai yang rapi untuk data intake. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/70 py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-heading">{value ?? '—'}</span>
    </div>
  );
}

/** Satu bagian kuesioner dengan judul + ikon. */
function AnswerSection({
  icon,
  tone = 'blue',
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  tone?: React.ComponentProps<typeof IconBox>['tone'];
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconBox tone={tone} size="sm">
          {icon}
        </IconBox>
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-heading text-sm font-semibold text-heading">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function EmployeeCounselingDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const id = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [sessions, setSessions] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  // Session note modal: `sessionDialogOpen` gates visibility, `viewedSession`
  // is non-null when reopening an existing note from the Catatan Sesi table.
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [viewedSession, setViewedSession] = useState<EditableSession | null>(null);

  const openNewSession = () => {
    setViewedSession(null);
    setSessionDialogOpen(true);
  };

  const openSession = (s: SessionNote) => {
    setViewedSession(s);
    setSessionDialogOpen(true);
  };

  const load = async () => {
    setLoading(true);
    const [subRes, sesRes] = await Promise.all([
      apiClient<Submission>(`/employee-counseling/submissions/${id}`),
      apiClient<SessionNote[]>(`/employee-counseling/submissions/${id}/sessions`),
    ]);
    if (subRes.success && subRes.data) setSubmission(subRes.data);
    if (sesRes.success && sesRes.data) setSessions(sesRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const assignToMe = async () => {
    if (!user) return;
    setAssigning(true);
    const res = await apiClient(`/employee-counseling/submissions/${id}/assign`, {
      method: 'PATCH',
      body: { counselor_id: user.user_id },
    });
    setAssigning(false);
    if (res.success) {
      toast.success('Pengajuan ditugaskan ke Anda');
      load();
    } else {
      toast.error(res.error ?? 'Gagal menugaskan pengajuan');
    }
  };

  const answers = useMemo(() => submission?.answers || {}, [submission]);

  // `consents` is a TOP-LEVEL column on the submission row (see
  // EmployeeCounselingSubmissionRow and migration 044), NOT a key inside
  // `answers`. This panel used to read `answers.consents`, which is always
  // undefined for stored rows — so every submission was displayed as
  // "Belum" even when the employee had ticked both boxes. Fall back to the
  // nested shape only for safety.
  const consents = useMemo<{ consent_confidentiality?: boolean; consent_emergency_protocol?: boolean }>(
    () => submission?.consents ?? (answers as Record<string, unknown>).consents ?? {},
    [submission, answers],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Memuat pengajuan…" description="Mengambil data pengajuan konseling karyawan." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-4 w-24 rounded bg-muted" /></CardHeader>
              <CardContent className="space-y-2">
                <div className="h-8 w-16 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="animate-pulse">
          <CardContent className="space-y-3 py-10">
            <div className="h-3 w-48 rounded bg-muted" />
            <p className="text-center text-sm text-muted-foreground">Memuat data pengajuan…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Detail Pengajuan"
          description="Informasi pengajuan konseling karyawan."
          actions={
            <Button variant="outline" size="sm" render={<Link href="/dashboard/counselor/employee-counseling" />}>
              <ArrowLeft className="size-3.5" />
              Kembali ke daftar
            </Button>
          }
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText className="size-6" />}
              title="Pengajuan tidak ditemukan"
              description="Data pengajuan mungkin sudah dihapus atau tautan tidak valid. Kembali ke daftar pengajuan untuk memilih pengajuan lain."
              action={
                <Button size="sm" render={<Link href="/dashboard/counselor/employee-counseling" />}>
                  Kembali ke daftar
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const dampak = Number(answers.q4_dampak) || 0;
  const dampakPercent = Math.round((dampak / 5) * 100);
  const dampakTone: 'green' | 'yellow' | 'red' = dampak >= 4 ? 'red' : dampak >= 3 ? 'yellow' : 'green';
  const isAssigned = Boolean(submission.assigned_counselor_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={submission.employee_name}
        description={[submission.unit, submission.position].filter(Boolean).join(' · ') || 'Data unit belum dilengkapi'}
        actions={
          <>
            {submission.is_high_priority && (
              <StatusBadge tone="danger" label="Prioritas Tinggi" />
            )}
            <StatusBadge
              tone={severityTone(submission.submission_status)}
              label={STATUS_LABEL[submission.submission_status] ?? submission.submission_status}
            />
            <Button variant="outline" size="sm" render={<Link href="/dashboard/counselor/employee-counseling" />}>
              <ArrowLeft className="size-3.5" />
              Kembali
            </Button>
          </>
        }
      />

      {!isAssigned && (
        <Card className="border-warning/30 bg-warning-soft">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IconBox tone="yellow" size="sm">
                <AlertTriangle />
              </IconBox>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-heading">Belum ada konselor yang ditugaskan</p>
                <p className="text-xs text-muted-foreground">
                  Pengajuan ini menunggu tindak lanjut. Ambil alih penanganan bila Anda akan menindaklanjuti.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={assignToMe} disabled={assigning} className="gap-1.5">
              <UserCog className="size-3.5" />
              {assigning ? 'Menugaskan…' : 'Tugaskan ke Saya'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Status Pengajuan"
          value={STATUS_LABEL[submission.submission_status] ?? submission.submission_status}
          hint={`Diajukan ${format(new Date(submission.submitted_at), 'dd MMM yyyy', { locale: idLocale })}`}
          icon={<ClipboardCheck className="size-5" />}
          iconTone={severityTone(submission.submission_status) === 'success' ? 'green' : 'blue'}
        />
        <StatCard
          label="Tingkat Dampak"
          value={`${dampak}/5`}
          hint={dampak >= 4 ? 'Dampak-signifikan, perlu perhatian' : dampak >= 3 ? 'Dampak menengah' : 'Dampak ringan'}
          icon={<AlertTriangle className="size-5" />}
          iconTone={dampakTone}
          progress={dampakPercent}
          progressLabel="Tingkat dampak dari jawaban karyawan"
        />
        <StatCard
          label="Jumlah Sesi"
          value={sessions.length}
          hint={sessions.length === 0 ? 'Belum ada sesi tercatat' : 'Sesi konseling tercatat'}
          icon={<Calendar className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Konselor Handles"
          value={submission.counselor_name ?? 'Belum ada'}
          hint={submission.counselor_name ? 'Penanggung jawab pengajuan' : 'Menunggu penugasan konselor'}
          icon={<Users className="size-5" />}
          iconTone="teal"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form Intake Karyawan</CardTitle>
          <CardDescription>
            Diterima pada {format(new Date(submission.submitted_at), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-7">
          <AnswerSection
            icon={<Users />}
            tone="blue"
            title="A. Informasi Dasar"
            description="Identitas pengaju konseling"
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div className="space-y-0">
                <InfoRow label="Nama" value={submission.employee_name} />
                <InfoRow label="Unit" value={submission.unit || '—'} />
              </div>
              <div className="space-y-0">
                <InfoRow label="Jabatan" value={submission.position || '—'} />
                <InfoRow
                  label="Kontak"
                  value={
                    submission.contact_number ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground" />
                        {submission.contact_number}
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
            </div>
          </AnswerSection>

          <div className="border-t border-border" />

          <AnswerSection
            icon={<Info />}
            tone="purple"
            title="B. Kebutuhan Konseling"
            description="Alasan dan dampak yang dirasakan karyawan"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Alasan utama</p>
                {(answers.q1_alasan || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada jawaban.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(answers.q1_alasan || []).map((a: string) => (
                      <StatusBadge key={a} tone="info" dot={false} label={ANSWER_LABELS_Q1[a] || a} />
                    ))}
                  </div>
                )}
              </div>

              {answers.q2_deskripsi && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Cerita singkat</p>
                  <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-secondary-text">
                    {answers.q2_deskripsi}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Durasi</p>
                  <p className="text-sm font-medium text-heading">{answers.q3_durasi || '—'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Tingkat dampak</p>
                    <span className="text-xs font-semibold text-heading">{dampak} dari 5</span>
                  </div>
                  <ProgressPill
                    value={dampakPercent}
                    tone={dampakTone}
                    label="Tingkat dampak dari jawaban karyawan"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Area terdampak</p>
                {(answers.q5_area_terdampak || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada jawaban.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(answers.q5_area_terdampak || []).map((a: string) => (
                      <StatusBadge key={a} tone="neutral" dot={false} label={AREA_LABELS[a] || a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </AnswerSection>

          <div className="border-t border-border" />

          <AnswerSection
            icon={<Hourglass />}
            tone="teal"
            title="C. Harapan & Riwayat"
            description="Harapan karyawan dan pengalaman konseling sebelumnya"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Harapan</p>
                {(answers.q6_harapan || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada jawaban.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(answers.q6_harapan || []).map((a: string) => (
                      <StatusBadge key={a} tone="purple" dot={false} label={a} />
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-x-8 sm:grid-cols-2">
                <div className="space-y-0">
                  <InfoRow label="Pernah konseling" value={answers.q7_pernah_konseling || '—'} />
                </div>
                <div className="space-y-0">
                  <InfoRow label="Detail" value={answers.q7_pernah_konseling_detail || '—'} />
                </div>
              </div>
            </div>
          </AnswerSection>

          <div className="border-t border-border" />

          <AnswerSection
            icon={<ShieldAlert />}
            tone="red"
            title="D. Kondisi Mendesak"
            description="Indikasi bahaya keselamatan yang perlu ditangani segera"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className={cn(
                  'rounded-xl border p-4',
                  answers.q8_safety_threat === 'ya' ? 'border-danger/30 bg-danger-soft' : 'border-border bg-muted/30'
                )}
              >
                <p className="text-xs text-muted-foreground">Keselamatan terancam</p>
                <div className="mt-2">
                  {answers.q8_safety_threat ? (
                    <StatusBadge
                      tone={answers.q8_safety_threat === 'ya' ? 'danger' : 'success'}
                      label={YES_NO_LABELS[answers.q8_safety_threat] ?? answers.q8_safety_threat}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  'rounded-xl border p-4',
                  answers.q9_bantuan_segera === 'ya' ? 'border-danger/30 bg-danger-soft' : 'border-border bg-muted/30'
                )}
              >
                <p className="text-xs text-muted-foreground">Membutuhkan bantuan segera</p>
                <div className="mt-2">
                  {answers.q9_bantuan_segera ? (
                    <StatusBadge
                      tone={answers.q9_bantuan_segera === 'ya' ? 'danger' : 'success'}
                      label={YES_NO_LABELS[answers.q9_bantuan_segera] ?? answers.q9_bantuan_segera}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>
          </AnswerSection>

          <div className="border-t border-border" />

          <AnswerSection
            icon={<Calendar />}
            tone="blue"
            title="E. Jadwal & Preferensi"
            description="Waktu, metode, dan preferensi konselor yang diinginkan"
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div className="space-y-0">
                <div className="space-y-2 py-2">
                  <p className="text-xs text-muted-foreground">Waktu yang tersedia</p>
                  {(answers.e_waktu || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(answers.e_waktu || []).map((w: string) => (
                        <StatusBadge key={w} tone="info" dot={false} label={w} />
                      ))}
                    </div>
                  )}
                </div>
                <InfoRow label="Hari diutamakan" value={answers.e_hari || '—'} />
              </div>
              <div className="space-y-0">
                <InfoRow label="Metode" value={answers.e_metode || '—'} />
                <InfoRow label="Preferensi konselor" value={answers.e_konselor_preferensi || '—'} />
              </div>
            </div>
          </AnswerSection>

          <div className="border-t border-border" />

          <AnswerSection
            icon={<CheckCircle2 />}
            tone="green"
            title="F. Persetujuan"
            description="Persetujuan kerahasiaan dan protokol darurat"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <span className="text-sm text-secondary-text">Kerahasiaan informasi</span>
                {consents.consent_confidentiality ? (
                  <StatusBadge tone="success" label="Setuju" />
                ) : (
                  <StatusBadge tone="danger" label="Belum" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <span className="text-sm text-secondary-text">Protokol darurat</span>
                {consents.consent_emergency_protocol ? (
                  <StatusBadge tone="success" label="Setuju" />
                ) : (
                  <StatusBadge tone="danger" label="Belum" />
                )}
              </div>
            </div>
          </AnswerSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Catatan Sesi</CardTitle>
              <CardDescription>
                {sessions.length === 0
                  ? 'Belum ada sesi konseling yang tercatat.'
                  : `${sessions.length} sesi tercatat untuk pengajuan ini.`}
              </CardDescription>
            </div>
            {submission.submission_status !== 'closed' && (
              <Button size="sm" className="gap-1.5" onClick={openNewSession}>
                <CalendarPlus className="size-3.5" />
                Sesi Baru
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="size-6" />}
              title="Belum ada sesi tercatat"
              description="Tambahkan sesi pertama untuk mulai mencatat pokok persoalan, observasi, dan tindak lanjut konseling."
              action={
                submission.submission_status !== 'closed' ? (
                  <Button size="sm" className="gap-1.5" onClick={openNewSession}>
                    <CalendarPlus className="size-3.5" />
                    Catat Sesi Baru
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Sesi</TableHeaderCell>
                  <TableHeaderCell scope="col">Tanggal</TableHeaderCell>
                  <TableHeaderCell scope="col">Metode</TableHeaderCell>
                  <TableHeaderCell scope="col">Pokok Permasalahan</TableHeaderCell>
                  <TableHeaderCell scope="col">Risiko</TableHeaderCell>
                  <TableHeaderCell scope="col">Tindak Lanjut</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow
                    key={s.session_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Buka detail Sesi ${s.session_number}`}
                    className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    onClick={() => openSession(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openSession(s);
                      }
                    }}
                  >
                    <TableCell>
                      <span className="text-sm font-semibold text-heading">Sesi {s.session_number}</span>
                      <p className="text-xs text-muted-foreground">
                        Dicatat {format(new Date(s.created_at), 'dd MMM yyyy', { locale: idLocale })}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-secondary-text">
                      {s.session_date
                        ? format(new Date(s.session_date), 'dd MMM yyyy', { locale: idLocale })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-secondary-text">{methodLabel(s.method)}</TableCell>
                    <TableCell>
                      {s.section_2_presenting_concern ? (
                        <p className="max-w-xs text-xs leading-relaxed text-secondary-text">
                          {s.section_2_presenting_concern}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.section_8_risk ? (
                        <div className="space-y-1">
                          <StatusBadge
                            tone={riskTone(s.section_8_risk.level)}
                            label={RISK_LABELS[s.section_8_risk.level?.toLowerCase()] ?? s.section_8_risk.level}
                          />
                          <p className="text-xs text-muted-foreground">
                            {SAFETY_ACTION_LABELS[s.section_8_risk.safety_action] ?? s.section_8_risk.safety_action ?? '—'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.section_9_followup ? (
                        <div className="space-y-1">
                          <StatusBadge
                            tone={severityTone(s.section_9_followup.status)}
                            label={FOLLOWUP_LABELS[s.section_9_followup.status] ?? s.section_9_followup.status}
                          />
                          {s.section_9_followup.target_sesi_berikutnya && (
                            <p className="max-w-xs text-xs leading-relaxed text-secondary-text">
                              {s.section_9_followup.target_sesi_berikutnya}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          // Stop propagation so the row-level handler doesn't double-fire.
                          e.stopPropagation();
                          openSession(s);
                        }}
                        aria-label={`Buka detail Sesi ${s.session_number}`}
                      >
                        <Eye className="size-3.5" />
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
            Total {sessions.length} sesi tercatat untuk {submission.employee_name}.
          </p>
        </CardFooter>
      </Card>

      {/* Sesi Baru / reopened session note — modal, no page navigation */}
      <SessionNoteDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        submissionId={id}
        employeeName={submission.employee_name}
        session={viewedSession}
        onSaved={load}
      />
    </div>
  );
}
