'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  IdCard,
  ShieldCheck,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  EmployeeCounselingWizard,
  buildSubmissionPayload,
  EMPTY_FORM,
  type FormData,
} from '@/components/employee-counseling/EmployeeCounselingWizard';
import { cn } from '@/lib/utils';

/**
 * Combined counseling intake — ONE flow instead of two disconnected ones.
 *
 * Before this, `/book/staff` wrote an appointment and
 * `/quisioner/employee-counseling` wrote a counseling intake, with nothing
 * linking them: the counselor saw intakes with no schedule, and bookings that
 * never appeared in the counseling dashboard.
 *
 * Here an employee verifies their NIK, fills the questionnaire, and picks a slot;
 * a single POST creates both records and links them, so the counselor dashboard
 * shows one row per person carrying both the schedule and the answers.
 *
 * The questionnaire is still submitted on its own via the old link when someone
 * only wants to report something without booking — see `app/quisioner/employee-counseling`.
 */

type Phase = 'loading' | 'nik' | 'questionnaire' | 'schedule' | 'done' | 'error' | 'noflex';

interface Slot {
  slot_id: string;
  slot_start: string;
  slot_end: string;
}
interface Counselor {
  user_id: string;
  full_name: string;
  gender: string;
  /** Signed 128px WebP URL, or null when the counselor has no photo. */
  thumb_url?: string | null;
  slots: Slot[];
}
interface Identity {
  valid: boolean;
  staff_name?: string;
  gender?: string;
  email?: string;
  has_open_intake?: boolean;
}
interface CombinedResult {
  submission_id: string;
  appointment_id: string;
  counselor_name: string;
  scheduled_at: string;
  is_high_priority: boolean;
}

const genderLabel = (g?: string) =>
  g === 'male' ? 'Laki-laki' : g === 'female' ? 'Perempuan' : '';

function formatSlot(s: string, e?: string): string {
  const d = new Date(s);
  const date = d.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const from = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const to = e ? new Date(e).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
  return `${date}, ${from}${to ? `–${to}` : ''}`;
}

/** High-priority mirror of the server's detectHighPriority, for the early warning. */
function looksUrgent(f: FormData): boolean {
  return ['ya', 'tidak_yakin', 'tidak_sure'].includes(f.q8_safety_threat)
    || ['ya', 'tidak_yakin', 'tidak_sure'].includes(f.q9_bantuan_segera);
}

function CombinedIntakeInner() {
  const params = useSearchParams();
  const slug = params.get('t') || '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [counselors, setCounselors] = useState<Counselor[]>([]);

  const [nik, setNik] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [formValid, setFormValid] = useState(false);

  const [selectedCounselor, setSelectedCounselor] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CombinedResult | null>(null);

  useEffect(() => {
    if (!slug) {
      setPhase('error');
      setMessage('Link tidak valid. Pastikan QR code terbaca dengan benar.');
      return;
    }
    (async () => {
      const cfg = await apiClient<Counselor[]>(`/counseling/booking/config?t=${encodeURIComponent(slug)}`);
      if (!cfg.success || !cfg.data) {
        setPhase('error');
        setMessage('Gagal memuat data konselor.');
        return;
      }
      setCounselors(cfg.data);
      setPhase('nik');
    })();
  }, [slug]);

  const gender = identity?.gender?.toLowerCase() ?? '';

  // Same rule the server enforces: a male employee only sees male counselors, so
  // the page never offers a choice that will be rejected on submit.
  const visibleCounselors = useMemo(
    () => counselors
      .filter((c) => c.slots.length > 0)
      .filter((c) => !gender || !c.gender || c.gender.toLowerCase() === gender),
    [counselors, gender],
  );

  const urgent = looksUrgent(form);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nik.trim()) {
      toast.error('Masukkan NIK.');
      return;
    }
    const res = await apiClient<Identity>(`/counseling/booking/verify-identity?t=${encodeURIComponent(slug)}`, {
      method: 'POST',
      body: { nik },
    });
    if (!res.success || !res.data?.valid) {
      toast.error('NIK tidak terdaftar sebagai staff aktif.');
      return;
    }
    setIdentity(res.data);
    // Pre-fill Section A from the real record — nobody should re-type their own
    // unit and phone number when the school already has it.
    // Only the name is pre-filled: `users` carries no unit/position/phone column,
    // so those stay for the employee to type once.
    setForm((prev) => ({ ...prev, employee_name: res.data!.staff_name ?? '' }));

    const hasMatch = counselors.some(
      (c) => c.slots.length > 0 && (!gender || !c.gender || c.gender.toLowerCase() === gender),
    );
    if (!hasMatch) setPhase('noflex');
    else setPhase('questionnaire');
  };

  const goToSchedule = () => {
    if (!formValid) {
      toast.error('Lengkapi seluruh bagian kuisioner terlebih dahulu.');
      return;
    }
    setPhase('schedule');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor || !selectedSlot) {
      toast.error('Pilih konselor dan jadwal.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...buildSubmissionPayload(form),
        nik,
        slot_id: selectedSlot,
      };
      const res = await apiClient<CombinedResult>(
        `/counseling/booking/submit-combined?t=${encodeURIComponent(slug)}`,
        { method: 'POST', body: payload },
      );
      if (!res.success || !res.data) {
        toast.error(res.error || 'Gagal mengirim pengajuan.');
        return;
      }
      setResult(res.data);
      setPhase('done');
    } catch {
      toast.error('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const PHASES: { key: string; label: string }[] = [
    { key: 'nik', label: 'Verifikasi Identitas' },
    { key: 'questionnaire', label: 'Kuisioner' },
    { key: 'schedule', label: 'Pilih Jadwal' },
  ];
  const activeIndex =
    phase === 'nik' ? 0 : phase === 'questionnaire' ? 1 : phase === 'schedule' || phase === 'done' ? 2 : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* ── Header ── */}
      <div className="text-center">
        <HeartHandshake className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="text-2xl font-bold text-heading">Pengajuan Konseling Karyawan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verifikasi identitas, isi kuisioner, lalu pilih jadwal dalam satu langkah.
        </p>
      </div>

      {/* ── Progress ── */}
      {(phase === 'nik' || phase === 'questionnaire' || phase === 'schedule' || phase === 'done') && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {PHASES.map((p, i) => (
              <div
                key={p.key}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < activeIndex ? 'bg-primary/50' : i === activeIndex ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {PHASES.map((p, i) => (
              <span key={p.key} className={cn(i === activeIndex && 'font-semibold text-heading')}>
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {phase === 'loading' && <p className="text-center text-sm text-muted-foreground">Memuat data…</p>}

      {phase === 'error' && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-danger">{message}</p>
          </CardContent>
        </Card>
      )}

      {phase === 'noflex' && (
        <Card>
          <CardContent className="p-10 text-center">
            <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-heading">Belum ada jadwal tersedia</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Saat ini belum ada konselor yang membuka slot untuk Anda. Silakan coba lagi nanti.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: NIK ── */}
      {phase === 'nik' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5 text-primary" /> Verifikasi Identitas
            </CardTitle>
            <CardDescription>
              Masukkan NIK Anda untuk memastikan pengajuan ini terhubung ke akun Anda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nik">NIK (Nomor Induk Karyawan)</Label>
                <Input
                  id="nik"
                  inputMode="numeric"
                  placeholder="Masukkan NIK Anda"
                  value={nik}
                  onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 32))}
                  className="max-w-xs"
                  autoComplete="off"
                />
              </div>
              <Button type="submit">Lanjut</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: questionnaire ── */}
      {phase === 'questionnaire' && (
        <div className="space-y-4">
          {identity && (
            <Card className="border-primary/30 bg-primary-softer">
              <CardContent className="flex items-center gap-3 p-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-heading">NIK terverifikasi — {identity.staff_name}</p>
                  <p className="text-muted-foreground">
                    {genderLabel(identity.gender) || 'Data telah dimuat dari akun Anda'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {urgent && (
            <Card className="border-danger/40 bg-danger-soft">
              <CardContent className="p-4 text-sm text-danger">
                Berdasarkan jawaban Anda, pengajuan ini akan ditandai <strong>Prioritas Tinggi</strong>{' '}
                dan langsung sampai ke konselor. Jika Anda dalam bahaya segera, hubungi unit kesehatan
                sekolah — jangan menunggu jadwal.
              </CardContent>
            </Card>
          )}

          <EmployeeCounselingWizard
            embedded
            tenantSlug={slug}
            initialData={{ ...form }}
            onFormChange={setForm}
            onValidityChange={(valid) => setFormValid(valid)}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setPhase('nik')}>Kembali</Button>
            <Button onClick={goToSchedule} disabled={!formValid}>
              Lanjut ke Pilih Jadwal
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: schedule ── */}
      {phase === 'schedule' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" /> Pilih Jadwal Konseling
              </CardTitle>
              <CardDescription>
                {gender === 'male'
                  ? 'Untuk menjaga privasi, staff laki-laki hanya dapat memilih konselor laki-laki.'
                  : 'Pilih konselor dan waktu yang tersedia.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Konselor</Label>
                {visibleCounselors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada konselor dengan slot terbuka.</p>
                ) : (
                  <div className="space-y-2">
                    {visibleCounselors.map((c) => (
                      <button
                        key={c.user_id}
                        type="button"
                        onClick={() => { setSelectedCounselor(c.user_id); setSelectedSlot(''); }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors',
                          selectedCounselor === c.user_id
                            ? 'border-primary bg-primary-softer'
                            : 'border-border hover:border-primary/40',
                        )}
                      >
                        <UserAvatar
                          name={c.full_name}
                          src={c.thumb_url}
                          size="lg"
                          className="size-12"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-heading">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {genderLabel(c.gender) || 'Konselor'} · {c.slots.length} jadwal tersedia
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCounselor && (
                <div className="space-y-2">
                  <Label>Waktu</Label>
                  <div className="space-y-2">
                    {visibleCounselors
                      .find((c) => c.user_id === selectedCounselor)
                      ?.slots.map((s) => (
                        <button
                          key={s.slot_id}
                          type="button"
                          onClick={() => setSelectedSlot(s.slot_id)}
                          className={cn(
                            'w-full rounded-xl border-2 p-3 text-left text-sm transition-colors',
                            selectedSlot === s.slot_id
                              ? 'border-primary bg-primary-softer font-medium text-heading'
                              : 'border-border hover:border-primary/40',
                          )}
                        >
                          {formatSlot(s.slot_start, s.slot_end)}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setPhase('questionnaire')}>Kembali</Button>
            <Button type="submit" disabled={!selectedSlot || submitting}>
              {submitting ? 'Mengirim…' : 'Kirim Pengajuan'}
            </Button>
          </div>
        </form>
      )}

      {/* ── Done ── */}
      {phase === 'done' && result && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
            <CardTitle className="text-xl">Pengajuan Terkirim!</CardTitle>
            <p className="max-w-md text-sm text-muted-foreground">
              Pengajuan Anda sudah tercatat dan dijadwalkan dengan{' '}
              <strong>{result.counselor_name}</strong> pada{' '}
              <strong>{new Date(result.scheduled_at).toLocaleString('id-ID')}</strong>.
            </p>
            {result.is_high_priority && (
              <p className="max-w-md text-sm font-medium text-danger">
                Pengajuan Anda ditandai Prioritas Tinggi dan akan segera ditindaklanjuti.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Konselor dapat melihat isi kuisioner dan jadwal Anda secara langsung.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CombinedIntakePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Memuat…</p>}>
      <CombinedIntakeInner />
    </Suspense>
  );
}