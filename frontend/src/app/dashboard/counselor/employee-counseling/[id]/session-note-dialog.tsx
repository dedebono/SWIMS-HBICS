'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  HeartHandshake,
  ListChecks,
  Lightbulb,
  NotebookPen,
  Plus,
  ShieldAlert,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { IconBox } from '@/components/ui/icon-box';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const INTERVENTION_OPTIONS = [
  'Active listening', 'Clarifying', 'Reflection', 'Exploring thoughts/emotions',
  'Reframing', 'Problem solving', 'Decision-making support', 'Emotional regulation strategy',
  'Conflict resolution', 'Goal setting', 'Spiritual/pastoral support', 'Psychoeducation', 'Referral discussion',
];

const RISK_LEVELS = [
  { value: 'no_risk', label: 'Tidak teridentifikasi ada risiko' },
  { value: 'low', label: 'Kekhawatiran ringan' },
  { value: 'moderate', label: 'Kekhawatiran sedang' },
  { value: 'high', label: 'Kekhawatiran tinggi / segera' },
];

const SAFETY_ACTIONS = [
  { value: 'tidak_dibutuhkan', label: 'Tidak diperlukan' },
  { value: 'safety_plan', label: 'Rencana keselamatan' },
  { value: 'emergency_protocol', label: 'Protokol darurat' },
  { value: 'referral_profesional', label: 'Rujukan profesional' },
  { value: 'emergency_referral', label: 'Rujukan darurat' },
];

const FOLLOWUP_STATUSES = [
  { value: 'selesai', label: 'Selesai' },
  { value: 'follow_up_disarankan', label: 'Follow-up disarankan' },
  { value: 'follow_up_dijadwalkan', label: 'Follow-up dijadwalkan' },
  { value: 'referral_direkomendasikan', label: 'Rujukan direkomendasikan' },
  { value: 'referral_dilakukan', label: 'Rujukan dilakukan' },
];

const RISK_LEVEL_LABEL: Record<string, string> = {
  no_risk: 'Tidak ada risiko',
  low: 'Kekhawatiran ringan',
  moderate: 'Kekhawatiran sedang',
  high: 'Kekhawatiran tinggi',
};

const RISK_TONE = {
  no_risk: 'success',
  low: 'info',
  moderate: 'warning',
  high: 'danger',
} as const;

interface FormState {
  session_date: string;
  session_time: string;
  method: 'tatap_muka' | 'online';
  section_2_presenting_concern: string;
  section_3_key_points: string[];
  section_4_observation: string;
  intervention_type: string;
  intervention_note: string;
  section_6_employee_insight: string;
  section_7_action_plan: string[];
  risk_level: string;
  risk_description: string;
  safety_action: string;
  followup_status: string;
  followup_target: string;
  followup_date: string;
}

const EMPTY_FORM: FormState = {
  session_date: '',
  session_time: '',
  method: 'tatap_muka',
  section_2_presenting_concern: '',
  section_3_key_points: [],
  section_4_observation: '',
  intervention_type: INTERVENTION_OPTIONS[0],
  intervention_note: '',
  section_6_employee_insight: '',
  section_7_action_plan: [],
  risk_level: 'no_risk',
  risk_description: '',
  safety_action: 'tidak_dibutuhkan',
  followup_status: 'follow_up_dijadwalkan',
  followup_target: '',
  followup_date: '',
};

/** Minimal shape needed to reopen a saved session for editing. */
export interface EditableSession {
  session_id: string;
  session_number: number;
  session_date?: string | null;
  session_time?: string | null;
  method?: string | null;
  section_2_presenting_concern?: string | null;
  section_3_key_points?: string[] | null;
  section_4_observation?: string | null;
  section_5_intervention?: { type?: string; note?: string } | null;
  section_6_employee_insight?: string | null;
  section_7_action_plan?: string[] | null;
  section_8_risk?: { level?: string; concern_description?: string; safety_action?: string } | null;
  section_9_followup?: {
    status?: string;
    target_sesi_berikutnya?: string;
    tanggal_follow_up?: string | null;
  } | null;
}

interface SessionNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  employeeName?: string;
  /** When set the dialog edits this existing session instead of creating a new one. */
  session?: EditableSession | null;
  /** Fires after a successful create or update so the caller can refetch. */
  onSaved?: () => void | Promise<void>;
}

const toDateInput = (v?: string | null): string => (v ? String(v).slice(0, 10) : '');
const toTimeInput = (v?: string | null): string => (v ? String(v).slice(0, 5) : '');

/** Build the form state from an existing session so reopening prefills it. */
function formFromSession(s: EditableSession): FormState {
  return {
    session_date: toDateInput(s.session_date),
    session_time: toTimeInput(s.session_time),
    method: s.method === 'online' ? 'online' : 'tatap_muka',
    section_2_presenting_concern: s.section_2_presenting_concern ?? '',
    section_3_key_points: Array.isArray(s.section_3_key_points) ? [...s.section_3_key_points] : [],
    section_4_observation: s.section_4_observation ?? '',
    intervention_type: s.section_5_intervention?.type || INTERVENTION_OPTIONS[0],
    intervention_note: s.section_5_intervention?.note ?? '',
    section_6_employee_insight: s.section_6_employee_insight ?? '',
    section_7_action_plan: Array.isArray(s.section_7_action_plan) ? [...s.section_7_action_plan] : [],
    risk_level: s.section_8_risk?.level || 'no_risk',
    risk_description: s.section_8_risk?.concern_description ?? '',
    safety_action: s.section_8_risk?.safety_action || 'tidak_dibutuhkan',
    followup_status: s.section_9_followup?.status || 'follow_up_dijadwalkan',
    followup_target: s.section_9_followup?.target_sesi_berikutnya ?? '',
    followup_date: toDateInput(s.section_9_followup?.tanggal_follow_up),
  };
}

export function SessionNoteDialog({
  open,
  onOpenChange,
  submissionId,
  employeeName,
  session,
  onSaved,
}: SessionNoteDialogProps) {
  const { user } = useAuth();
  const isEdit = !!session?.session_id;

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [keyPointInput, setKeyPointInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  // Reset whenever the dialog opens so a stale edit never leaks into a new session.
  useEffect(() => {
    if (!open) return;
    setForm(session ? formFromSession(session) : { ...EMPTY_FORM });
    setKeyPointInput('');
    setActionInput('');
  }, [open, session]);

  const interventionItems = useMemo(
    () => Object.fromEntries(INTERVENTION_OPTIONS.map(o => [o, o])),
    [],
  );
  const methodItems = useMemo(() => ({ tatap_muka: 'Tatap Muka', online: 'Online' }), []);
  const riskItems = useMemo(
    () => Object.fromEntries(RISK_LEVELS.map(r => [r.value, r.label])),
    [],
  );
  const safetyItems = useMemo(
    () => Object.fromEntries(SAFETY_ACTIONS.map(a => [a.value, a.label])),
    [],
  );
  const followupItems = useMemo(
    () => Object.fromEntries(FOLLOWUP_STATUSES.map(s => [s.value, s.label])),
    [],
  );

  const addKeyPoint = () => {
    if (keyPointInput.trim()) {
      setForm(f => ({ ...f, section_3_key_points: [...f.section_3_key_points, keyPointInput.trim()] }));
      setKeyPointInput('');
    }
  };
  const removeKeyPoint = (i: number) =>
    setForm(f => ({ ...f, section_3_key_points: f.section_3_key_points.filter((_, idx) => idx !== i) }));

  const addAction = () => {
    if (actionInput.trim()) {
      setForm(f => ({ ...f, section_7_action_plan: [...f.section_7_action_plan, actionInput.trim()] }));
      setActionInput('');
    }
  };
  const removeAction = (i: number) =>
    setForm(f => ({ ...f, section_7_action_plan: f.section_7_action_plan.filter((_, idx) => idx !== i) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      submission_id: submissionId,
      session_date: form.session_date || undefined,
      session_time: form.session_time || undefined,
      method: form.method,
      section_1_info: {
        employee_name: '',
        counselor_name: user?.full_name ?? '',
        session_date: form.session_date || new Date().toISOString().split('T')[0],
        session_time: form.session_time || '',
        method: form.method,
      },
      section_2_presenting_concern: form.section_2_presenting_concern,
      section_3_key_points: form.section_3_key_points,
      section_4_observation: form.section_4_observation,
      section_5_intervention: { type: form.intervention_type, note: form.intervention_note },
      section_6_employee_insight: form.section_6_employee_insight,
      section_7_action_plan: form.section_7_action_plan,
      section_8_risk: {
        level: form.risk_level,
        concern_description: form.risk_description,
        safety_action: form.safety_action,
      },
      section_9_followup: {
        status: form.followup_status,
        target_sesi_berikutnya: form.followup_target,
        tanggal_follow_up: form.followup_date || undefined,
      },
    };

    const res = await apiClient(
      isEdit
        ? `/employee-counseling/sessions/${session!.session_id}`
        : '/employee-counseling/sessions',
      { method: isEdit ? 'PATCH' : 'POST', body: payload },
    );
    setSaving(false);

    if (res.success) {
      toast.success(isEdit ? 'Perubahan sesi berhasil disimpan' : 'Sesi berhasil disimpan');
      await onSaved?.();
      onOpenChange(false);
    } else {
      toast.error(res.error ?? 'Gagal menyimpan sesi');
    }
  };

  const riskTone = RISK_TONE[form.risk_level as keyof typeof RISK_TONE] ?? 'info';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <IconBox tone="blue" size="sm">
              <CalendarDays />
            </IconBox>
            {isEdit ? `Sesi ${session?.session_number} — Edit Catatan` : 'Sesi Baru — Konseling Karyawan'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Catatan sesi ${session?.session_number}${employeeName ? ` untuk ${employeeName}` : ''}.`
              : `Catat hasil sesi konseling${employeeName ? ` untuk ${employeeName}` : ''}: pokok persoalan, intervensi, rencana aksi, dan tindak lanjut.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="scroll-slim flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-x-8 gap-y-5 overflow-y-auto px-6 py-5 lg:grid-cols-2">
            {/* 1. Informasi Sesi */}
            <SectionCard
              step={1}
              title="Informasi Sesi"
              hint="Kapan dan bagaimana sesi dilaksanakan."
              icon={<CalendarDays className="size-3.5" />}
              tone="blue"
              full
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="session-date">Tanggal</Label>
                  <Input
                    id="session-date"
                    type="date"
                    value={form.session_date}
                    onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="session-time">Waktu</Label>
                  <Input
                    id="session-time"
                    type="time"
                    value={form.session_time}
                    onChange={e => setForm(f => ({ ...f, session_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="session-method">Metode</Label>
                  <Select
                    items={methodItems}
                    value={form.method}
                    onValueChange={(v) => setForm(f => ({ ...f, method: (v ?? 'tatap_muka') as 'tatap_muka' | 'online' }))}
                  >
                    <SelectTrigger id="session-method" className="w-full">
                      <SelectValue placeholder="Pilih metode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tatap_muka">Tatap Muka</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            {/* 2. Pokok Permasalahan */}
            <SectionCard
              step={2}
              title="Pokok Permasalahan"
              hint="Pokok persoalan yang dibawa karyawan, singkat dari sudut pandang karyawan."
              icon={<ClipboardList className="size-3.5" />}
              tone="purple"
              full
            >
              <Textarea
                id="presenting-concern"
                rows={3}
                value={form.section_2_presenting_concern}
                onChange={e => setForm(f => ({ ...f, section_2_presenting_concern: e.target.value }))}
                placeholder="Tulis singkat pokok permasalahan yang dibawa karyawan..."
              />
            </SectionCard>

            {/* 3. Poin Penting */}
            <SectionCard
              step={3}
              title="Poin Penting Dibahas"
              hint="3–5 poin utama yang relevan dari sesi."
              icon={<ListChecks className="size-3.5" />}
              tone="teal"
              full
            >
              <div className="flex gap-2">
                <Input
                  value={keyPointInput}
                  onChange={e => setKeyPointInput(e.target.value)}
                  placeholder="Tambah poin penting..."
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyPoint())}
                />
                <Button type="button" variant="outline" onClick={addKeyPoint} className="gap-1.5">
                  <Plus className="size-3.5" />
                  Tambah
                </Button>
              </div>
              {form.section_3_key_points.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada poin yang ditambahkan.</p>
              ) : (
                <ul className="space-y-2">
                  {form.section_3_key_points.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm text-secondary-text">{p}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeKeyPoint(i)}
                        aria-label={`Hapus poin ${i + 1}`}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* 4. Observasi */}
            <SectionCard
              step={4}
              title="Observasi Konselor"
              hint="Observasi yang relevan dan objektif selama sesi."
              icon={<UserRound className="size-3.5" />}
              tone="blue"
              full
            >
              <Textarea
                id="observation"
                rows={3}
                value={form.section_4_observation}
                onChange={e => setForm(f => ({ ...f, section_4_observation: e.target.value }))}
                placeholder="Tulis observasi objektif dari sesi..."
              />
            </SectionCard>

            {/* 5. Intervensi */}
            <SectionCard
              step={5}
              title="Intervensi"
              hint="Jenis intervensi yang digunakan beserta catatan singkatnya."
              icon={<HeartHandshake className="size-3.5" />}
              tone="green"
              full
            >
              <div className="space-y-1.5">
                <Label htmlFor="intervention-type">Jenis Intervensi</Label>
                <Select
                  items={interventionItems}
                  value={form.intervention_type}
                  onValueChange={(v) => setForm(f => ({ ...f, intervention_type: v ?? INTERVENTION_OPTIONS[0] }))}
                >
                  <SelectTrigger id="intervention-type" className="w-full">
                    <SelectValue placeholder="Pilih jenis intervensi" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVENTION_OPTIONS.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intervention-note">Catatan Singkat</Label>
                <Textarea
                  id="intervention-note"
                  value={form.intervention_note}
                  onChange={e => setForm(f => ({ ...f, intervention_note: e.target.value }))}
                  placeholder="Catatan singkat mengenai intervensi..."
                />
              </div>
            </SectionCard>

            {/* 6. Insight */}
            <SectionCard
              step={6}
              title="Insight / Respons Karyawan"
              hint="Respons penting yang muncul dari karyawan selama sesi."
              icon={<Lightbulb className="size-3.5" />}
              tone="yellow"
              full
            >
              <Textarea
                id="employee-insight"
                rows={2}
                value={form.section_6_employee_insight}
                onChange={e => setForm(f => ({ ...f, section_6_employee_insight: e.target.value }))}
                placeholder="Tulis insight atau respons penting dari karyawan..."
              />
            </SectionCard>

            {/* 7. Rencana Aksi */}
            <SectionCard
              step={7}
              title="Rencana Aksi"
              hint="Aksi atau langkah yang disepakati bersama karyawan."
              icon={<Target className="size-3.5" />}
              tone="purple"
              full
            >
              <div className="flex gap-2">
                <Input
                  value={actionInput}
                  onChange={e => setActionInput(e.target.value)}
                  placeholder="Tambah langkah..."
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAction())}
                />
                <Button type="button" variant="outline" onClick={addAction} className="gap-1.5">
                  <Plus className="size-3.5" />
                  Tambah
                </Button>
              </div>
              {form.section_7_action_plan.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada langkah yang ditambahkan.</p>
              ) : (
                <ul className="space-y-2">
                  {form.section_7_action_plan.map((a, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm text-secondary-text">{a}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeAction(i)}
                        aria-label={`Hapus langkah ${i + 1}`}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* 8. Risiko */}
            <SectionCard
              step={8}
              title="Risiko Keselamatan"
              hint="Penilaian risiko dan tindakan keselamatan yang perlu diambil."
              icon={<ShieldAlert className="size-3.5" />}
              tone="red"
              full
              headerRight={
                <StatusBadge
                  tone={riskTone}
                  label={RISK_LEVEL_LABEL[form.risk_level] ?? form.risk_level}
                />
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="risk-level">Tingkat Risiko</Label>
                  <Select
                    items={riskItems}
                    value={form.risk_level}
                    onValueChange={(v) => setForm(f => ({ ...f, risk_level: v ?? 'no_risk' }))}
                  >
                    <SelectTrigger id="risk-level" className="w-full">
                      <SelectValue placeholder="Pilih tingkat risiko" />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="safety-action">Tindakan Keselamatan</Label>
                  <Select
                    items={safetyItems}
                    value={form.safety_action}
                    onValueChange={(v) => setForm(f => ({ ...f, safety_action: v ?? 'tidak_dibutuhkan' }))}
                  >
                    <SelectTrigger id="safety-action" className="w-full">
                      <SelectValue placeholder="Pilih tindakan keselamatan" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAFETY_ACTIONS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="risk-description">Deskripsi (fakta yang mendasari penilaian)</Label>
                <Textarea
                  id="risk-description"
                  value={form.risk_description}
                  onChange={e => setForm(f => ({ ...f, risk_description: e.target.value }))}
                  placeholder="Tulis fakta yang mendasari penilaian risiko..."
                />
              </div>
            </SectionCard>

            {/* 9. Tindak Lanjut */}
            <SectionCard
              step={9}
              title="Tindak Lanjut"
              hint="Status tindak lanjut, tanggal, dan target sesi berikutnya."
              icon={<NotebookPen className="size-3.5" />}
              tone="teal"
              full
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="followup-status">Status</Label>
                  <Select
                    items={followupItems}
                    value={form.followup_status}
                    onValueChange={(v) => setForm(f => ({ ...f, followup_status: v ?? 'follow_up_dijadwalkan' }))}
                  >
                    <SelectTrigger id="followup-status" className="w-full">
                      <SelectValue placeholder="Pilih status tindak lanjut" />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOWUP_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="followup-date">Tanggal Tindak Lanjut</Label>
                  <Input
                    id="followup-date"
                    type="date"
                    value={form.followup_date}
                    onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup-target">Target Sesi Berikutnya</Label>
                <Input
                  id="followup-target"
                  value={form.followup_target}
                  onChange={e => setForm(f => ({ ...f, followup_target: e.target.value }))}
                  placeholder="Topik atau jadwal yang dimaksudkan..."
                />
              </div>
            </SectionCard>
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-b-2xl">
            <Button type="submit" disabled={saving} className="gap-1.5">
              <NotebookPen className="size-3.5" />
              {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Sesi'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Soft background per section tone, for the small icon tile in the card header. */
const TONE_SOFT = {
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
  teal: 'bg-teal-50 text-teal-600',
  green: 'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600',
} as const;

/** Numbered card wrapper so the 9 sections read as one tidy, ordered checklist. */
function SectionCard({
  step,
  title,
  hint,
  icon,
  tone,
  full,
  headerRight,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  tone: 'blue' | 'purple' | 'teal' | 'green' | 'yellow' | 'red';
  full?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card p-4',
        full && 'lg:col-span-2',
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-medium text-heading">{title}</h3>
            <span
              className={cn(
                'inline-flex size-5 shrink-0 items-center justify-center rounded-md',
                TONE_SOFT[tone],
              )}
            >
              {icon}
            </span>
          </div>
          {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {headerRight}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}