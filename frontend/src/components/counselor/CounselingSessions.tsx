'use client';

import { useEffect, useState } from 'react';
import { id as idLocale } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { toast } from 'sonner';
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  MapPin,
  NotebookPen,
  Save,
  Send,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconBox } from '@/components/ui/icon-box';
import { EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { apiClient } from '@/lib/api-client';

interface CounselorAppt {
  appointment_id: string;
  type: 'student' | 'personal';
  status: string;
  scheduled_at: string | null;
  location: string | null;
  notes: string | null;
  created_for: string;
  created_for_name?: string | null;
  student_id?: string | null;
}

interface ReferralView {
  referral_id: string;
  appointment_id: string | null;
  recommended_by: string | null;
  reason: string;
  referral_type: 'internal_psychologist' | 'puspaga_external';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  leader_note: string | null;
}

const APPT_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  confirmed: 'Terkonfirmasi',
  awaiting_psychologist_availability: 'Menunggu Ketersediaan Psikolog',
  cancelled: 'Dibatalkan',
  completed: 'Selesai',
};

const REF_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu Persetujuan',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  completed: 'Selesai',
};

const apptTone = (s: string) =>
  s === 'awaiting_psychologist_availability' ? ('purple' as const) : severityTone(s);

const refTypeLabel = (t: string) =>
  t === 'internal_psychologist' ? 'Psikolog Sekolah' : 'Puspaga (Eksternal)';

export default function CounselingSessions() {
  const [appointments, setAppointments] = useState<CounselorAppt[]>([]);
  const [referrals, setReferrals] = useState<ReferralView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [refFormFor, setRefFormFor] = useState<string | null>(null);
  const [refDraft, setRefDraft] = useState<{ reason: string; type: 'internal_psychologist' | 'puspaga_external' }>({ reason: '', type: 'internal_psychologist' });
  const [submittingRef, setSubmittingRef] = useState(false);
  const [externalResult, setExternalResult] = useState<Record<string, string>>({});
  const [savingExtId, setSavingExtId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem('swims_user') || '{}');
    const [apptRes, refRes] = await Promise.all([
      apiClient<CounselorAppt[]>(`/appointments?counselor_id=${user.user_id}`),
      apiClient<ReferralView[]>('/referrals'),
    ]);
    if (apptRes.success && apptRes.data) {
      setAppointments(apptRes.data);
      const init: Record<string, string> = {};
      apptRes.data.forEach((a) => (init[a.appointment_id] = a.notes ?? ''));
      setNotes(init);
    }
    if (refRes.success && refRes.data) setReferrals(refRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const referralFor = (apptId: string) => referrals.find((r) => r.appointment_id === apptId);

  const saveNotes = async (apptId: string) => {
    setSavingNoteId(apptId);
    const res = await apiClient(`/appointments/${apptId}/notes`, {
      method: 'PATCH',
      body: { notes: notes[apptId] ?? '' },
    });
    setSavingNoteId(null);
    if (res.success) toast.success('Catatan sesi disimpan');
    else toast.error(res.error ?? 'Gagal menyimpan');
  };

  const submitReferral = async (apptId: string) => {
    if (!refDraft.reason.trim()) {
      toast.error('Alasan rujukan wajib diisi.');
      return;
    }
    setSubmittingRef(true);
    const res = await apiClient('/referrals', {
      method: 'POST',
      body: { appointment_id: apptId, reason: refDraft.reason, referral_type: refDraft.type },
    });
    setSubmittingRef(false);
    if (res.success) {
      toast.success('Rujukan dikirim, menunggu persetujuan School Head.');
      setRefFormFor(null);
      setRefDraft({ reason: '', type: 'internal_psychologist' });
      fetchAll();
    } else {
      toast.error(res.error ?? 'Gagal mengirim rujukan');
    }
  };

  const saveExternal = async (referralId: string) => {
    if (!externalResult[referralId]?.trim()) {
      toast.error('Hasil konsultasi wajib diisi.');
      return;
    }
    setSavingExtId(referralId);
    const res = await apiClient(`/referrals/${referralId}/external-result`, {
      method: 'POST',
      body: { note: externalResult[referralId] },
    });
    setSavingExtId(null);
    if (res.success) {
      toast.success('Hasil konsultasi Puspaga tersimpan.');
      fetchAll();
    } else {
      toast.error(res.error ?? 'Gagal menyimpan hasil');
    }
  };

  const pendingReferrals = appointments.filter(
    (a) => referralFor(a.appointment_id)?.status === 'pending'
  ).length;
  const studentSessions = appointments.filter((a) => a.type === 'student').length;
  const personalSessions = appointments.length - studentSessions;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Janji Temu"
          value={appointments.length}
          hint="Sesi konseling yang ditugaskan kepada Anda"
          icon={<CalendarDays className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Sesi Siswa"
          value={studentSessions}
          hint="Konseling untuk siswa"
          icon={<Users className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Rujukan Menunggu Persetujuan"
          value={pendingReferrals}
          hint="Menunggu keputusan School Head"
          icon={<ClipboardList className="size-5" />}
          iconTone="yellow"
          trend={pendingReferrals > 0 ? 'up' : 'flat'}
          trendLabel={pendingReferrals > 0 ? 'Perlu ditinjau' : 'Semua beres'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Janji Temu &amp; Rujukan Saya</CardTitle>
          <CardDescription>
            Isi hasil sesi konseling (poin 6) dan buat rujukan psikolog — disetujui 2 pihak (Anda +
            School Head). Sesi personal: {personalSessions}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm font-medium text-muted-foreground">Memuat janji temu…</p>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="size-6" />}
              title="Belum ada janji temu"
              description="Belum ada sesi konseling yang ditugaskan kepada Anda. Janji temu baru akan otomatis tampil di sini."
            />
          ) : (
            appointments.map((a) => {
              const ref = referralFor(a.appointment_id);
              return (
                <div
                  key={a.appointment_id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconBox tone={a.type === 'student' ? 'purple' : 'teal'} size="sm">
                        <UserRound className="size-4" />
                      </IconBox>
                      <div className="min-w-0 space-y-1">
                        <p className="font-heading text-sm font-semibold text-heading">
                          {a.created_for_name ?? a.created_for ?? 'Tanpa nama'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.type === 'student' ? 'Sesi Siswa' : 'Sesi Personal (Guru/Staf)'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarClock className="size-3.5 shrink-0" />
                            {a.scheduled_at
                              ? formatInTimeZone(new Date(a.scheduled_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', {
                                  locale: idLocale,
                                })
                              : 'Belum dijadwalkan'}
                          </span>
                          {a.location ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="size-3.5 shrink-0" />
                              {a.location}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      tone={apptTone(a.status)}
                      label={APPT_STATUS_LABEL[a.status] ?? a.status}
                    />
                  </div>

                  {/* Hasil Sesi (point 6 hook) */}
                  <div className="mt-4 space-y-2 rounded-xl border border-border bg-background p-3.5">
                    <Label htmlFor={`notes-${a.appointment_id}`}>
                      <NotebookPen className="size-3.5" />
                      Hasil Sesi Konseling
                    </Label>
                    <Textarea
                      id={`notes-${a.appointment_id}`}
                      rows={2}
                      placeholder="Catatan hasil sesi…"
                      value={notes[a.appointment_id] ?? ''}
                      onChange={(e) => setNotes((p) => ({ ...p, [a.appointment_id]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        disabled={savingNoteId === a.appointment_id}
                        onClick={() => saveNotes(a.appointment_id)}
                      >
                        <Save className="size-4" />
                        {savingNoteId === a.appointment_id ? 'Menyimpan…' : 'Simpan Catatan'}
                      </Button>
                    </div>
                  </div>

                  {/* Rujukan */}
                  {!ref && refFormFor !== a.appointment_id && (
                    <div className="mt-4 flex justify-end">
                      <Button variant="outline" onClick={() => setRefFormFor(a.appointment_id)}>
                        <ClipboardList className="size-4" /> Buat Rujukan Psikolog
                      </Button>
                    </div>
                  )}

                  {!ref && refFormFor === a.appointment_id && (
                    <div className="mt-4 space-y-3 rounded-xl border border-primary/25 bg-primary-softer p-4">
                      <p className="font-heading text-sm font-semibold text-heading">
                        Formulir Rujukan Psikolog
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`ref-type-${a.appointment_id}`}>Jenis Rujukan</Label>
                        <Select
                          value={refDraft.type}
                          onValueChange={(value) =>
                            setRefDraft((p) => ({
                              ...p,
                              type: value as 'internal_psychologist' | 'puspaga_external',
                            }))
                          }
                        >
                          <SelectTrigger id={`ref-type-${a.appointment_id}`} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="internal_psychologist">Psikolog Sekolah</SelectItem>
                            <SelectItem value="puspaga_external">Puspaga (Eksternal)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`ref-reason-${a.appointment_id}`}>Alasan Rujukan</Label>
                        <Textarea
                          id={`ref-reason-${a.appointment_id}`}
                          rows={2}
                          placeholder="Jelaskan alasan rujukan…"
                          value={refDraft.reason}
                          onChange={(e) => setRefDraft((p) => ({ ...p, reason: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" onClick={() => setRefFormFor(null)}>
                          Batal
                        </Button>
                        <Button disabled={submittingRef} onClick={() => submitReferral(a.appointment_id)}>
                          <Send className="size-4" />
                          {submittingRef ? 'Mengirim…' : 'Kirim Rujukan'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {ref && (
                    <div className="mt-4 space-y-2.5 rounded-xl border border-border bg-background p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-2 font-heading text-sm font-semibold text-heading">
                          <IconBox tone="purple" size="sm">
                            <ClipboardList className="size-4" />
                          </IconBox>
                          Rujukan: {refTypeLabel(ref.referral_type)}
                        </p>
                        <StatusBadge
                          tone={severityTone(ref.status)}
                          label={REF_STATUS_LABEL[ref.status] ?? ref.status}
                        />
                      </div>
                      <p className="text-sm leading-relaxed text-secondary-text">{ref.reason}</p>

                      {ref.status === 'rejected' && ref.leader_note && (
                        <p className="inline-flex items-start gap-2 text-xs text-destructive">
                          <XCircle className="mt-0.5 size-3.5 shrink-0" />
                          Ditolak: {ref.leader_note}
                        </p>
                      )}

                      {ref.status === 'approved' && ref.referral_type === 'internal_psychologist' && (
                        <p className="inline-flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-secondary-text">
                          <FileCheck2 className="size-3.5 shrink-0 text-success" />
                          Disetujui — janji temu tampil di dashboard psikolog.
                        </p>
                      )}

                      {ref.status === 'approved' && ref.referral_type === 'puspaga_external' && (
                        <div className="space-y-2 border-t border-border pt-3">
                          <Label htmlFor={`ext-${ref.referral_id}`}>
                            <ExternalLink className="size-3.5" />
                            Hasil Konsultasi Puspaga
                          </Label>
                          <Textarea
                            id={`ext-${ref.referral_id}`}
                            rows={2}
                            placeholder="Isi hasil konsultasi eksternal…"
                            value={externalResult[ref.referral_id] ?? ''}
                            onChange={(e) =>
                              setExternalResult((p) => ({ ...p, [ref.referral_id]: e.target.value }))
                            }
                          />
                          <div className="flex justify-end">
                            <Button
                              disabled={savingExtId === ref.referral_id}
                              onClick={() => saveExternal(ref.referral_id)}
                            >
                              <Save className="size-4" />
                              {savingExtId === ref.referral_id ? 'Menyimpan…' : 'Simpan Hasil'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}