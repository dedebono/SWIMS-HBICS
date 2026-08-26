'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  question_list_id: string | null;
}

interface Answer {
  answer_id: string;
  question_id: string;
  answer_text: string;
  score: number;
}

interface QuestionList {
  question_list_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  targets: string[];
  is_active: boolean;
}

type ListTarget = 'staff' | 'appointment_student' | 'appointment_case';

const TARGET_OPTIONS: { value: ListTarget; label: string }[] = [
  { value: 'staff', label: 'Staff (Quisioner Karyawan)' },
  { value: 'appointment_student', label: 'Janji Temu · Siswa' },
  { value: 'appointment_case', label: 'Janji Temu · Kasus' },
];

const TARGET_LABEL: Record<string, string> = {
  staff: 'Staff',
  appointment_student: 'Janji Temu · Siswa',
  appointment_case: 'Janji Temu · Kasus',
};

export default function QuisionerAdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, Answer[]>>({});

  const [form, setForm] = useState({
    question_text: '',
    question_type: 'multiple_choice' as Question['question_type'],
    is_required: true,
    order_index: 0,
    question_list_id: '',
  });
  const [answerForm, setAnswerForm] = useState<Record<string, { answer_text: string; score: string }>>({});

  const [target, setTarget] = useState<'student' | 'staff'>('student');
  const [slug, setSlug] = useState('');
  const [targetLoading, setTargetLoading] = useState(true);

  // ── Daftar Pertanyaan (question lists) ─────────────────────────────────────
  const [lists, setLists] = useState<QuestionList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [showListForm, setShowListForm] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listForm, setListForm] = useState<{
    name: string;
    description: string;
    targets: Record<ListTarget, boolean>;
    is_active: boolean;
  }>({
    name: '',
    description: '',
    targets: { staff: false, appointment_student: false, appointment_case: false },
    is_active: true,
  });

  const fetchQuestions = async () => {
    setLoading(true);
    const res = await apiClient<Question[]>('/quisioner/questions');
    if (res.success && res.data) setQuestions(res.data);
    setLoading(false);
  };

  const fetchLists = async () => {
    setListsLoading(true);
    const res = await apiClient<QuestionList[]>('/quisioner/lists');
    if (res.success && res.data) {
      setLists(res.data);
      setForm((f) => (f.question_list_id ? f : { ...f, question_list_id: res.data![0]?.question_list_id ?? '' }));
    }
    setListsLoading(false);
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
    fetchLists();
    fetchThreshold();
    fetchSettings();
    fetchSlug();
  }, []);

  const fetchAnswers = async (questionId: string) => {
    const res = await apiClient<Answer[]>(`/quisioner/questions/${questionId}/answers`);
    if (res.success && res.data) {
      setAnswersMap((prev) => ({ ...prev, [questionId]: res.data! }));
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
    const res = await apiClient<Question>('/quisioner/questions', {
      method: 'POST',
      body: { ...form, question_list_id: form.question_list_id || null },
    });
    if (res.success && res.data) {
      toast.success('Pertanyaan ditambahkan');
      setForm({
        question_text: '',
        question_type: 'multiple_choice',
        is_required: true,
        order_index: 0,
        question_list_id: lists[0]?.question_list_id ?? '',
      });
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

  const handleReassignQuestion = async (questionId: string, listId: string) => {
    const res = await apiClient<Question>(`/quisioner/questions/${questionId}`, {
      method: 'PATCH',
      body: { question_list_id: listId || null },
    });
    if (res.success) {
      toast.success('Pertanyaan dipindah ke daftar');
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal memindahkan pertanyaan');
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
      setAnswerForm((prev) => ({ ...prev, [questionId]: { answer_text: '', score: '' } }));
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

  // ── List (Daftar Pertanyaan) handlers ──────────────────────────────────────
  const toggleTarget = (t: ListTarget) => {
    setListForm((prev) => ({ ...prev, targets: { ...prev.targets, [t]: !prev.targets[t] } }));
  };

  const startEditList = (l: QuestionList) => {
    setEditingListId(l.question_list_id);
    setListForm({
      name: l.name,
      description: l.description ?? '',
      targets: {
        staff: l.targets.includes('staff'),
        appointment_student: l.targets.includes('appointment_student'),
        appointment_case: l.targets.includes('appointment_case'),
      },
      is_active: l.is_active,
    });
    setShowListForm(true);
  };

  const cancelEditList = () => {
    setEditingListId(null);
    setShowListForm(false);
    setListForm({ name: '', description: '', targets: { staff: false, appointment_student: false, appointment_case: false }, is_active: true });
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    const targets = TARGET_OPTIONS.filter((t) => listForm.targets[t.value]).map((t) => t.value);
    const body = {
      name: listForm.name,
      description: listForm.description,
      targets,
      is_active: listForm.is_active,
    };
    const res = editingListId
      ? await apiClient(`/quisioner/lists/${editingListId}`, { method: 'PATCH', body })
      : await apiClient('/quisioner/lists', { method: 'POST', body });
    if (res.success) {
      toast.success(editingListId ? 'Daftar diperbarui' : 'Daftar dibuat');
      cancelEditList();
      fetchLists();
    } else {
      toast.error(res.error ?? 'Gagal menyimpan daftar');
    }
  };

  const handleDeleteList = async (id: string) => {
    const res = await apiClient(`/quisioner/lists/${id}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Daftar dihapus');
      fetchLists();
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menghapus daftar');
    }
  };

  const listName = (id: string | null) => lists.find((l) => l.question_list_id === id)?.name ?? '—';
  const countByList = questions.reduce<Record<string, number>>((acc, q) => {
    if (q.question_list_id) acc[q.question_list_id] = (acc[q.question_list_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Kelola Quisioner</h1>
        <p className="text-muted-foreground">Tambah, edit, dan kelompokkan pertanyaan quisioner dinamis.</p>
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
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={thresholdLoading}
            />
            <Button onClick={handleSaveThreshold} disabled={thresholdLoading || threshold === null}>
              Simpan Threshold
            </Button>
          </div>
          {threshold !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              Skor &ge; {threshold} = Rekomendasi <strong>Professional</strong>. Di bawah itu = <strong>Internal</strong>.
            </p>
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
                <code className="text-xs break-all rounded bg-muted px-2 py-1">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/quisioner/staff?t={slug}
                </code>
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

      {/* ── DAFTAR PERTANYAAN (question lists) ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Daftar Pertanyaan</CardTitle>
              <CardDescription>
                Kelompokkan pertanyaan menjadi daftar, lalu assign ke <strong>Staff</strong> atau{' '}
                <strong>Janji Temu (Siswa / Kasus)</strong>. Daftar yang aktif dipakai oleh flow terkait.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (editingListId) cancelEditList();
                else setShowListForm((v) => !v);
              }}
            >
              {showListForm ? 'Tutup' : 'Buat Daftar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showListForm && (
            <form onSubmit={handleSaveList} className="space-y-3 rounded-lg border p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nama Daftar</Label>
                  <Input
                    value={listForm.name}
                    onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                    placeholder="cth. Skrining Awal"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Deskripsi</Label>
                  <Input
                    value={listForm.description}
                    onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                    placeholder="Opsional"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Assign ke:</Label>
                <div className="flex flex-wrap gap-4">
                  {TARGET_OPTIONS.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={listForm.targets[t.value]} onChange={() => toggleTarget(t.value)} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={listForm.is_active}
                  onChange={(e) => setListForm({ ...listForm, is_active: e.target.checked })}
                />
                Aktif (dipakai oleh flow yang di-assign)
              </label>
              <div className="flex gap-2">
                <Button type="submit">{editingListId ? 'Simpan Perubahan' : 'Buat Daftar'}</Button>
                {editingListId && (
                  <Button type="button" variant="outline" onClick={cancelEditList}>
                    Batal
                  </Button>
                )}
              </div>
            </form>
          )}

          {listsLoading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : (
            <div className="space-y-3">
              {lists.map((l) => (
                <div key={l.question_list_id} className="border rounded p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{l.name}</p>
                        {l.is_active && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] hover:bg-green-100">Aktif</Badge>
                        )}
                      </div>
                      {l.description && <p className="text-xs text-muted-foreground">{l.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {l.targets.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {TARGET_LABEL[t] ?? t}
                          </Badge>
                        ))}
                        {l.targets.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">Belum di-assign</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {countByList[l.question_list_id] ?? 0} pertanyaan
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => startEditList(l)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteList(l.question_list_id)}>
                        Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {lists.length === 0 && <p className="text-sm text-muted-foreground">Belum ada daftar pertanyaan.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tambah Pertanyaan</CardTitle>
          <CardDescription>Pilih daftar tujuan agar pertanyaan masuk ke grup yang tepat.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                className="border rounded p-2 col-span-2"
                placeholder="Teks pertanyaan"
                value={form.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                required
              />
              <select
                className="border rounded p-2"
                value={form.question_type}
                onChange={(e) => setForm({ ...form, question_type: e.target.value as Question['question_type'] })}
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="checkbox">Checkbox</option>
                <option value="text">Text</option>
                <option value="rating">Rating</option>
              </select>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                />
                Wajib diisi
              </label>
              <input
                type="number"
                className="border rounded p-2 w-24"
                placeholder="Urutan"
                value={form.order_index}
                onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="qlist" className="text-sm">
                  Daftar
                </Label>
                <Select
                  value={form.question_list_id}
                  onValueChange={(v) => setForm({ ...form, question_list_id: v ?? '' })}
                >
                  <SelectTrigger id="qlist" className="w-56">
                    <SelectValue placeholder="Pilih daftar" />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.question_list_id} value={l.question_list_id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Pertanyaan</CardTitle>
          <CardDescription>
            Semua pertanyaan. Pindahkan antar daftar lewat dropdown &quot;Daftar&quot; di tiap pertanyaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.question_id} className="border rounded">
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{q.question_text}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.question_type} {q.is_required ? '• Wajib' : ''} • Urutan {q.order_index} • Daftar:{' '}
                        <span className="font-medium">{listName(q.question_list_id)}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => toggleExpand(q.question_id)}>
                        {expandedQuestion === q.question_id ? 'Sembunyikan' : 'Jawaban'}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteQuestion(q.question_id)}>
                        Hapus
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-3 pb-3">
                    <Label className="text-xs">Pindah ke daftar:</Label>
                    <Select value={q.question_list_id ?? ''} onValueChange={(v) => handleReassignQuestion(q.question_id, v ?? '')}>
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Pilih daftar" />
                      </SelectTrigger>
                      <SelectContent>
                        {lists.map((l) => (
                          <SelectItem key={l.question_list_id} value={l.question_list_id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {expandedQuestion === q.question_id && (
                    <div className="border-t p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Jawaban & Poin</p>
                      <div className="space-y-2">
                        {(answersMap[q.question_id] ?? []).map((a) => (
                          <div key={a.answer_id} className="flex items-center gap-2">
                            <Input
                              className="flex-1"
                              value={a.answer_text}
                              onChange={(e) => handleUpdateAnswer(a.answer_id, q.question_id, { answer_text: e.target.value })}
                            />
                            <Input
                              type="number"
                              className="w-20"
                              value={a.score}
                              onChange={(e) => handleUpdateAnswer(a.answer_id, q.question_id, { score: Number(e.target.value) })}
                            />
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteAnswer(a.answer_id, q.question_id)}>
                              Hapus
                            </Button>
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
                          onChange={(e) =>
                            setAnswerForm((prev) => ({ ...prev, [q.question_id]: { ...prev[q.question_id], answer_text: e.target.value } }))
                          }
                        />
                        <Input
                          type="number"
                          className="w-20"
                          placeholder="Poin"
                          value={answerForm[q.question_id]?.score ?? ''}
                          onChange={(e) =>
                            setAnswerForm((prev) => ({ ...prev, [q.question_id]: { ...prev[q.question_id], score: e.target.value } }))
                          }
                        />
                        <Button size="sm" onClick={() => handleCreateAnswer(q.question_id)}>
                          Tambah Jawaban
                        </Button>
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
