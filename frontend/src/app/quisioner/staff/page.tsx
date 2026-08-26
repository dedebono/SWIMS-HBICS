'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  QuisionerForm,
  type StaffQuestion,
  type StaffAnswer,
  type StaffAnswers,
} from '@/components/quisioner/QuisionerForm';

type Step = 'loading' | 'nik' | 'form' | 'done' | 'disabled' | 'error';

function StaffQuisionerInner() {
  const params = useSearchParams();
  const slug = params.get('t') || '';
  const [step, setStep] = useState<Step>('loading');
  const [message, setMessage] = useState('');
  const [nik, setNik] = useState('');
  const [staffName, setStaffName] = useState('');
  const [threshold, setThreshold] = useState(7);
  const [questions, setQuestions] = useState<StaffQuestion[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, StaffAnswer[]>>({});
  const [answers, setAnswers] = useState<StaffAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; recommendation: 'professional' | 'internal' } | null>(null);

  const totalScore = Object.values(answers).reduce((s, a) => s + (a?.score || 0), 0);
  const recommendation: 'professional' | 'internal' = totalScore >= threshold ? 'professional' : 'internal';

  useEffect(() => {
    if (!slug) {
      setStep('error');
      setMessage('Link tidak valid. Pastikan QR code terbaca dengan benar.');
      return;
    }
    (async () => {
      const cfg = await apiClient<{ threshold: number; target: string }>(
        `/quisioner/staff/config?t=${encodeURIComponent(slug)}`,
      );
      if (!cfg.success || !cfg.data) {
        setStep('error');
        setMessage('Gagal memuat konfigurasi quisioner.');
        return;
      }
      if (cfg.data.target !== 'staff') {
        setStep('disabled');
        return;
      }
      setThreshold(cfg.data.threshold || 7);
      setStep('nik');
    })();
  }, [slug]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nik.trim()) {
      toast.error('Masukkan NIK terlebih dahulu.');
      return;
    }
    const res = await apiClient<{ valid: boolean; staff_name?: string }>(
      `/quisioner/staff/verify-nik?t=${encodeURIComponent(slug)}`,
      { method: 'POST', body: { nik } },
    );
    if (!res.success || !res.data?.valid) {
      toast.error('NIK tidak terdaftar sebagai staff.');
      return;
    }
    setStaffName(res.data.staff_name || '');
    const q = await apiClient<StaffQuestion[]>(`/quisioner/staff/questions?t=${encodeURIComponent(slug)}`);
    if (!q.success || !q.data) {
      toast.error('Gagal memuat pertanyaan.');
      return;
    }
    const map: Record<string, StaffAnswer[]> = {};
    await Promise.all(
      q.data.map(async (qq) => {
        const a = await apiClient<StaffAnswer[]>(
          `/quisioner/staff/questions/${qq.question_id}/answers?t=${encodeURIComponent(slug)}`,
        );
        map[qq.question_id] = a.data || [];
      }),
    );
    setQuestions(q.data);
    setAnswersMap(map);
    setStep('form');
  };

  const onAnswerChange = (qid: string, value: { answer_text?: string; score: number }) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiClient<{ submission_id: string; score: number; recommendation: 'professional' | 'internal' }>(
        `/quisioner/staff/submit?t=${encodeURIComponent(slug)}`,
        {
          method: 'POST',
          body: {
            nik,
            answers: Object.entries(answers).map(([question_id, v]) => ({ question_id, ...v })),
          },
        },
      );
      if (!res.success || !res.data) {
        toast.error(res.error || 'Gagal mengirim quisioner.');
        return;
      }
      setResult({ score: res.data.score, recommendation: res.data.recommendation });
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
          <h1 className="text-2xl font-bold text-foreground">Quisioner Kesejahteraan Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Isi quisioner secara anonim. Data Anda hanya dilihat oleh konselor.
          </p>
        </div>

        {step === 'loading' && <Card><CardContent className="p-8 text-center text-muted-foreground">Memuat...</CardContent></Card>}

        {step === 'error' && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-red-600">{message}</p>
            </CardContent>
          </Card>
        )}

        {step === 'disabled' && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Quisioner staff belum diaktifkan oleh Admin IT. Silakan hubungi administrator sekolah.
              </p>
            </CardContent>
          </Card>
        )}

        {step === 'nik' && (
          <Card>
            <CardHeader>
              <CardTitle>Masukkan NIK</CardTitle>
              <CardDescription>
                Masukkan Nomor Induk Karyawan (NIK) Anda untuk membuka quisioner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nik">Nomor Induk Karyawan (NIK)</Label>
                  <Input
                    id="nik"
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    placeholder="Masukkan NIK"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full">Lanjut</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                Halo <span className="font-semibold text-foreground">{staffName}</span>, silakan isi quisioner berikut.
              </CardContent>
            </Card>
            <QuisionerForm
              questions={questions}
              answersMap={answersMap}
              answers={answers}
              onAnswerChange={onAnswerChange}
              threshold={threshold}
              totalScore={totalScore}
              recommendation={recommendation}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          </div>
        )}

        {step === 'done' && result && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <h2 className="text-xl font-semibold">Terima kasih!</h2>
              <p className="text-muted-foreground">
                Hasil quisioner Anda telah dikirim ke konselor sekolah.
                {result.recommendation === 'professional'
                  ? ' Konselor akan merekomendasikan Anda untuk bertemu tenaga profesional.'
                  : ' Konselor sekolah akan menindaklanjuti jika diperlukan.'}
              </p>
              <p className="text-sm text-muted-foreground">Skor Anda: <span className="font-semibold">{result.score}</span></p>
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
      <StaffQuisionerInner />
    </Suspense>
  );
}
