'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CalendarClock, Send, FileText } from 'lucide-react';

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

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient<Question[]>('/quisioner/questions'),
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

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isTeacher) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Fitur Quisioner & Janji Temu hanya tersedia untuk akun Guru.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            Quisioner Bantuan Profesional
          </CardTitle>
          <CardDescription>
            Isi quisioner ini untuk menilai apakah siswa membutuhkan bantuan profesional (Psikolog).
            Notifikasi ke orang tua akan dikirimkan otomatis setelah pengiriman.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : submitted || submission ? (
            <div className="space-y-2">
              <Badge variant="outline" className="text-[11px]">Sudah dikirim</Badge>
              <p className="text-xs text-muted-foreground">
                {submission?.submitted_at ? `Dikirim pada ${format(new Date(submission.submitted_at), 'dd MMM yyyy HH:mm', { locale: id })}` : ''}
              </p>
              {submission?.recommendation && (
                <p className="text-sm">Rekomendasi sistem: <span className="font-medium capitalize">{submission.recommendation}</span></p>
              )}
              {submission?.score !== undefined && (
                <p className="text-sm">Total skor: <span className="font-medium">{submission.score}</span> (ambang: {threshold})</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitCounseling} className="space-y-4">
              {questions.length === 0 && (
                <p className="text-sm text-muted-foreground">Belum ada pertanyaan quisioner. Hubungi Admin IT.</p>
              )}
              {questions.map((q, idx) => {
                const opts = answersMap[q.question_id] ?? [];
                const selected = answers[q.question_id];
                return (
                  <div key={q.question_id} className="space-y-2">
                    <Label className="text-sm">
                      {idx + 1}. {q.question_text} {q.is_required ? <span className="text-red-500">*</span> : ''}
                    </Label>
                    {q.question_type === 'multiple_choice' && (
                      <div className="flex flex-col gap-2">
                        {opts.map(o => {
                          const checked = selected === o.answer_text;
                          return (
                            <label
                              key={o.answer_id}
                              className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary' : 'bg-background hover:bg-muted/50'}`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={checked}
                                onChange={() => handleAnswerChange(q.question_id, o.answer_text)}
                              />
                              <span className="text-sm flex-1">{o.answer_text}</span>
                              <span className="text-xs text-muted-foreground">{o.score} poin</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {q.question_type === 'rating' && (
                      <div className="flex gap-2">
                        {opts.sort((a,b) => a.score - b.score).map(o => (
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
                        placeholder="Tulis jawaban..."
                        value={selected ?? ''}
                        onChange={e => handleAnswerChange(q.question_id, e.target.value)}
                        required={q.is_required}
                      />
                    )}
                  </div>
                );
              })}

              {questions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm">
                    Total skor: <span className="font-medium">{totalScore}</span> / Ambang: <span className="font-medium">{threshold}</span>
                  </div>
                  <div className="text-sm">
                    Rekomendasi sementara: <span className={`font-medium ${recommendation === 'professional' ? 'text-red-600' : 'text-green-600'}`}>{recommendation === 'professional' ? 'Bantuan Profesional (Psikolog)' : 'Internal'}</span>
                  </div>
                  <Button type="submit" disabled={submitting} className="gap-2">
                    <Send className="w-4 h-4" />
                    {submitting ? 'Mengirim...' : 'Kirim Quisioner & Notifikasi Orang Tua'}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Appointments */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-500" />
            Janji Temu Terkait
          </CardTitle>
          <CardDescription>Status janji temu konseling untuk siswa ini.</CardDescription>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada janji temu.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.appointment_id} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{a.type === 'student' ? 'Siswa' : 'Personal'}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.scheduled_at ? format(new Date(a.scheduled_at), 'dd MMM yyyy HH:mm', { locale: id }) : 'Belum dijadwalkan'}
                    </p>
                    {a.location && <p className="text-xs text-muted-foreground">{a.location}</p>}
                    <Badge className={`mt-1 text-[10px] ${statusColor(a.status)}`}>{a.status}</Badge>
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground max-w-[200px] line-clamp-2">{a.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
