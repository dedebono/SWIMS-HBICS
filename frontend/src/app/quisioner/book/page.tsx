'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, CalendarClock, ShieldCheck } from 'lucide-react';

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

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 p-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Booking Konseling Guru &amp; Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tanpa login. Cukup isi NIK dan pilih jadwal konselor.
          </p>
        </div>

        {step === 'loading' && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">Memuat...</CardContent>
          </Card>
        )}

        {step === 'error' && (
          <Card>
            <CardContent className="p-8 text-center text-red-600">{message}</CardContent>
          </Card>
        )}

        {step === 'noflex' && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Belum ada konselor dengan jadwal tersedia. Silakan hubungi admin sekolah.
            </CardContent>
          </Card>
        )}

        {step === 'identity' && (
          <Card>
            <CardHeader>
              <CardTitle>Identitas Anda</CardTitle>
              <CardDescription>Masukkan Nama Lengkap dan NIK (Nomor Induk Karyawan).</CardDescription>
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
              <CardTitle>Pilih Jenis Kelamin</CardTitle>
              <CardDescription>Halo {staffName}, pilih jenis kelamin Anda.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`rounded-lg border p-4 text-center ${gender === 'male' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  Laki-laki
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`rounded-lg border p-4 text-center ${gender === 'female' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  Perempuan
                </button>
              </div>
              <Button className="w-full" onClick={handleGenderNext}>
                Lanjut
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'schedule' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {visibleCounselors.map((c) => (
              <Card key={c.user_id}>
                <CardHeader>
                  <CardTitle className="text-base">{c.full_name}</CardTitle>
                  <CardDescription>Konselor</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {c.slots.map((s) => {
                    const checked = selectedSlot === s.slot_id;
                    return (
                      <label
                        key={s.slot_id}
                        className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary' : 'bg-background hover:bg-muted/50'}`}
                      >
                        <input
                          type="radio"
                          name="slot"
                          checked={checked}
                          onChange={() => {
                            setSelectedSlot(s.slot_id);
                            setSelectedCounselor(c.user_id);
                          }}
                        />
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">{formatSlot(s.slot_start)}</span>
                      </label>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Memproses...' : 'Booking Sekarang'}
            </Button>
          </form>
        )}

        {step === 'done' && result && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <h2 className="text-xl font-semibold">Janji Temu Terjadwal!</h2>
              <p className="text-muted-foreground">
                Konselor akan menerima notifikasi. Berikut detail janji temu Anda:
              </p>
              <p className="text-sm">
                <ShieldCheck className="inline h-4 w-4 mr-1 text-green-600" />
                {formatSlot(result.scheduled_at)}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Memuat...</div>}>
      <BookingInner />
    </Suspense>
  );
}
