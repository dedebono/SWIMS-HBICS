'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const Q1_OPTIONS = [
  'Masalah pribadi', 'Keluarga/pernikahan', 'Relasi dengan orang lain', 'Pekerjaan',
  'Konflik di tempat kerja', 'Tekanan/stres', 'Emosi yang sulit dikelola',
  'Kehilangan/dukacita', 'Pengambilan keputusan', 'Pertumbuhan pribadi/kariter',
  'Kehidupan rohani', 'Membutuhkan seseorang untuk mendengarkan', 'Lainnya',
];
const Q3_DURASI = ['Kurang dari 1 minggu', '1-4 minggu', '1-3 bulan', '3-6 bulan', 'Lebih dari 6 bulan', 'Lebih dari 1 tahun'];
const AREA_OPTIONS = [
  'Konsentrasi', 'Produktivitas kerja', 'Hubungan dengan orang lain', 'Kondisi emosi',
  'Tidur/istirahat', 'Aktivitas sehari-hari', 'Kehidupan keluarga', 'Kehidupan rohani',
  'Tidak ada dampak yang signifikan', 'Lainnya',
];
const HARAPAN_OPTIONS = ['Mendapatkan ruang untuk bercerita', 'Memahami diri sendiri lebih dalam', 'Mendapatkan solusi/advice', 'Strategi mengatasi masalah', 'Rujukan ke profesional', 'Dukacita / kehilangan'];
const E_WAKTU_OPTIONS = ['Pagi (07:00-12:00)', 'Siang (12:00-15:00)', 'Sore (15:00-18:00)', 'Online (bebas)'];
const E_METODE_OPTIONS = ['Tatap muka (offline)', 'Online', 'Tidak ada preferensi'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormData {
  employee_name: string;
  unit: string;
  position: string;
  contact_number: string;
  q1_alasan: string[];
  q2_deskripsi: string;
  q3_durasi: string;
  q4_dampak: number;
  q5_area_terdampak: string[];
  q6_harapan: string[];
  q7_pernah_konseling: string;
  q7_pernah_konseling_detail: string;
  q8_safety_threat: string;
  q9_bantuan_segera: string;
  e_waktu: string[];
  e_metode: string;
  e_hari: string;
  e_konselor_preferensi: string;
  consents: { consent_confidentiality: boolean; consent_emergency_protocol: boolean };
}

interface EmployeeCounselingWizardProps {
  onSubmitted?: (submissionId: string) => void;
  tenantSlug?: string;
}

const EMPTY: FormData = {
  employee_name: '', unit: '', position: '', contact_number: '',
  q1_alasan: [], q2_deskripsi: '', q3_durasi: '', q4_dampak: 3, q5_area_terdampak: [],
  q6_harapan: [], q7_pernah_konseling: '', q7_pernah_konseling_detail: '',
  q8_safety_threat: '', q9_bantuan_segera: '',
  e_waktu: [], e_metode: '', e_hari: '', e_konselor_preferensi: '',
  consents: { consent_confidentiality: false, consent_emergency_protocol: false },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ─── Section Components ───────────────────────────────────────────────────────
function SectionA({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Bagian A — Informasi dasar karyawan. (*) wajib.</p>
      <div className="space-y-2">
        <Label htmlFor="a_name">Nama Lengkap *</Label>
        <Input id="a_name" value={data.employee_name} onChange={e => on({ ...data, employee_name: e.target.value })} placeholder="Nama lengkap Anda" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="a_unit">Unit / Bagian</Label>
          <Input id="a_unit" value={data.unit} onChange={e => on({ ...data, unit: e.target.value })} placeholder="Contoh: SD Harapan Bangsa" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a_pos">Jabatan</Label>
          <Input id="a_pos" value={data.position} onChange={e => on({ ...data, position: e.target.value })} placeholder="Contoh: Guru Matematika" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="a_contact">Nomor Kontak / WhatsApp</Label>
        <Input id="a_contact" value={data.contact_number} onChange={e => on({ ...data, contact_number: e.target.value })} placeholder="08xxxxxxxxx" />
      </div>
    </div>
  );
}

function SectionB({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Bagian B — Kebutuhan konseling. Semua informasi bersifat rahasia.</p>

      {/* Q1: Alasan */}
      <div className="space-y-2">
        <Label>Apa alasan utama Anda mencari konseling? *</Label>
        <div className="grid grid-cols-2 gap-2">
          {Q1_OPTIONS.map(o => (
            <label key={o} className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer text-sm transition-colors ${data.q1_alasan.includes(o) ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="checkbox" className="rounded" checked={data.q1_alasan.includes(o)} onChange={() => on({ ...data, q1_alasan: toggle(data.q1_alasan, o) })} />
              {o}
            </label>
          ))}
        </div>
      </div>

      {/* Q2: Deskripsi singkat */}
      <div className="space-y-2">
        <Label htmlFor="q2">Ceritakan singkat situasi Anda</Label>
        <Textarea id="q2" rows={3} value={data.q2_deskripsi} onChange={e => on({ ...data, q2_deskripsi: e.target.value })} placeholder="Ceritakan secara singkat apa yang sedang Anda alami..." />
      </div>

      {/* Q3: Durasi */}
      <div className="space-y-2">
        <Label>Seberapa lama masalah ini sudah Anda alami?</Label>
        <div className="flex flex-wrap gap-2">
          {Q3_DURASI.map(o => (
            <button key={o} type="button" onClick={() => on({ ...data, q3_durasi: o })}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${data.q3_durasi === o ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/50'}`}>
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Q4: Dampak */}
      <div className="space-y-2">
        <Label>Seberapa besar masalah ini berdampak pada kehidupan Anda? <span className="font-medium">(1=tidak signifikan, 5=sangat besar)</span></Label>
        <div className="flex gap-2 items-center">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => on({ ...data, q4_dampak: n })}
              className={`w-10 h-10 rounded-full border text-sm font-medium transition-colors ${data.q4_dampak === n ? 'bg-red-600 text-white border-red-600' : 'hover:bg-muted/50'}`}>
              {n}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">1=tidak signifikan — 5=sangat besar</span>
        </div>
      </div>

      {/* Q5: Area terdampak */}
      <div className="space-y-2">
        <Label>Area kehidupan apa yang paling terdampak?</Label>
        <div className="grid grid-cols-2 gap-2">
          {AREA_OPTIONS.map(o => (
            <label key={o} className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer text-sm transition-colors ${data.q5_area_terdampak.includes(o) ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="checkbox" className="rounded" checked={data.q5_area_terdampak.includes(o)} onChange={() => on({ ...data, q5_area_terdampak: toggle(data.q5_area_terdampak, o) })} />
              {o}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionC({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Bagian C — Harapan & riwayat konseling.</p>

      {/* Q6: Harapan */}
      <div className="space-y-2">
        <Label>Apa yang Anda harapkan dari proses konseling? (pilih semua yang sesuai)</Label>
        <div className="grid grid-cols-2 gap-2">
          {HARAPAN_OPTIONS.map(o => (
            <label key={o} className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer text-sm transition-colors ${data.q6_harapan.includes(o) ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="checkbox" className="rounded" checked={data.q6_harapan.includes(o)} onChange={() => on({ ...data, q6_harapan: toggle(data.q6_harapan, o) })} />
              {o}
            </label>
          ))}
        </div>
      </div>

      {/* Q7: Riwayat */}
      <div className="space-y-2">
        <Label>Apakah Anda pernah berkonsultasi dengan profesional kesehatan mental sebelumnya? *</Label>
        <div className="flex gap-4">
          {[['ya', 'Ya'], ['tidak', 'Tidak'], ['tidak_sure', 'Tidak yakin']].map(([v, l]) => (
            <label key={v} className={`flex items-center gap-2 border rounded px-4 py-2 cursor-pointer text-sm ${data.q7_pernah_konseling === v ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="radio" name="q7" value={v} checked={data.q7_pernah_konseling === v} onChange={() => on({ ...data, q7_pernah_konseling: v })} />
              {l}
            </label>
          ))}
        </div>
        {data.q7_pernah_konseling === 'ya' && (
          <Textarea rows={2} placeholder="Ceritakan pengalaman sebelumnya..." value={data.q7_pernah_konseling_detail} onChange={e => on({ ...data, q7_pernah_konseling_detail: e.target.value })} />
        )}
      </div>
    </div>
  );
}

function SectionD({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
        <p className="text-sm text-red-800">
          <strong>Bagian D — Pertanyaan penting.</strong> Pertanyaan berikut digunakan untuk memastikan keselamatan Anda. Jawaban Anda bersifat rahasia dan hanya ditindaklanjuti jika diperlukan untuk menjaga keselamatan.
        </p>
      </div>

      {/* Q8: Safety threat */}
      <div className="space-y-2">
        <Label>Apakah Anda pernah melihat profesional kesehatan mental karena masalah keamanan/keselamatan (misalnya: ide menyakiti diri sendiri atau orang lain)? *</Label>
        <div className="flex gap-4">
          {[['ya', 'Ya'], ['tidak', 'Tidak'], ['tidak_sure', 'Tidak yakin']].map(([v, l]) => (
            <label key={v} className={`flex items-center gap-2 border rounded px-4 py-2 cursor-pointer text-sm ${data.q8_safety_threat === v ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="radio" name="q8" value={v} checked={data.q8_safety_threat === v} onChange={() => on({ ...data, q8_safety_threat: v })} />
              {l}
            </label>
          ))}
        </div>
      </div>

      {/* Q9: Bantuan segera */}
      <div className="space-y-2">
        <Label>Apakah Anda saat ini memiliki rencana untuk menyakiti diri sendiri atau orang lain? *</Label>
        <div className="flex gap-4">
          {[['ya', 'Ya'], ['tidak', 'Tidak'], ['tidak_sure', 'Tidak yakin']].map(([v, l]) => (
            <label key={v} className={`flex items-center gap-2 border rounded px-4 py-2 cursor-pointer text-sm ${data.q9_bantuan_segera === v ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="radio" name="q9" value={v} checked={data.q9_bantuan_segera === v} onChange={() => on({ ...data, q9_bantuan_segera: v })} />
              {l}
            </label>
          ))}
        </div>
        {(data.q8_safety_threat === 'ya' || data.q9_bantuan_segera === 'ya' || data.q8_safety_threat === 'tidak_sure' || data.q9_bantuan_segera === 'tidak_sure') && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
            <strong>Perhatian:</strong> Berdasarkan jawaban Anda, tim konselor akan segera menindaklanjuti. Jika situasi Anda darurat, silakan hubungi hotline kesehatan mental atau datang ke unit kesehatan terdekat.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionE({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Bagian E — Preferensi jadwal & metode konseling.</p>

      <div className="space-y-2">
        <Label>Waktu yang lebih disukai (pilih semua)</Label>
        <div className="grid grid-cols-2 gap-2">
          {E_WAKTU_OPTIONS.map(o => (
            <label key={o} className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer text-sm ${data.e_waktu.includes(o) ? 'bg-blue-50 border-blue-400' : 'hover:bg-muted/50'}`}>
              <input type="checkbox" className="rounded" checked={data.e_waktu.includes(o)} onChange={() => on({ ...data, e_waktu: toggle(data.e_waktu, o) })} />
              {o}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="e_metode">Metode yang lebih disukai</Label>
          <select id="e_metode" className="border rounded p-2 w-full" value={data.e_metode} onChange={e => on({ ...data, e_metode: e.target.value })}>
            <option value="">Pilih...</option>
            {E_METODE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="e_hari">Hari yang diutamakan</Label>
          <Input id="e_hari" value={data.e_hari} onChange={e => on({ ...data, e_hari: e.target.value })} placeholder="Contoh: Senin-Jumat" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="e_pref">Preferensi Konselor (opsional)</Label>
        <Input id="e_pref" value={data.e_konselor_preferensi} onChange={e => on({ ...data, e_konselor_preferensi: e.target.value })} placeholder="Contoh: Konselor perempuan, yang pernah menangani..." />
      </div>
    </div>
  );
}

function SectionF({ data, on }: { data: FormData; on: (d: FormData) => void }) {
  const isHighPriority = data.q8_safety_threat === 'ya' || data.q9_bantuan_segera === 'ya' || data.q8_safety_threat === 'tidak_sure' || data.q9_bantuan_segera === 'tidak_sure';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p><strong>Kontrak Kerahasiaan</strong></p>
          <p>Semua informasi yang Anda berikan bersifat <strong>rahasia dan aman</strong>. Informasi hanya dapat diakses oleh konselor dan psikolog berlisensi yang bound by confidentiality agreement.</p>
          <p className="text-blue-600">Pengecualian kerahasiaan hanya berlaku jika ada risiko serius terhadap keselamatan Anda atau orang lain.</p>
        </div>
      </div>

      {isHighPriority && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p><strong>Notifikasi Prioritas Tinggi</strong></p>
            <p>Berdasarkan jawaban Anda, pengajuan ini akan ditandai sebagai <strong>prioritas tinggi</strong> dan tim konselor akan segera menindaklanjuti.</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Label>Persetujuan *</Label>
        <div className="space-y-2">
          <label className={`flex items-start gap-3 border rounded p-3 cursor-pointer text-sm ${data.consents.consent_confidentiality ? 'bg-green-50 border-green-400' : 'hover:bg-muted/50'}`}>
            <input type="checkbox" className="mt-0.5 rounded" checked={data.consents.consent_confidentiality}
              onChange={() => on({ ...data, consents: { ...data.consents, consent_confidentiality: !data.consents.consent_confidentiality } })} />
            <span>Saya memahami dan menyetujui kontrak kerahasiaan di atas. *)</span>
          </label>
          <label className={`flex items-start gap-3 border rounded p-3 cursor-pointer text-sm ${data.consents.consent_emergency_protocol ? 'bg-green-50 border-green-400' : 'hover:bg-muted/50'}`}>
            <input type="checkbox" className="mt-0.5 rounded" checked={data.consents.consent_emergency_protocol}
              onChange={() => on({ ...data, consents: { ...data.consents, consent_emergency_protocol: !data.consents.consent_emergency_protocol } })} />
            <span>Saya memahami bahwa dalam situasi darurat (risiko terhadap keselamatan), tim konselor dapat mengambil langkah yang diperlukan meskipun memerlukan pelanggaran kerahasiaan terbatas.)</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export function EmployeeCounselingWizard({ onSubmitted, tenantSlug }: EmployeeCounselingWizardProps) {
  const [step, setStep] = useState(0); // 0-5 (A-F)
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submissionId, setSubmissionId] = useState('');

  const SECTIONS = [
    { label: 'A. Info Karyawan', desc: 'Informasi dasar' },
    { label: 'B. Kebutuhan', desc: 'Alasan & dampak' },
    { label: 'C. Harapan', desc: 'Riwayat & harapan' },
    { label: 'D. Kondisi Mendesak', desc: 'Keselamatan' },
    { label: 'E. Jadwal', desc: 'Preferensi waktu' },
    { label: 'F. Persetujuan', desc: 'Consent & submit' },
  ];

  const validateStep = (s: number): boolean => {
    if (s === 0) return !!form.employee_name.trim();
    if (s === 1) return form.q1_alasan.length > 0;
    if (s === 2) return !!form.q7_pernah_konseling;
    if (s === 3) return !!form.q8_safety_threat && !!form.q9_bantuan_segera;
    if (s === 5) return form.consents.consent_confidentiality && form.consents.consent_emergency_protocol;
    return true;
  };

  const next = () => { if (validateStep(step)) setStep(s => Math.min(s + 1, 5)); else toast.error('Lengkapi pertanyaan wajib terlebih dahulu.'); };
  const back = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep(5)) { toast.error('Lengkapi persetujuan terlebih dahulu.'); return; }
    setSubmitting(true);
    const isHighPriority = ['ya', 'tidak_sure'].includes(form.q8_safety_threat) || ['ya', 'tidak_sure'].includes(form.q9_bantuan_segera);
    const payload = {
      employee_name: form.employee_name,
      unit: form.unit || null,
      position: form.position || null,
      contact_number: form.contact_number || null,
      answers: {
        q1_alasan: form.q1_alasan,
        q2_deskripsi: form.q2_deskripsi,
        q3_durasi: form.q3_durasi,
        q4_dampak: form.q4_dampak,
        q5_area_terdampak: form.q5_area_terdampak,
        q6_harapan: form.q6_harapan,
        q7_pernah_konseling: form.q7_pernah_konseling,
        q7_pernah_konseling_detail: form.q7_pernah_konseling_detail,
        q8_safety_threat: form.q8_safety_threat,
        q9_bantuan_segera: form.q9_bantuan_segera,
        e_waktu: form.e_waktu,
        e_metode: form.e_metode,
        e_hari: form.e_hari,
        e_konselor_preferensi: form.e_konselor_preferensi,
        consents: form.consents,
      },
      is_high_priority: isHighPriority,
    };
    const res = await apiClient<{ submission_id: string }>(`/api/employee-counseling/employee-counseling/submit${tenantSlug ? `?t=${tenantSlug}` : ''}`, { method: 'POST', body: payload });
    setSubmitting(false);
    if (res.success && res.data) {
      setSubmissionId(res.data.submission_id);
      setDone(true);
      onSubmitted?.(res.data.submission_id);
    } else {
      toast.error(res.error || 'Gagal mengirim pengajuan.');
    }
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-600" />
          <CardTitle className="text-xl">Pengajuan Terkirim!</CardTitle>
          <CardDescription className="max-w-sm">
            {['ya', 'tidak_sure'].includes(form.q8_safety_threat) || ['ya', 'tidak_sure'].includes(form.q9_bantuan_segera)
              ? 'Berdasarkan jawaban Anda, tim konselor akan segera menindaklanjuti. Jika Anda membutuhkan bantuan segera, silakan hubungi unit kesehatan terdekat.'
              : 'Terima kasih telah mengajukan konseling. Konselor akan meninjau pengajuan Anda dan menghubungi Anda dalam 1-2 hari kerja.'}
          </CardDescription>
          {submissionId && <Badge variant="outline" className="font-mono text-xs">{submissionId}</Badge>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1">
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} className={`flex-1 h-1.5 rounded-full transition-colors ${i === step ? 'bg-blue-600' : i < step ? 'bg-blue-300' : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{SECTIONS[step].label}</span>
        <span>{step + 1} / {SECTIONS.length}</span>
      </div>

      {/* Card per step */}
      <Card>
        <CardHeader>
          <CardTitle>{SECTIONS[step].label}</CardTitle>
          <CardDescription>{SECTIONS[step].desc}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 0 && <SectionA data={form} on={setForm} />}
          {step === 1 && <SectionB data={form} on={setForm} />}
          {step === 2 && <SectionC data={form} on={setForm} />}
          {step === 3 && <SectionD data={form} on={setForm} />}
          {step === 4 && <SectionE data={form} on={setForm} />}
          {step === 5 && <SectionF data={form} on={setForm} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Kembali
        </Button>
        {step < 5 ? (
          <Button onClick={next}>
            Lanjut <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting} variant="default">
            {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
          </Button>
        )}
      </div>
    </div>
  );
}
