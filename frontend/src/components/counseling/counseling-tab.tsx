'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { id as localeId } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import {
  CalendarClock,
  Send,
  FileText,
  Info,
  Lock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { IconBox } from '@/components/ui/icon-box';
import { EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';

interface Question {
  question_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  order_index: number;
}

interface Answer {
  answer_id: string;
  question_id: string;
  answer_text: string;
  score: number;
}

interface Appointment {
  appointment_id: string;
  type: string;
  status: string;
  scheduled_at: string | null;
  location: string | null;
  notes: string | null;
  created_for: string;
}

interface CounselingTabProps {
  caseId: string;
  studentId: string;
  user: any;
}

/** Status janji temu (lowercase dari backend) → badge semantik + label Bahasa Indonesia. */
const APPOINTMENT_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  confirmed: { tone: 'success', label: 'Dikonfirmasi' },
  pending: { tone: 'warning', label: 'Menunggu' },
  cancelled: { tone: 'danger', label: 'Dibatalkan' },
  completed: { tone: 'info', label: 'Selesai' },
  awaiting_psychologist_availability: { tone: 'warning', label: 'Menunggu Jadwal' },
};

const DEFAULT_APPOINTMENT_STATUS: { tone: StatusTone; label: string } = {
  tone: 'neutral',
  label: 'Tidak Diketahui',
};

const formatSchedule = (value: string) =>
  formatInTimeZone(new Date(value), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: localeId });

export function CounselingTab({ caseId, studentId, user }: CounselingTabProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, Answer[]>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submission, setSubmission] = useState<any | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [studentData, setStudentData] = useState<any | null>(null);
  const [threshold, setThreshold] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Undangan orang tua (modal dari "Janji Temu Terkait") ──
  const [inviteFor, setInviteFor] = useState<Appointment | null>(null);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteStudentName, setInviteStudentName] = useState('');
  const [inviteSending, setInviteSending] = useState(false);

  const buildInviteTemplate = (studentName: string) =>
    `Yth. Bapak/Ibu,\n\nBerdasarkan hasil asesmen, sekolah merekomendasikan konsultasi lanjutan dengan Psikolog untuk mendukung perkembangan dan kebutuhan Ananda ${studentName || 'siswa kami'}.\n\nBapak/Ibu dapat memilih menggunakan Psikolog Rekomendasi Sekolah atau Psikolog Pribadi melalui tautan yang terlampir di bawah pesan ini.\n\nHormat kami,\nSekolah`;

  const openInvite = async (a: Appointment) => {
    setInviteFor(a);
    setInvitePhone('');
    setInviteMessage('');
    const res = await apiClient<{ student_name: string; parent_phone: string | null }>(
      `/appointments/${a.appointment_id}/referral-context`,
    ).catch(() => null);
    if (res?.success && res.data) {
      setInviteStudentName(res.data.student_name);
      setInvitePhone(res.data.parent_phone ?? '');
      setInviteMessage(buildInviteTemplate(res.data.student_name));
    } else {
      toast.error('Gagal memuat data undangan.');
      setInviteFor(null);
    }
  };

  const sendInvite = async () => {
    if (!inviteFor || inviteSending) return;
    if (!invitePhone.trim()) { toast.error('Nomor WhatsApp orang tua wajib diisi.'); return; }
    if (!inviteMessage.trim()) { toast.error('Pesan undangan wajib diisi.'); return; }
    setInviteSending(true);
    try {
      const res = await apiClient<{ referralLink: string }>(
        `/appointments/${inviteFor.appointment_id}/referral`,
        { method: 'POST', body: { parent_phone: invitePhone.trim(), message: inviteMessage } },
      );
      if (res.success) {
        toast.success('Undangan terkirim ke WhatsApp orang tua.');
        setInviteFor(null);
        loadAppointments();
      } else {
        toast.error(res.error ?? 'Gagal mengirim undangan.');
      }
    } finally {
      setInviteSending(false);
    }
  };

  const isTeacher = user?.role === 'TEACHER';

  /**
   * Load the student's appointments ("Janji Temu Terkait").
   *
   * Split out of the mount effect so the list refreshes right after a
   * successful submission — the appointment row is created server-side by
   * submitCaseCounseling, so without this the teacher submits the questionnaire
   * and still sees an empty list until a manual page reload.
   */
  const loadAppointments = useCallback(async () => {
    const res = await apiClient<Appointment[]>(
      `/appointments?type=student&student_id=${studentId}`,
    ).catch(() => null);
    if (res?.success && res.data) setAppointments(res.data);
  }, [studentId]);

  useEffect(() => {
    apiClient<{ target: string }>('/quisioner/settings').then(r => {
      // We don't block the UI based on target anymore, because both Student
      // and Staff flows can run concurrently in the new combined architecture.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Counselors/admins don't fill the questionnaire but still need the
    // "Janji Temu Terkait" list (to send the parent invite).
    if (!isTeacher) {
      setLoading(false);
      loadAppointments();
      return;
    }
    setLoading(true);
    Promise.all([
      apiClient<Question[]>('/quisioner/questions?context=appointment'),
      apiClient<any>(`/cases/${caseId}/counseling`),
      loadAppointments(),
      apiClient<any>(`/students/${studentId}`),
      apiClient<{ threshold: number }>('/quisioner/threshold'),
    ]).then(([qRes, counselingRes, , studentRes, threshRes]) => {
      if (cancelled) return;
      if (qRes.success && qRes.data) {
        setQuestions(qRes.data);
        const answerPromises = qRes.data.map(q =>
          apiClient<Answer[]>(`/quisioner/questions/${q.question_id}/answers`)
            .then(r => ({ question_id: q.question_id, answers: r.success && r.data ? r.data : [] }))
            .catch(() => ({ question_id: q.question_id, answers: [] as Answer[] })),
        );
        Promise.all(answerPromises).then(results => {
          if (cancelled) return;
          const map: Record<string, Answer[]> = {};
          results.forEach(r => { map[r.question_id] = r.answers; });
          setAnswersMap(map);
        });
      }
      if (counselingRes.success && counselingRes.data) setSubmission(counselingRes.data);
      if (studentRes.success && studentRes.data) setStudentData(studentRes.data);
      if (threshRes.success && threshRes.data) setThreshold(threshRes.data.threshold);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [caseId, studentId, isTeacher, loadAppointments]);

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const totalScore = questions.reduce((sum, q) => {
    const selected = answers[q.question_id];
    const opts = answersMap[q.question_id] ?? [];
    const match = opts.find(o => String(o.answer_text) === String(selected));
    return sum + (match ? match.score : 0);
  }, 0);

  const recommendation = totalScore >= threshold ? 'professional' : 'internal';

  const handleSubmitCounseling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Catch the case the user actually hit: a required question that was never
    // rendered (wrong question list), or a lost answer. Name it here instead of
    // letting the POST come back as an opaque 400.
    const unanswered = questions.filter(
      q => q.is_required && String(answers[q.question_id] ?? '').trim() === '',
    );
    if (unanswered.length > 0) {
      toast.error(
        unanswered.length === 1
          ? `Jawab pertanyaan wajib ini dulu: ${unanswered[0].question_text}`
          : `Masih ada ${unanswered.length} pertanyaan wajib yang belum dijawab.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const payloadAnswers = questions.map(q => {
        const selected = answers[q.question_id];
        const opts = answersMap[q.question_id] ?? [];
        const match = opts.find(o => String(o.answer_text) === String(selected));
        return {
          question_id: q.question_id,
          answer_text: match ? match.answer_text : String(selected ?? ''),
          score: match ? match.score : 0,
        };
      });

      const res = await apiClient(`/cases/${caseId}/counseling`, {
        method: 'POST',
        body: {
          answers: payloadAnswers,
          submitted_by: user?.user_id,
          student_id: studentId,
          student_email: studentData?.email,
          parent_email: studentData?.parent_email,
        },
      });
      if (res.success) {
        toast.success('Kuesioner dikirim. Notifikasi ke orang tua telah dikirim.');
        setSubmitted(true);
        setSubmission(res.data ?? { submitted_at: new Date().toISOString() });
        void loadAppointments();
      } else {
        toast.error(res.error ?? 'Gagal mengirim kuesioner');
      }
    } catch {
      toast.error('Gagal mengirim kuesioner');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  // Kartu "Janji Temu Terkait" dipakai di dua jalur render (guru & non-guru).
  const appointmentsCard = (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <IconBox tone="teal">
            <CalendarClock />
          </IconBox>
          <div className="space-y-1">
            <CardTitle>Janji Temu Terkait</CardTitle>
            <CardDescription>Status janji temu konseling untuk siswa ini.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Belum ada janji temu"
            description="Tidak ada janji temu konseling yang tercatat untuk siswa ini."
          />
        ) : (
          <DataTable>
            <TableHead>
              <TableRow>
                <TableHeaderCell scope="col">Jenis</TableHeaderCell>
                <TableHeaderCell scope="col">Jadwal</TableHeaderCell>
                <TableHeaderCell scope="col">Lokasi</TableHeaderCell>
                <TableHeaderCell scope="col">Status</TableHeaderCell>
                <TableHeaderCell scope="col">Catatan</TableHeaderCell>
                <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {appointments.map(a => {
                const status = APPOINTMENT_STATUS[a.status] ?? DEFAULT_APPOINTMENT_STATUS;
                return (
                  <TableRow key={a.appointment_id} interactive>
                    <TableCell className="font-medium text-heading">
                      {a.type === 'student' ? 'Siswa' : 'Personal'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {a.scheduled_at ? formatSchedule(a.scheduled_at) : 'Belum dijadwalkan'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.location || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone} label={status.label} />
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                      {a.notes || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === 'awaiting_psychologist_availability' && (
                        <Button size="sm" variant="outline" onClick={() => openInvite(a)}>
                          <Send className="size-3.5" />
                          Undang Orang Tua
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        )}
      </CardContent>
    </Card>
  );

  const inviteModal = (
    <Dialog open={!!inviteFor} onOpenChange={(o) => { if (!o) setInviteFor(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Undang Orang Tua</DialogTitle>
          <DialogDescription>
            Pesan WhatsApp dikirim via GOWA beserta tautan pemilihan psikolog & jadwal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-phone">Nomor WhatsApp Orang Tua</Label>
            <Input
              id="invite-phone"
              value={invitePhone}
              onChange={e => setInvitePhone(e.target.value)}
              placeholder="628…"
            />
            {!invitePhone.trim() && (
              <p className="text-xs text-destructive">
                Nomor belum tersedia di data siswa — silakan isi di sini.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-msg">Template Pesan</Label>
            <Textarea
              id="invite-msg"
              rows={9}
              value={inviteMessage}
              onChange={e => setInviteMessage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Tautan rujukan ditambahkan otomatis di akhir pesan.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setInviteFor(null)} disabled={inviteSending}>
            Batal
          </Button>
          <Button onClick={sendInvite} disabled={inviteSending}>
            {inviteSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {inviteSending ? 'Mengirim…' : 'Kirim via WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!isTeacher) {
    return (
      <div className="space-y-6">
        {appointmentsCard}
        {inviteModal}
      </div>
    );
  }

  

  return (
    <div className="space-y-6">
      {/* ── Ringkasan ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jumlah Pertanyaan"
          value={questions.length}
          hint="Butir kuesioner yang harus dijawab guru"
          icon={<FileText className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Skor Saat Ini"
          value={totalScore}
          hint={`Ambang rujukan: ${threshold} poin`}
          icon={<Info className="size-5" />}
          iconTone="purple"
          progress={threshold > 0 ? Math.min(100, Math.round((totalScore / threshold) * 100)) : 0}
          progressLabel="Persentase terhadap ambang skor"
        />
        <StatCard
          label="Rekomendasi"
          value={
            <span className={recommendation === 'professional' ? 'text-danger' : 'text-success'}>
              {recommendation === 'professional' ? 'Profesional' : 'Internal'}
            </span>
          }
          hint={
            recommendation === 'professional'
              ? 'Siswa disarankan escorted bantuan psikolog'
              : 'Siswa ditangani secara internal sekolah'
          }
          icon={<Send className="size-5" />}
          iconTone={recommendation === 'professional' ? 'red' : 'green'}
        />
        <StatCard
          label="Janji Temu"
          value={appointments.length}
          hint="Janji temu konseling yang terkait dengan siswa"
          icon={<CalendarClock className="size-5" />}
          iconTone="teal"
        />
      </div>

      {/* ── Kuesioner ── */}
      {appointmentsCard}
      {inviteModal}
    </div>
  );
}