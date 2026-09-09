'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const INTERVENTION_OPTIONS = [
  'Active listening', 'Clarifying', 'Reflection', 'Exploring thoughts/emotions',
  'Reframing', 'Problem solving', 'Decision-making support', 'Emotional regulation strategy',
  'Conflict resolution', 'Goal setting', 'Spiritual/pastoral support', 'Psychoeducation', 'Referral discussion',
];

const RISK_LEVELS = [
  { value: 'no_risk', label: 'No identified risk' },
  { value: 'low', label: 'Low concern' },
  { value: 'moderate', label: 'Moderate concern' },
  { value: 'high', label: 'High / Immediate concern' },
];

const SAFETY_ACTIONS = [
  { value: 'tidak_dibutuhkan', label: 'Tidak diperlukan' },
  { value: 'safety_plan', label: 'Safety plan' },
  { value: 'emergency_protocol', label: 'Emergency protocol' },
  { value: 'referral_profesional', label: 'Referral profesional' },
  { value: 'emergency_referral', label: 'Emergency referral' },
];

const FOLLOWUP_STATUSES = [
  { value: 'selesai', label: 'Selesai' },
  { value: 'follow_up_disarankan', label: 'Follow-up disarankan' },
  { value: 'follow_up_dijadwalkan', label: 'Follow-up dijadwalkan' },
  { value: 'referral_direkomendasikan', label: 'Referral direkomendasikan' },
  { value: 'referral_dilakukan', label: 'Referral dilakukan' },
];

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

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/counselor/employee-counseling/${submissionId}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent hover:bg-muted hover:text-foreground h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold">Sesi Baru — Konseling Karyawan</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Info */}
        <Card>
          <CardHeader><CardTitle>1. Informasi Sesi</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Tanggal</Label>
                <Input type="date" value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Waktu</Label>
                <Input type="time" value={form.session_time} onChange={e => setForm(f => ({ ...f, session_time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Metode</Label>
                <select className="border rounded p-2 w-full" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as any }))}>
                  <option value="tatap_muka">Tatap Muka</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Presenting Concern */}
        <Card>
          <CardHeader><CardTitle>2. Pokok Permasalahan</CardTitle>
            <CardDescription>Pokok permasalahan yang dibawa karyawan (singkat, dari perspektif karyawan).</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea rows={3} value={form.section_2_presenting_concern}
              onChange={e => setForm(f => ({ ...f, section_2_presenting_concern: e.target.value }))}
              placeholder="Tulis singkat..." />
          </CardContent>
        </Card>

        {/* Section 3: Key Points */}
        <Card>
          <CardHeader><CardTitle>3. Poin Penting Dibahas</CardTitle>
            <CardDescription>3-5 poin utama yang relevan dari sesi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={keyPointInput} onChange={e => setKeyPointInput(e.target.value)}
                placeholder="Tambah poin..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyPoint())} />
              <Button type="button" variant="outline" onClick={addKeyPoint}>Tambah</Button>
            </div>
            <div className="space-y-1">
              {form.section_3_key_points.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-1">
                  <span className="text-muted-foreground w-4">{i + 1}.</span>
                  <span className="flex-1">{p}</span>
                  <button type="button" onClick={() => removeKeyPoint(i)} className="text-red-500 hover:text-red-700">✕</button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Observation */}
        <Card>
          <CardHeader><CardTitle>4. Observasi Konselor</CardTitle>
            <CardDescription>Catat observasi yang relevan dan objektif.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea rows={3} value={form.section_4_observation}
              onChange={e => setForm(f => ({ ...f, section_4_observation: e.target.value }))}
              placeholder="Observasi objektif..." />
          </CardContent>
        </Card>

        {/* Section 5: Intervention */}
        <Card>
          <CardHeader><CardTitle>5. Intervensi</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Jenis Intervensi</Label>
              <select className="border rounded p-2 w-full" value={form.intervention_type}
                onChange={e => setForm(f => ({ ...f, intervention_type: e.target.value }))}>
                {INTERVENTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Catatan Singkat</Label>
              <Textarea value={form.intervention_note}
                onChange={e => setForm(f => ({ ...f, intervention_note: e.target.value }))}
                placeholder="Catatan intervensi..." />
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Employee Insight */}
        <Card>
          <CardHeader><CardTitle>6. Insight / Respons Karyawan</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={2} value={form.section_6_employee_insight}
              onChange={e => setForm(f => ({ ...f, section_6_employee_insight: e.target.value }))}
              placeholder="Insight atau respons penting dari karyawan..." />
          </CardContent>
        </Card>

        {/* Section 7: Action Plan */}
        <Card>
          <CardHeader><CardTitle>7. Rencana Aksi</CardTitle>
            <CardDescription>Daftar aksi/langkah yang disepakati (1, 2, 3).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={actionInput} onChange={e => setActionInput(e.target.value)}
                placeholder="Tambah langkah..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAction())} />
              <Button type="button" variant="outline" onClick={addAction}>Tambah</Button>
            </div>
            <div className="space-y-1">
              {form.section_7_action_plan.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-1">
                  <span className="text-muted-foreground w-4">{i + 1}.</span>
                  <span className="flex-1">{a}</span>
                  <button type="button" onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700">✕</button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 8: Risk */}
        <Card>
          <CardHeader><CardTitle>8. Risiko & Keselamatan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tingkat Risiko</Label>
                <select className="border rounded p-2 w-full" value={form.risk_level}
                  onChange={e => setForm(f => ({ ...f, risk_level: e.target.value }))}>
                  {RISK_LEVELS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tindakan Keselamatan</Label>
                <select className="border rounded p-2 w-full" value={form.safety_action}
                  onChange={e => setForm(f => ({ ...f, safety_action: e.target.value }))}>
                  {SAFETY_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Deskripsi (fakta yang mendasari assessment)</Label>
              <Textarea value={form.risk_description}
                onChange={e => setForm(f => ({ ...f, risk_description: e.target.value }))}
                placeholder="Fakta yang mendasari..." />
            </div>
          </CardContent>
        </Card>

        {/* Section 9: Follow-up */}
        <Card>
          <CardHeader><CardTitle>9. Follow-up</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Status</Label>
                <select className="border rounded p-2 w-full" value={form.followup_status}
                  onChange={e => setForm(f => ({ ...f, followup_status: e.target.value }))}>
                  {FOLLOWUP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tanggal Follow-up</Label>
                <Input type="date" value={form.followup_date}
                  onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Target Sesi Berikutnya</Label>
              <Input value={form.followup_target}
                onChange={e => setForm(f => ({ ...f, followup_target: e.target.value }))}
                placeholder="Topik atau jadwal yang dimaksudkan..." />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Sesi'}</Button>
          <Link
            href={`/dashboard/counselor/employee-counseling/${submissionId}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground gap-1.5 h-8 px-2.5 text-sm"
          >
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
