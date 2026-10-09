'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { IconBox } from '@/components/ui/icon-box';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
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

export default function NewSessionPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    session_date: '',
    session_time: '',
    method: 'tatap_muka' as 'tatap_muka' | 'online',
    section_2_presenting_concern: '',
    section_3_key_points: [] as string[],
    section_4_observation: '',
    intervention_type: INTERVENTION_OPTIONS[0],
    intervention_note: '',
    section_6_employee_insight: '',
    section_7_action_plan: [] as string[],
    risk_level: 'no_risk',
    risk_description: '',
    safety_action: 'tidak_dibutuhkan',
    followup_status: 'follow_up_dijadwalkan',
    followup_target: '',
    followup_date: '',
  });

  const [keyPointInput, setKeyPointInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  const addKeyPoint = () => {
    if (keyPointInput.trim()) {
      setForm(f => ({ ...f, section_3_key_points: [...f.section_3_key_points, keyPointInput.trim()] }));
      setKeyPointInput('');
    }
  };

  const removeKeyPoint = (i: number) => {
    setForm(f => ({ ...f, section_3_key_points: f.section_3_key_points.filter((_, idx) => idx !== i) }));
  };

  const addAction = () => {
    if (actionInput.trim()) {
      setForm(f => ({ ...f, section_7_action_plan: [...f.section_7_action_plan, actionInput.trim()] }));
      setActionInput('');
    }
  };

  const removeAction = (i: number) => {
    setForm(f => ({ ...f, section_7_action_plan: f.section_7_action_plan.filter((_, idx) => idx !== i) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const payload = {
      submission_id: submissionId,
      session_date: form.session_date || undefined,
      session_time: form.session_time || undefined,
      method: form.method,
      section_1_info: {
        employee_name: '', // will be filled from submission on backend
        counselor_name: user.full_name,
        session_date: form.session_date || new Date().toISOString().split('T')[0],
        session_time: form.session_time || '',
        method: form.method,
      },
      section_2_presenting_concern: form.section_2_presenting_concern,
      section_3_key_points: form.section_3_key_points,
      section_4_observation: form.section_4_observation,
      section_5_intervention: {
        type: form.intervention_type,
        note: form.intervention_note,
      },
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

    const res = await apiClient('/employee-counseling/sessions', {
      method: 'POST',
      body: payload,
    });

    setSaving(false);
    if (res.success) {
      toast.success('Sesi berhasil disimpan');
      router.push(`/dashboard/counselor/employee-counseling/${submissionId}`);
    } else {
      toast.error(res.error ?? 'Gagal menyimpan sesi');
    }
  };

  const riskTone = RISK_TONE[form.risk_level as keyof typeof RISK_TONE] ?? severityTone(form.risk_level);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sesi Baru — Konseling Karyawan"
        description="Catat hasil sesi konseling: pokok persoalan, intervensi, rencana aksi, dan tindak lanjut."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/dashboard/counselor/employee-counseling/${submissionId}`} />}
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke detail
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="blue" size="sm">
                <CalendarDays />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>1. Informasi Sesi</CardTitle>
                <CardDescription>Tanggal, waktu, dan metode pelaksanaan sesi.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
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
              <div className="space-y-1.5">
                <Label htmlFor="session-method">Metode</Label>
                <Select
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="purple" size="sm">
                <ClipboardList />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>2. Pokok Permasalahan</CardTitle>
                <CardDescription>Pokok permasalahan yang dibawa karyawan (singkat, dari perspektif karyawan).</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Label htmlFor="presenting-concern" className="sr-only">Pokok permasalahan</Label>
            <Textarea
              id="presenting-concern"
              rows={3}
              value={form.section_2_presenting_concern}
              onChange={e => setForm(f => ({ ...f, section_2_presenting_concern: e.target.value }))}
              placeholder="Tulis singkat pokok permasalahan yang dibawa karyawan..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="teal" size="sm">
                <ListChecks />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>3. Poin Penting Dibahas</CardTitle>
                <CardDescription>3–5 poin utama yang relevan dari sesi.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5"
                  >
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="blue" size="sm">
                <UserRound />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>4. Observasi Konselor</CardTitle>
                <CardDescription>Catat observasi yang relevan dan objektif.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Label htmlFor="observation" className="sr-only">Observasi konselor</Label>
            <Textarea
              id="observation"
              rows={3}
              value={form.section_4_observation}
              onChange={e => setForm(f => ({ ...f, section_4_observation: e.target.value }))}
              placeholder="Tulis observasi objektif dari sesi..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="green" size="sm">
                <HeartHandshake />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>5. Intervensi</CardTitle>
                <CardDescription>Jenis intervensi yang digunakan beserta catatan singkatnya.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="intervention-type">Jenis Intervensi</Label>
              <Select
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="yellow" size="sm">
                <Lightbulb />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>6. Insight / Respons Karyawan</CardTitle>
                <CardDescription>Insight atau respons penting yang muncul dari karyawan.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Label htmlFor="employee-insight" className="sr-only">Insight karyawan</Label>
            <Textarea
              id="employee-insight"
              rows={2}
              value={form.section_6_employee_insight}
              onChange={e => setForm(f => ({ ...f, section_6_employee_insight: e.target.value }))}
              placeholder="Tulis insight atau respons penting dari karyawan..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="purple" size="sm">
                <Target />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>7. Rencana Aksi</CardTitle>
                <CardDescription>Daftar aksi atau langkah yang disepakati bersama karyawan.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5"
                  >
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
              <div className="flex items-start gap-3">
                <IconBox tone="red" size="sm">
                  <ShieldAlert />
                </IconBox>
                <div className="min-w-0 space-y-1">
                  <CardTitle>8. Risiko &amp; Keselamatan</CardTitle>
                  <CardDescription>Penilaian risiko dan tindakan keselamatan yang perlu diambil.</CardDescription>
                </div>
              </div>
              <StatusBadge
                tone={riskTone}
                label={RISK_LEVEL_LABEL[form.risk_level] ?? form.risk_level}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="risk-level">Tingkat Risiko</Label>
                <Select
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconBox tone="teal" size="sm">
                <NotebookPen />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle>9. Tindak Lanjut</CardTitle>
                <CardDescription>Status tindak lanjut, tanggal, dan target sesi berikutnya.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="followup-status">Status</Label>
                <Select
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
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving} className="gap-1.5">
            <NotebookPen className="size-3.5" />
            {saving ? 'Menyimpan…' : 'Simpan Sesi'}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`/dashboard/counselor/employee-counseling/${submissionId}`} />}
          >
            Batal
          </Button>
          <p className="text-xs text-muted-foreground">
            Sesi akan tersimpan pada pengajuan ini dan langsung ditambahkan ke daftar catatan sesi.
          </p>
        </div>
      </form>
    </div>
  );
}