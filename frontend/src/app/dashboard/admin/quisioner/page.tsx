'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

interface Question {
  question_id: string;
  tenant_id: string;
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

export default function QuisionerAdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, Answer[]>>({});

  const [form, setForm] = useState({ question_text: '', question_type: 'multiple_choice' as Question['question_type'], is_required: true, order_index: 0 });
  const [answerForm, setAnswerForm] = useState<Record<string, { answer_text: string; score: string }>>({});

  const [target, setTarget] = useState<'student' | 'staff'>('student');
  const [slug, setSlug] = useState('');
  const [targetLoading, setTargetLoading] = useState(true);

  const fetchQuestions = async () => {
    setLoading(true);
    const res = await apiClient<Question[]>('/quisioner/questions');
    if (res.success && res.data) setQuestions(res.data);
    setLoading(false);
  };

  const fetchThreshold = async () => {
    setThresholdLoading(true);
    const res = await apiClient<{ threshold: number }>('/quisioner/threshold');
    if (res.success && res.data) setThreshold(res.data.threshold);
    setThresholdLoading(false);
  };

  const fetchSettings = async () => {
    setTargetLoading(true);
    const res = await apiClient<{ target: 'student' | 'staff' }>('/quisioner/settings');
    if (res.success && res.data) setTarget(res.data.target);
    setTargetLoading(false);
  };

  const fetchSlug = async () => {
    const res = await apiClient<{ slug: string }>('/quisioner/tenant-slug');
    if (res.success && res.data) setSlug(res.data.slug);
  };

  const handleSaveTarget = async (value: 'student' | 'staff') => {
    setTarget(value);
    const res = await apiClient<{ target: 'student' | 'staff' }>('/quisioner/settings', {
      method: 'PATCH',
      body: { target: value },
    });
    if (res.success) {
      toast.success('Penggunaan quisioner diperbarui');
    } else {
      toast.error(res.error ?? 'Gagal menyimpan');
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchThreshold();
    fetchSettings();
    fetchSlug();
  }, []);

  const fetchAnswers = async (questionId: string) => {
    const res = await apiClient<Answer[]>(`/quisioner/questions/${questionId}/answers`);
    if (res.success && res.data) {
      setAnswersMap(prev => ({ ...prev, [questionId]: res.data! }));
    }
  };

  const toggleExpand = async (questionId: string) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null);
    } else {
      setExpandedQuestion(questionId);
      if (!answersMap[questionId]) {
        await fetchAnswers(questionId);
      }
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiClient<Question>('/quisioner/questions', { method: 'POST', body: form });
    if (res.success && res.data) {
      toast.success('Pertanyaan ditambahkan');
      setForm({ question_text: '', question_type: 'multiple_choice', is_required: true, order_index: 0 });
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menambahkan pertanyaan');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    const res = await apiClient(`/quisioner/questions/${id}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Pertanyaan dihapus');
      setExpandedQuestion(null);
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menghapus');
    }
  };

  const handleCreateAnswer = async (questionId: string) => {
    const af = answerForm[questionId];
    if (!af || !af.answer_text.trim()) {
      toast.error('Isi teks jawaban');
      return;
    }
    const score = Number(af.score);
    if (Number.isNaN(score) || score < 0) {
      toast.error('Isi poin/nilai yang valid');
      return;
    }
    const res = await apiClient<Answer>(`/quisioner/questions/${questionId}/answers`, {
      method: 'POST',
      body: { answer_text: af.answer_text.trim(), score },
    });
    if (res.success && res.data) {
      toast.success('Jawaban ditambahkan');
      setAnswerForm(prev => ({ ...prev, [questionId]: { answer_text: '', score: '' } }));
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal menambahkan jawaban');
    }
  };

  const handleUpdateAnswer = async (answerId: string, questionId: string, data: { answer_text?: string; score?: number }) => {
    const res = await apiClient<Answer>(`/quisioner/answers/${answerId}`, { method: 'PATCH', body: data });
    if (res.success && res.data) {
      toast.success('Jawaban diperbarui');
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal memperbarui jawaban');
    }
  };

  const handleDeleteAnswer = async (answerId: string, questionId: string) => {
    const res = await apiClient(`/quisioner/answers/${answerId}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Jawaban dihapus');
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal menghapus jawaban');
    }
  };

  const handleSaveThreshold = async () => {
    if (threshold === null) return;
    const res = await apiClient<{ threshold: number }>('/quisioner/threshold', { method: 'PATCH', body: { threshold } });
    if (res.success) {
      toast.success('Nilai ambang disimpan');
    } else {
      toast.error(res.error ?? 'Gagal menyimpan nilai ambang');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Kelola Quisioner</h1>
        <p className="text-muted-foreground">Tambah, edit, dan hapus pertanyaan quisioner dinamis.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nilai Ambang Rekomendasi</CardTitle>
          <CardDescription>Nilai total minimal untuk merekomendasikan bantuan profesional (Psikolog).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              className="w-32"
              value={threshold ?? ''}
              onChange={e => setThreshold(Number(e.target.value))}
              disabled={thresholdLoading}
            />
            <Button onClick={handleSaveThreshold} disabled={thresholdLoading || threshold === null}>Simpan Threshold</Button>
          </div>
          {threshold !== null && (
            <p className="text-xs text-muted-foreground mt-2">Skor &ge; {threshold} = Rekomendasi <strong>Professional</strong>. Di bawah itu = <strong>Internal</strong>.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penggunaan &amp; QR Code Quisioner</CardTitle>
          <CardDescription>
            Pilih sasaran quisioner. Mode &quot;Staff&quot; mengaktifkan laman quisioner untuk karyawan (scan QR di bawah).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="qtarget">Sasaran Quisioner</Label>
            <Select
              value={target}
              disabled={targetLoading}
              onValueChange={(v) => handleSaveTarget((v ?? 'student') as 'student' | 'staff')}
            >
              <SelectTrigger id="qtarget" className="w-56">
                <SelectValue placeholder="Pilih sasaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Siswa (Alur Kasus)</SelectItem>
                <SelectItem value="staff">Staff (Laman Quisioner)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {target === 'staff' && slug && (
            <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Scan QR ini untuk membuka laman quisioner staff:</p>
              <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/quisioner/staff?t=${slug}`} size={180} />
              <div className="flex items-center gap-2">
                <code className="text-xs break-all rounded bg-muted px-2 py-1">{typeof window !== 'undefined' ? window.location.origin : ''}/quisioner/staff?t={slug}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/quisioner/staff?t=${slug}`);
                    toast.success('Link disalin');
                  }}
                >
                  Salin Link
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tambah Pertanyaan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input className="border rounded p-2 col-span-2" placeholder="Teks pertanyaan" value={form.question_text} onChange={e => setForm({ ...form, question_text: e.target.value })} required />
              <select className="border rounded p-2" value={form.question_type} onChange={e => setForm({ ...form, question_type: e.target.value as Question['question_type'] })}>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="checkbox">Checkbox</option>
                <option value="text">Text</option>
                <option value="rating">Rating</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_required} onChange={e => setForm({ ...form, is_required: e.target.checked })} />
                Wajib diisi
              </label>
              <input type="number" className="border rounded p-2 w-24" placeholder="Urutan" value={form.order_index} onChange={e => setForm({ ...form, order_index: Number(e.target.value) })} />
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pertanyaan</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : (
            <div className="space-y-3">
              {questions.map(q => (
                <div key={q.question_id} className="border rounded">
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{q.question_text}</p>
                      <p className="text-xs text-muted-foreground">{q.question_type} {q.is_required ? '• Wajib' : ''} • Urutan {q.order_index}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleExpand(q.question_id)}>
                        {expandedQuestion === q.question_id ? 'Sembunyikan' : 'Jawaban'}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteQuestion(q.question_id)}>Hapus</Button>
                    </div>
                  </div>

                  {expandedQuestion === q.question_id && (
                    <div className="border-t p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Jawaban & Poin</p>
                      <div className="space-y-2">
                        {(answersMap[q.question_id] ?? []).map(a => (
                          <div key={a.answer_id} className="flex items-center gap-2">
                            <Input
                              className="flex-1"
                              value={a.answer_text}
                              onChange={e => handleUpdateAnswer(a.answer_id, q.question_id, { answer_text: e.target.value })}
                            />
                            <Input
                              type="number"
                              className="w-20"
                              value={a.score}
                              onChange={e => handleUpdateAnswer(a.answer_id, q.question_id, { score: Number(e.target.value) })}
                            />
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteAnswer(a.answer_id, q.question_id)}>Hapus</Button>
                          </div>
                        ))}
                        {(answersMap[q.question_id] ?? []).length === 0 && (
                          <p className="text-xs text-muted-foreground">Belum ada jawaban.</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          className="flex-1"
                          placeholder="Teks jawaban baru"
                          value={answerForm[q.question_id]?.answer_text ?? ''}
                          onChange={e => setAnswerForm(prev => ({ ...prev, [q.question_id]: { ...prev[q.question_id], answer_text: e.target.value } }))}
                        />
                        <Input
                          type="number"
                          className="w-20"
                          placeholder="Poin"
                          value={answerForm[q.question_id]?.score ?? ''}
                          onChange={e => setAnswerForm(prev => ({ ...prev, [q.question_id]: { ...prev[q.question_id], score: e.target.value } }))}
                        />
                        <Button size="sm" onClick={() => handleCreateAnswer(q.question_id)}>Tambah Jawaban</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {questions.length === 0 && <p className="text-sm text-muted-foreground">Belum ada pertanyaan.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
