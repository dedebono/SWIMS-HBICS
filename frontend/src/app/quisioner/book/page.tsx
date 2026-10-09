'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  IdCard,
  ShieldCheck,
  UserRound,
  VenusAndMars,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconBox } from '@/components/ui/icon-box';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

type Step = 'loading' | 'identity' | 'gender' | 'schedule' | 'done' | 'error' | 'noflex';

interface Slot {
  slot_id: string;
  slot_start: string;
  slot_end: string;
}
interface Counselor {
  user_id: string;
  full_name: string;
  gender: string;
  slots: Slot[];
}

function formatSlot(s: string): string {
  return new Date(s).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BookingInner() {
  const params = useSearchParams();
  const slug = params.get('t') || '';
  const [step, setStep] = useState<Step>('loading');
  const [message, setMessage] = useState('');
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [fullName, setFullName] = useState('');
  const [nik, setNik] = useState('');
  const [staffName, setStaffName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [selectedCounselor, setSelectedCounselor] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ appointment_id: string; scheduled_at: string } | null>(null);

  useEffect(() => {
    if (!slug) {
      setStep('error');
      setMessage('Link tidak valid. Pastikan QR code terbaca dengan benar.');
      return;
    }
    (async () => {
      const cfg = await apiClient<Counselor[]>(`/counseling/booking/config?t=${encodeURIComponent(slug)}`);
      if (!cfg.success || !cfg.data) {
        setStep('error');
        setMessage('Gagal memuat data konselor.');
        return;
      }
      setCounselors(cfg.data);
      setStep('identity');
    })();
  }, [slug]);

  // Counselors with at least one open slot; male staff only see male counselors.
  const visibleCounselors = counselors
    .filter((c) => c.slots.length > 0)
    .filter((c) => gender !== 'male' || c.gender.toLowerCase() === 'male');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Masukkan Nama Lengkap.');
      return;
    }
    if (!nik.trim()) {
      toast.error('Masukkan NIK.');
      return;
    }
    const res = await apiClient<{ valid: boolean; staff_name?: string }>(
      `/counseling/booking/verify?t=${encodeURIComponent(slug)}`,
      { method: 'POST', body: { nik } },
    );
    if (!res.success || !res.data?.valid) {
      toast.error('NIK tidak terdaftar sebagai staff.');
      return;
    }
    setStaffName(res.data.staff_name || fullName);
    setStep('gender');
  };

  const handleGenderNext = () => {
    if (!gender) {
      toast.error('Pilih jenis kelamin.');
      return;
    }
    if (visibleCounselors.length === 0) {
      setStep('noflex');
      return;
    }
    setStep('schedule');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor || !selectedSlot) {
      toast.error('Pilih konselor dan jadwal.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient<{ appointment_id: string; scheduled_at: string }>(
        `/counseling/booking/submit?t=${encodeURIComponent(slug)}`,
        { method: 'POST', body: { nik, full_name: fullName, gender, slot_id: selectedSlot } },
      );
      if (!res.success || !res.data) {
        toast.error(res.error || 'Gagal membooking janji temu.');
        return;
      }
      setResult(res.data);
      setStep('done');
    } catch {
      toast.error('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { key: 'identity', label: 'Identitas' },
    { key: 'gender', label: 'Jenis Kelamin' },
    { key: 'schedule', label: 'Pilih Jadwal' },
    { key: 'done', label: 'Selesai' },
  ];
  const activeStepIndex =
    step === 'identity'
      ? 0
      : step === 'gender'
        ? 1
        : step === 'schedule'
          ? 2
          : step === 'done'
            ? 3
            : 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="space-y-6">
          <PageHeader
            title="Booking Konseling Guru & Staf"
            description="Tanpa login. Cukup isi data diri dan pilih jadwal konselor yang tersedia."
          />

          {(step === 'loading' ||
            step === 'identity' ||
            step === 'gender' ||
            step === 'schedule' ||
            step === 'done') && (
            <Card>
              <CardContent className="pt-5">
                <ol className="flex flex-wrap items-center gap-2">
                  {steps.map((s, i) => {
                    const done = i < activeStepIndex;
                    const active = i === activeStepIndex;
                    return (
                      <li key={s.key} className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
                            active && 'bg-primary text-primary-foreground',
                            done && 'bg-success-soft text-success',
                            !active && !done && 'bg-muted text-muted-foreground'
                          )}
                        >
                          <span className="inline-flex size-4 items-center justify-center rounded-full bg-white/25 text-[0.625rem]">
                            {i + 1}
                          </span>
                          {s.label}
                        </span>
                        {i < steps.length - 1 ? (
                          <span className="h-px w-4 bg-border" aria-hidden="true" />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}

          {step === 'loading' && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12">
                <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                <p className="text-sm font-medium text-muted-foreground">Memuat data konselor…</p>
              </CardContent>
            </Card>
          )}

          {step === 'error' && (
            <Card>
              <CardContent className="pt-5">
                <EmptyState
                  icon={<AlertTriangle className="size-6" />}
                  title="Link tidak dapat diproses"
                  description={message || 'Pastikan QR code terbaca dengan benar lalu coba lagi.'}
                />
              </CardContent>
            </Card>
          )}

          {step === 'noflex' && (
            <Card>
              <CardContent className="pt-5">
                <EmptyState
                  icon={<CalendarClock className="size-6" />}
                  title="Belum ada jadwal tersedia"
                  description="Belum ada konselor dengan jadwal yang cocok. Silakan hubungi admin sekolah untuk informasi lebih lanjut."
                />
              </CardContent>
            </Card>
          )}

          {step === 'identity' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="blue">
                    <IdCard className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Identitas Anda</CardTitle>
                    <CardDescription>Masukkan Nama Lengkap dan NIK (Nomor Induk Karyawan).</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Lengkap</Label>
                    <Input
                      id="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nama Lengkap"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nik">NIK</Label>
                    <Input
                      id="nik"
                      value={nik}
                      onChange={(e) => setNik(e.target.value)}
                      placeholder="Nomor Induk Karyawan"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Lanjut
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {step === 'gender' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="purple">
                    <VenusAndMars className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Pilih Jenis Kelamin</CardTitle>
                    <CardDescription>
                      Halo {staffName}, pilih jenis kelamin Anda agar kami menampilkan konselor yang
                      sesuai.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      { value: 'male', label: 'Laki-laki', tone: 'blue' as const },
                      { value: 'female', label: 'Perempuan', tone: 'pink' as const },
                    ]
                  ).map((opt) => {
                    const checked = gender === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setGender(opt.value as 'male' | 'female')}
                        className={cn(
                          'flex flex-col items-center gap-3 rounded-2xl border p-5 transition-colors',
                          checked
                            ? 'border-primary bg-primary-softer'
                            : 'border-border bg-card hover:bg-muted'
                        )}
                        aria-pressed={checked}
                      >
                        <IconBox tone={checked ? opt.tone : 'slate'}>
                          <UserRound className="size-5" />
                        </IconBox>
                        <span className="text-sm font-semibold text-heading">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                <Button className="w-full" onClick={handleGenderNext}>
                  Lanjut
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 'schedule' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pilih Konselor &amp; Jadwal</CardTitle>
                  <CardDescription>
                    {gender === 'male'
                      ? 'Untuk staf laki-laki, hanya konselor laki-laki yang ditampilkan.'
                      : 'Silakan pilih jadwal yang paling sesuai dengan Anda.'}
                  </CardDescription>
                </CardHeader>
              </Card>

              {visibleCounselors.map((c) => (
                <Card key={c.user_id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>{c.full_name}</CardTitle>
                      <span className="text-xs font-medium text-muted-foreground">
                        {c.slots.length} jadwal tersedia
                      </span>
                    </div>
                    <CardDescription>Konselor</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {c.slots.map((s) => {
                      const checked = selectedSlot === s.slot_id;
                      return (
                        <label
                          key={s.slot_id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                            checked
                              ? 'border-primary bg-primary-softer'
                              : 'border-border bg-card hover:bg-muted'
                          )}
                        >
                          <input
                            type="radio"
                            name="slot"
                            checked={checked}
                            onChange={() => {
                              setSelectedSlot(s.slot_id);
                              setSelectedCounselor(c.user_id);
                            }}
                            className="size-4 accent-primary"
                          />
                          <IconBox tone={checked ? 'blue' : 'slate'} size="sm">
                            <CalendarClock className="size-4" />
                          </IconBox>
                          <span className="flex-1 text-sm text-heading">{formatSlot(s.slot_start)}</span>
                        </label>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}

              {visibleCounselors.length === 0 && (
                <Card>
                  <CardContent className="pt-5">
                    <EmptyState
                      icon={<CalendarClock className="size-6" />}
                      title="Belum ada jadwal tersedia"
                      description="Belum ada konselor dengan jadwal yang cocok. Silakan hubungi admin sekolah."
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="pt-5">
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Memproses…' : 'Booking Sekarang'}
                  </Button>
                </CardContent>
              </Card>
            </form>
          )}

          {step === 'done' && result && (
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <IconBox tone="green" size="lg">
                    <CheckCircle2 className="size-6" />
                  </IconBox>
                  <div className="space-y-1.5">
                    <h2 className="font-heading text-lg font-semibold text-heading">
                      Janji Temu Terjadwal
                    </h2>
                    <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Konselor akan menerima notifikasi. Berikut detail janji temu Anda.
                    </p>
                  </div>
                  <div className="w-full max-w-sm rounded-xl border border-border bg-background p-4">
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-heading">
                      <ShieldCheck className="size-4 shrink-0 text-success" />
                      {formatSlot(result.scheduled_at)}
                    </div>
                  </div>
                  <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <HeartHandshake className="size-3.5 shrink-0" />
                    SDK Harapan Bangsa tetap mendampingi Anda.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
          <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Memuat…</p>
        </div>
      }
    >
      <BookingInner />
    </Suspense>
  );
}