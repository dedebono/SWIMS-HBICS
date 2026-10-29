'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  Target,
  Users,
  Layers,
  ListChecks,
  QrCode,
  ClipboardCopy,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
} from 'lucide-react';

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

type ListTarget = 'appointment_student' | 'appointment_case' | 'staff';

const TARGET_OPTIONS: { value: ListTarget; label: string }[] = [
  { value: 'appointment_student', label: 'Janji Temu · Siswa' },
  { value: 'appointment_case', label: 'Janji Temu · Kasus' },
  { value: 'staff', label: 'Karyawan (Employee Counseling)' },
];

/**
 * Student counseling and personal/staff counseling are two separate products
 * with their own questionnaires. Grouping the targets in the Admin UI states
 * that explicitly — a flat checkbox row is what let the "Staff" list get
 * tagged `appointment_case` and leak into the teacher's form.
 */
const COUNSELING_DOMAINS: { value: 'student' | 'staff'; label: string; targets: typeof TARGET_OPTIONS }[] = [
  {
    value: 'student',
    label: 'Konseling Siswa — kuesioner untuk Guru di tab Janji Temu',
    targets: TARGET_OPTIONS.filter((t) => t.value !== 'staff'),
  },
  {
    value: 'staff',
    label: 'Konseling Staf/Karyawan — alur PERSONAL & QR /book/staff',
    targets: TARGET_OPTIONS.filter((t) => t.value === 'staff'),
  },
];

const TARGET_LABEL: Record<string, string> = {
  appointment_student: 'Janji Temu · Siswa',
  appointment_case: 'Janji Temu · Kasus',
  staff: 'Karyawan',
};

const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Pilihan Ganda',
  checkbox: 'Pilihan Banyak',
  text: 'Ulasan Teks',
  rating: 'Penilaian Skala',
};

const questionTypeLabel = (type: string) => QUESTION_TYPE_LABEL[type] ?? type;

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

  const [slug, setSlug] = useState('');

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
    targets: { appointment_student: false, appointment_case: false, staff: false },
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
    const res = await apiClient<{ threshold: number }>('/quisioner/settings');
    if (res.success && res.data) {
      setThreshold(res.data.threshold);
    }
    setThresholdLoading(false);
  };

  const fetchSlug = async () => {
    const res = await apiClient<{ slug: string }>('/quisioner/tenant-slug');
    if (res.success && res.data) setSlug(res.data.slug);
  };

  useEffect(() => {
    fetchQuestions();
    fetchLists();
    fetchThreshold();
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
      toast.success('Pertanyaan berhasil ditambahkan.');
      setForm({
        question_text: '',
        question_type: 'multiple_choice',
        is_required: true,
        order_index: 0,
        question_list_id: lists[0]?.question_list_id ?? '',
      });
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menambahkan pertanyaan.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    const res = await apiClient(`/quisioner/questions/${id}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Pertanyaan berhasil dihapus.');
      setExpandedQuestion(null);
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menghapus pertanyaan.');
    }
  };

  const handleReassignQuestion = async (questionId: string, listId: string) => {
    const res = await apiClient<Question>(`/quisioner/questions/${questionId}`, {
      method: 'PATCH',
      body: { question_list_id: listId || null },
    });
    if (res.success) {
      toast.success('Pertanyaan berhasil dipindahkan ke daftar lain.');
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal memindahkan pertanyaan.');
    }
  };

  const handleCreateAnswer = async (questionId: string) => {
    const af = answerForm[questionId];
    if (!af || !af.answer_text.trim()) {
      toast.error('Mohon isi teks jawaban terlebih dahulu.');
      return;
    }
    const score = Number(af.score);
    if (Number.isNaN(score) || score < 0) {
      toast.error('Mohon isi poin atau nilai yang valid.');
      return;
    }
    const res = await apiClient<Answer>(`/quisioner/questions/${questionId}/answers`, {
      method: 'POST',
      body: { answer_text: af.answer_text.trim(), score },
    });
    if (res.success && res.data) {
      toast.success('Jawaban berhasil ditambahkan.');
      setAnswerForm((prev) => ({ ...prev, [questionId]: { answer_text: '', score: '' } }));
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal menambahkan jawaban.');
    }
  };

  const handleUpdateAnswer = async (answerId: string, questionId: string, data: { answer_text?: string; score?: number }) => {
    const res = await apiClient<Answer>(`/quisioner/answers/${answerId}`, { method: 'PATCH', body: data });
    if (res.success && res.data) {
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal memperbarui jawaban.');
    }
  };

  const handleDeleteAnswer = async (answerId: string, questionId: string) => {
    const res = await apiClient(`/quisioner/answers/${answerId}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Jawaban berhasil dihapus.');
      fetchAnswers(questionId);
    } else {
      toast.error(res.error ?? 'Gagal menghapus jawaban.');
    }
  };

  const handleSaveThreshold = async () => {
    if (threshold === null) return;
    const res = await apiClient<{ threshold: number }>('/quisioner/threshold', { method: 'PATCH', body: { threshold } });
    if (res.success) {
      toast.success('Nilai ambang berhasil disimpan.');
    } else {
      toast.error(res.error ?? 'Gagal menyimpan nilai ambang.');
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
        appointment_student: l.targets.includes('appointment_student'),
        appointment_case: l.targets.includes('appointment_case'),
        staff: l.targets.includes('staff'),
      },
      is_active: l.is_active,
    });
    setShowListForm(true);
  };

  const cancelEditList = () => {
    setEditingListId(null);
    setShowListForm(false);
    setListForm({ name: '', description: '', targets: { appointment_student: false, appointment_case: false, staff: false }, is_active: true });
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
      toast.success(editingListId ? 'Daftar berhasil diperbarui.' : 'Daftar berhasil dibuat.');
      cancelEditList();
      fetchLists();
    } else {
      toast.error(res.error ?? 'Gagal menyimpan daftar.');
    }
  };

  const handleDeleteList = async (id: string) => {
    const res = await apiClient(`/quisioner/lists/${id}`, { method: 'DELETE' });
    if (res.success || res.error?.includes('204')) {
      toast.success('Daftar berhasil dihapus.');
      fetchLists();
      fetchQuestions();
    } else {
      toast.error(res.error ?? 'Gagal menghapus daftar.');
    }
  };

  const listName = (id: string | null) => lists.find((l) => l.question_list_id === id)?.name ?? 'Belum ada daftar';
  // Base UI menampilkan NILAI mentah pada <Select.Value> bila prop `items` tidak
  // diisi — akibatnya UUID mentah tampil di dalam trigger. Peta ini yang
  // membuat trigger menampilkan NAMA daftar yang sudah disetting.
  const listItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(lists.map((l) => [l.question_list_id, l.name])),
    [lists],
  );
  const countByList = questions.reduce<Record<string, number>>((acc, q) => {
    if (q.question_list_id) acc[q.question_list_id] = (acc[q.question_list_id] ?? 0) + 1;
    return acc;
  }, {});

  const copyLink = (url: string, message: string) => {
    navigator.clipboard?.writeText(url);
    toast.success(message);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const directBookingUrl = slug ? `${origin}/book/staff?t=${slug}` : '';
  const employeeUrl = slug ? `${origin}/quisioner/employee-counseling?t=${slug}` : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Kuisioner"
        description="Tambah, ubah, dan kelompokkan pertanyaan kuisioner dinamis untuk alur konseling."
      />

      {/* ── Ringkasan ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pertanyaan"
          value={questions.length}
          hint="Seluruh pertanyaan yang tersedia"
          icon={<ListChecks className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Daftar Pertanyaan"
          value={lists.length}
          hint={`${lists.filter((l) => l.is_active).length} daftar aktif`}
          icon={<Layers className="size-5" />}
          iconTone="purple"
          progress={
            lists.length > 0
              ? Math.round((lists.filter((l) => l.is_active).length / lists.length) * 100)
              : 0
          }
          progressLabel="Persentase daftar aktif"
        />
        <StatCard
          label="Nilai Ambang"
          value={threshold?.toString() ?? '-'}
          hint="Nilai minimum untuk rekomendasi profesional"
          icon={<Target className="size-5" />}
          iconTone="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Nilai Ambang ── */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <IconBox tone="green">
                <Target />
              </IconBox>
              <div className="space-y-1">
                <CardTitle>Nilai Ambang Rekomendasi</CardTitle>
                <CardDescription>
                  Nilai total minimum untuk merekomendasikan bantuan profesional (psikolog).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="threshold">Nilai ambang</Label>
                <Input
                  id="threshold"
                  type="number"
                  className="w-32"
                  value={threshold ?? ''}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  disabled={thresholdLoading}
                />
              </div>
              <Button onClick={handleSaveThreshold} disabled={thresholdLoading || threshold === null}>
                <Save className="size-4" />
                Simpan Nilai Ambang
              </Button>
            </div>
            {threshold !== null ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-4 py-3">
                <span className="text-xs text-secondary-text">
                  Skor ≥ {threshold} menghasilkan rekomendasi
                </span>
                <StatusBadge tone="purple" label="Profesional" />
                <span className="text-xs text-secondary-text">di bawahnya</span>
                <StatusBadge tone="info" label="Internal" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── QR Code ── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="purple">
              <QrCode />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Kode QR Pemesanan Konseling</CardTitle>
              <CardDescription>
                Guru atau staf memindai kode ini untuk langsung membuat janji temu dengan konselor tanpa perlu masuk.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <QrPanel
            title="Pemesanan Langsung"
            description="Staf memasukkan NIK lalu langsung memilih konselor sesuai genders."
            url={directBookingUrl}
            highlighted={false}
            onCopy={() => copyLink(directBookingUrl, 'Tautan pemesanan disalin.')}
          />
          <QrPanel
            title="Kuisioner Konseling Karyawan"
            description="Staf mengisi kuisioner, kemudian konselor atau psikolog menindaklanjuti."
            url={employeeUrl}
            highlighted
            onCopy={() => copyLink(employeeUrl, 'Tautan kuisioner disalin.')}
          />
        </CardContent>
      </Card>

      {/* ── DAFTAR PERTANYAAN (question lists) ─────────────────────────────── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Daftar Pertanyaan</CardTitle>
              <CardDescription>
                Kelompokkan pertanyaan menjadi daftar, lalu tetapkan ke Janji Temu (Siswa atau
                Kasus). Daftar aktif dipakai oleh alur terkait.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (editingListId) cancelEditList();
                else setShowListForm((v) => !v);
              }}
            >
              <Plus className="size-4" />
              {showListForm ? 'Tutup Formulir' : 'Buat Daftar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showListForm ? (
            <form onSubmit={handleSaveList} className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="list-name">Nama Daftar</Label>
                  <Input
                    id="list-name"
                    value={listForm.name}
                    onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                    placeholder="cth. Skrining Awal"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="list-description">Deskripsi</Label>
                  <Input
                    id="list-description"
                    value={listForm.description}
                    onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                    placeholder="Opsional"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="list-target">Tetapkan ke domain konseling:</Label>
                {/* Two SEPARATE counseling products. Splitting them here is the
                    policy: a staff questionnaire tagged as a student target used
                    to be served to teachers, whose form then demanded an answer
                    to a question they could not see. */}
                {COUNSELING_DOMAINS.map((d) => (
                  <div
                    key={d.value}
                    className="space-y-2 rounded-xl border border-border bg-muted/30 p-3.5"
                  >
                    <p className="card-label">{d.label}</p>
                    <div className="flex flex-wrap gap-4">
                      {d.targets.map((t) => (
                        <label
                          key={t.value}
                          htmlFor={`target-${t.value}`}
                          className="flex cursor-pointer items-center gap-2 text-sm text-secondary-text"
                        >
                          <input
                            id={`target-${t.value}`}
                            type="checkbox"
                            className="size-4 accent-[var(--color-primary)]"
                            checked={listForm.targets[t.value]}
                            onChange={() => toggleTarget(t.value)}
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="list-active">Aktif</Label>
                  <p className="text-xs text-muted-foreground">
                    Dipakai oleh alur yang telah ditetapkan.
                  </p>
                </div>
                <Switch
                  id="list-active"
                  checked={listForm.is_active}
                  onCheckedChange={(v) => setListForm({ ...listForm, is_active: v })}
                />
              </div>

              <div className="flex flex-wrap gap-2.5">
                <Button type="submit">
                  <Save className="size-4" />
                  {editingListId ? 'Simpan Perubahan' : 'Buat Daftar'}
                </Button>
                {editingListId ? (
                  <Button type="button" variant="outline" onClick={cancelEditList}>
                    Batal
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}

          {listsLoading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Memuat daftar pertanyaan…</p>
            </div>
          ) : lists.length === 0 ? (
            <EmptyState
              icon={<Layers />}
              title="Belum ada daftar pertanyaan"
              description="Anda belum memiliki data. Mulai dengan membuat daftar pertanyaan pertama."
              action={
                <Button onClick={() => setShowListForm(true)}>
                  <Plus className="size-4" />
                  Buat Daftar
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {lists.map((l) => (
                <div
                  key={l.question_list_id}
                  className="rounded-xl border border-border p-4 transition-colors hover:border-primary/25"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-heading">{l.name}</p>
                        <StatusBadge
                          tone={l.is_active ? "success" : "neutral"}
                          label={l.is_active ? "Aktif" : "Nonaktif"}
                        />
                      </div>
                      {l.description ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">{l.description}</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {l.targets.map((t) => (
                          <Badge key={t} variant="outline">
                            {TARGET_LABEL[t] ?? t}
                          </Badge>
                        ))}
                        {l.targets.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Belum ditetapkan ke alur mana pun</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {countByList[l.question_list_id] ?? 0} pertanyaan
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Ubah daftar ${l.name}`}
                        onClick={() => startEditList(l)}
                      >
                        <Pencil className="size-4" />
                        Ubah
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        aria-label={`Hapus daftar ${l.name}`}
                        onClick={() => handleDeleteList(l.question_list_id)}
                      >
                        <Trash2 className="size-4" />
                        Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tambah Pertanyaan ── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="blue">
              <Plus />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Tambah Pertanyaan</CardTitle>
              <CardDescription>
                Pilih daftar tujuan agar pertanyaan masuk ke grup yang tepat.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="question-text">Teks Pertanyaan</Label>
                <Input
                  id="question-text"
                  placeholder="Contoh: Apakah kamu merasamurah dalam belajar?"
                  value={form.question_text}
                  onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="question-type">Jenis Jawaban</Label>
                <Select
                  value={form.question_type}
                  onValueChange={(v) =>
                    setForm({ ...form, question_type: (v ?? 'multiple_choice') as Question['question_type'] })
                  }
                  items={QUESTION_TYPE_LABEL}
                >
                  <SelectTrigger id="question-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Pilihan Ganda</SelectItem>
                    <SelectItem value="checkbox">Pilihan Banyak</SelectItem>
                    <SelectItem value="text">Ulasan Teks</SelectItem>
                    <SelectItem value="rating">Penilaian Skala</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2.5 pb-2.5">
                <input
                  id="question-required"
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={form.is_required}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                />
                <Label htmlFor="question-required" className="text-sm font-normal">
                  Wajib diisi
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="question-order">Urutan</Label>
                <Input
                  id="question-order"
                  type="number"
                  className="w-24"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qlist">Daftar</Label>
                <Select
                  value={form.question_list_id}
                  onValueChange={(v) => setForm({ ...form, question_list_id: v ?? '' })}
                  items={listItems}
                >
                  <SelectTrigger id="qlist" className="w-full sm:w-64">
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

              <Button type="submit">
                <Save className="size-4" />
                Simpan Pertanyaan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Bank Pertanyaan ── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="slate">
              <ListChecks />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Bank Pertanyaan</CardTitle>
              <CardDescription>
                Semua pertanyaan yang tersimpan. Pindahkan antar daftar lewat pilihan &quot;Daftar&quot;
                pada tiap pertanyaan.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Memuat pertanyaan…</p>
            </div>
          ) : questions.length === 0 ? (
            <EmptyState
              icon={<ListChecks />}
              title="Belum ada pertanyaan"
              description="Anda belum memiliki data. Mulai dengan menambahkan pertanyaan pada formulir di atas."
            />
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div
                  key={q.question_id}
                  className="rounded-xl border border-border transition-colors hover:border-primary/25"
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium leading-relaxed text-heading">
                        {q.question_text}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{questionTypeLabel(q.question_type)}</Badge>
                        {q.is_required ? (
                          <StatusBadge tone="warning" label="Wajib diisi" />
                        ) : (
                          <StatusBadge tone="neutral" label="Opsional" />
                        )}
                        <span className="text-xs text-muted-foreground">Urutan {q.order_index}</span>
                        <span className="text-xs text-muted-foreground">
                          Daftar: <span className="font-medium text-secondary-text">{listName(q.question_list_id)}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${expandedQuestion === q.question_id ? 'Sembunyikan' : 'Kelola'} jawaban pertanyaan ${q.question_text}`}
                        onClick={() => toggleExpand(q.question_id)}
                      >
                        {expandedQuestion === q.question_id ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                        {expandedQuestion === q.question_id ? 'Sembunyikan' : 'Jawaban'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-label={`Hapus pertanyaan ${q.question_text}`}
                        onClick={() => handleDeleteQuestion(q.question_id)}
                      >
                        <Trash2 className="size-4" />
                        Hapus
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center">
                    <Label htmlFor={`move-${q.question_id}`} className="shrink-0 text-xs">
                      Pindahkan ke daftar:
                    </Label>
                    <Select
                      value={q.question_list_id ?? ''}
                      onValueChange={(v) => handleReassignQuestion(q.question_id, v ?? '')}
                      items={listItems}
                    >
                      <SelectTrigger id={`move-${q.question_id}`} className="w-full sm:w-64">
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

                  {expandedQuestion === q.question_id ? (
                    <div className="space-y-3 border-t border-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Jawaban dan Poin
                      </p>
                      <div className="space-y-2">
                        {(answersMap[q.question_id] ?? []).map((a) => (
                          <div key={a.answer_id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              aria-label={`Teks jawaban ${a.answer_text}`}
                              className="flex-1"
                              value={a.answer_text}
                              onChange={(e) =>
                                handleUpdateAnswer(a.answer_id, q.question_id, { answer_text: e.target.value })
                              }
                            />
                            <Input
                              aria-label={`Poin untuk jawaban ${a.answer_text}`}
                              type="number"
                              className="w-full sm:w-24"
                              value={a.score}
                              onChange={(e) =>
                                handleUpdateAnswer(a.answer_id, q.question_id, { score: Number(e.target.value) })
                              }
                            />
                            <Button
                              variant="destructive"
                              size="sm"
                              aria-label={`Hapus jawaban ${a.answer_text}`}
                              onClick={() => handleDeleteAnswer(a.answer_id, q.question_id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                        {(answersMap[q.question_id] ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Belum ada jawaban untuk pertanyaan ini.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                        <Input
                          aria-label="Teks jawaban baru"
                          className="flex-1"
                          placeholder="Teks jawaban baru"
                          value={answerForm[q.question_id]?.answer_text ?? ''}
                          onChange={(e) =>
                            setAnswerForm((prev) => ({
                              ...prev,
                              [q.question_id]: { ...prev[q.question_id], answer_text: e.target.value },
                            }))
                          }
                        />
                        <Input
                          aria-label="Poin untuk jawaban baru"
                          type="number"
                          className="w-full sm:w-24"
                          placeholder="Poin"
                          value={answerForm[q.question_id]?.score ?? ''}
                          onChange={(e) =>
                            setAnswerForm((prev) => ({
                              ...prev,
                              [q.question_id]: { ...prev[q.question_id], score: e.target.value },
                            }))
                          }
                        />
                        <Button size="sm" onClick={() => handleCreateAnswer(q.question_id)}>
                          <Plus className="size-4" />
                          Tambah Jawaban
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** QR code panel with a copyable link. */
function QrPanel({
  title,
  description,
  url,
  highlighted,
  onCopy,
}: {
  title: string;
  description: string;
  url: string;
  highlighted: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className={`flex flex-col items-start gap-4 rounded-xl border p-5 ${
        highlighted ? 'border-info-soft bg-info-soft/40' : 'border-border bg-muted/40'
      }`}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-heading">{title}</p>
          {highlighted ? <StatusBadge tone="info" label="Kuisioner" /> : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>

      {url ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="rounded-xl border border-border bg-card p-3">
            <QRCodeSVG value={url} size={140} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <code className="block break-all rounded-lg bg-card px-3 py-2 text-xs text-secondary-text">
              {url}
            </code>
            <Button size="sm" variant="outline" onClick={onCopy}>
              <ClipboardCopy className="size-4" />
              Salin Tautan
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Kode QR sedang disiapkan…</p>
      )}
    </div>
  );
}