'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

  const isTeacher = user?.role === 'TEACHER';
  const [quisionerTarget, setQuisionerTarget] = useState<string>('student');

  useEffect(() => {
    apiClient<{ target: string }>('/quisioner/settings').then(r => {
      if (r.success && r.data) setQuisionerTarget(r.data.target);
    });
  }, []);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient<Question[]>('/quisioner/questions?context=appointment'),
      apiClient<any>(`/cases/${caseId}/counseling`),
      apiClient<Appointment[]>(`/appointments?type=student&student_id=${studentId}&created_for=${studentId}`),
      apiClient<any>(`/students/${studentId}`),
      apiClient<{ threshold: number }>('/quisioner/threshold'),
    ]).then(([qRes, counselingRes, apptRes, studentRes, threshRes]) => {
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
      if (apptRes.success && apptRes.data) setAppointments(apptRes.data);
      if (studentRes.success && studentRes.data) setStudentData(studentRes.data);
      if (threshRes.success && threshRes.data) setThreshold(threshRes.data.threshold);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [caseId, studentId, isTeacher]);

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
      } else {
        toast.error(res.error ?? 'Gagal mengirim kuesioner');
      }
    } catch {
      toast.error('Gagal mengirim kuesioner');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isTeacher) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Lock />}
            title="Hanya untuk akun Guru"
            description="Fitur Kuesioner & Janji Temu hanya dapat diakses oleh akun dengan peran Guru."
          />
        </CardContent>
      </Card>
    );
  }

  if (quisionerTarget && quisionerTarget !== 'student') {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<ShieldAlert />}
            title="Kuesioner Siswa Sedang Nonaktif"
            description="Admin IT saat ini mengatur kuesioner untuk staf, sehingga kuesioner siswa dinonaktifkan sementara."
          />
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="blue">
              <FileText />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Kuesioner Bantuan Profesional</CardTitle>
              <CardDescription>
                Isi kuesioner ini untuk menilai apakah siswa membutuhkan bantuan profesional (psikolog).
                Notifikasi ke orang tua dikirimkan otomatis setelah kuesioner dikirim.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Memuat kuesioner…</p>
            </div>
          ) : submitted || submission ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge tone="success" label="Sudah dikirim" />
                {submission?.submitted_at ? (
                  <span className="text-xs text-muted-foreground">
                    Dikirim pada {formatSchedule(submission.submitted_at)}
                  </span>
                ) : null}
              </div>

              {submission?.recommendation ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="card-label mb-1.5">Rekomendasi sistem</p>
                  <StatusBadge
                    tone={submission.recommendation === 'professional' ? 'danger' : 'success'}
                    label={
                      submission.recommendation === 'professional'
                        ? 'Bantuan Profesional (Psikolog)'
                        : 'Penanganan Internal'
                    }
                  />
                </div>
              ) : null}

              {submission?.score !== undefined ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="card-label mb-1.5">Total skor</p>
                  <p className="text-sm text-secondary-text">
                    Skor <span className="font-semibold text-heading">{submission.score}</span> dari ambang{' '}
                    <span className="font-semibold text-heading">{threshold}</span>.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <form onSubmit={handleSubmitCounseling} className="space-y-6">
              {questions.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title="Belum ada pertanyaan"
                  description="Belum ada pertanyaan kuesioner yang tersedia. Silakan hubungi Admin IT."
                />
              ) : (
                questions.map((q, idx) => {
                  const opts = answersMap[q.question_id] ?? [];
                  const selected = answers[q.question_id];
                  return (
                    <div key={q.question_id} className="space-y-2.5">
                      <Label>
                        {idx + 1}. {q.question_text}{' '}
                        {q.is_required ? <span className="text-danger">*</span> : null}
                      </Label>

                      {q.question_type === 'multiple_choice' && (
                        <div className="grid gap-2">
                          {opts.map(o => {
                            const checked = selected === o.answer_text;
                            return (
                              <label
                                key={o.answer_id}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                                  checked
                                    ? 'border-primary bg-primary-softer'
                                    : 'border-border bg-card hover:bg-muted/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 shrink-0 accent-primary"
                                  checked={checked}
                                  onChange={() => handleAnswerChange(q.question_id, o.answer_text)}
                                />
                                <span className="flex-1 text-sm text-secondary-text">{o.answer_text}</span>
                                <StatusBadge tone="neutral" dot={false} label={`${o.score} poin`} />
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.question_type === 'rating' && (
                        <div className="flex flex-wrap gap-2">
                          {opts.sort((a, b) => a.score - b.score).map(o => (
                            <Button
                              key={o.answer_id}
                              type="button"
                              variant={selected === o.answer_text ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleAnswerChange(q.question_id, o.answer_text)}
                            >
                              {o.answer_text} ({o.score})
                            </Button>
                          ))}
                        </div>
                      )}

                      {q.question_type === 'text' && (
                        <Textarea
                          placeholder="Tulis jawaban di sini…"
                          value={selected ?? ''}
                          onChange={e => handleAnswerChange(q.question_id, e.target.value)}
                          required={q.is_required}
                        />
                      )}
                    </div>
                  );
                })
              )}

              {questions.length > 0 && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="card-label mb-1">Total skor</p>
                      <p className="text-sm text-secondary-text">
                        <span className="font-semibold text-heading">{totalScore}</span> / ambang{' '}
                        <span className="font-semibold text-heading">{threshold}</span>
                      </p>
                    </div>
                    <div>
                      <p className="card-label mb-1">Rekomendasi sementara</p>
                      <StatusBadge
                        tone={recommendation === 'professional' ? 'danger' : 'success'}
                        label={
                          recommendation === 'professional'
                            ? 'Bantuan Profesional (Psikolog)'
                            : 'Penanganan Internal'
                        }
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {submitting ? 'Mengirim…' : 'Kirim Kuesioner & Notifikasi Orang Tua'}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── Janji Temu ── */}
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}