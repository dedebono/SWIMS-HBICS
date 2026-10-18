'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BadgeCheck,
  BadgeDollarSign,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Link2Off,
  Stethoscope,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBox } from '@/components/ui/icon-box';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';

interface Psychologist {
  psychologist_id: string;
  full_name: string;
  expertise: string;
  photo_url: string | null;
  consultation_fee: number;
}

interface TokenRecord {
  token_id: string;
  choice_status: string;
  selected_psychologist_id: string | null;
  payment_amount: number | null;
  confirmed_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu Pilihan',
  school_psychologist: 'Psikolog Sekolah',
  private_psychologist: 'Psikolog Pribadi',
  psychologist_selected: 'Psikolog Dipilih',
  payment_pending: 'Menunggu Pembayaran',
  payment_confirmed: 'Pembayaran Dikonfirmasi',
  schedule_confirmed: 'Jadwal Terkonfirmasi',
  expired: 'Tautan Kedaluwarsa',
};

const FLOW_STEPS = [
  { key: 'pending', label: 'Pilihan' },
  { key: 'psychologist_selected', label: 'Psikolog' },
  { key: 'payment_confirmed', label: 'Pembayaran' },
  { key: 'schedule_confirmed', label: 'Jadwal' },
];

function stepIndexFor(status?: string | null): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'school_psychologist':
    case 'private_psychologist':
      return 1;
    case 'psychologist_selected':
    case 'payment_pending':
      return 2;
    case 'payment_confirmed':
      return 3;
    case 'schedule_confirmed':
      return 4;
    default:
      return 0;
  }
}

export default function PsychologistReferralPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tenantSlug = searchParams.get('t');

  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [record, setRecord] = useState<TokenRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgePrivate, setAcknowledgePrivate] = useState(false);

  const apiBase = `/api/public/psychologist-referral`;

  const fetchData = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${apiBase}/psychologists?t=${tenantSlug}&token=${token}`);
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setPsychologists(json.data.psychologists || []);
      setRecord(json.data.tokenRecord);
    } catch {
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [token, tenantSlug, apiBase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const postChoice = async (choice: 'school_psychologist' | 'private_psychologist') => {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/choice?t=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, choice }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setRecord(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  const selectPsychologist = async (psychId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/select-psychologist?t=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, psychologistId: psychId }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setRecord(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPayment = async () => {
    setSubmitting(true);
    try {
      await fetch(`${apiBase}/set-payment-pending?t=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const res = await fetch(`${apiBase}/confirm-payment?t=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setRecord(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSchedule = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/confirm-schedule?t=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }
      setRecord(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  const formatRupiah = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<Link2Off className="size-6" />}
              title="Tautan tidak valid"
              description="Silakan gunakan tautan yang dikirim melalui WhatsApp dari sekolah."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const validStatuses = ['pending','school_psychologist','private_psychologist','psychologist_selected','payment_pending','payment_confirmed','schedule_confirmed'];
  const isExpiredOrInvalid = !record || (!validStatuses.includes(record.choice_status) && record.choice_status !== 'expired');

  if (isExpiredOrInvalid) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<AlertTriangle className="size-6" />}
              title="Tautan kedaluwarsa"
              description="Tautan ini sudah tidak berlaku. Silakan hubungi sekolah untuk meminta tautan baru."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedPsychologist = psychologists.find(p => p.psychologist_id === record?.selected_psychologist_id);
  const activeStep = stepIndexFor(record?.choice_status);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="space-y-6">
          <PageHeader
            title="Sistem Rujukan Psikolog"
            description="SDK Harapan Bangsa"
            actions={
              <StatusBadge
                tone={severityTone(record?.choice_status)}
                label={STATUS_LABELS[record?.choice_status ?? ''] ?? record?.choice_status}
              />
            }
          />

          {record && (
            <Card>
              <CardContent className="pt-5">
                <ol className="flex flex-wrap items-center gap-2">
                  {FLOW_STEPS.map((s, i) => {
                    const done = activeStep > i;
                    const active = activeStep === i;
                    return (
                      <li key={s.key} className="flex items-center gap-2">
                        <span
                          className={[
                            'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
                            active ? 'bg-primary-strong text-primary-foreground' : '',
                            done ? 'bg-success-soft text-success' : '',
                            !active && !done ? 'bg-muted text-muted-foreground' : '',
                          ].join(' ')}
                        >
                          <span className="inline-flex size-4 items-center justify-center rounded-full bg-white/25 text-[0.625rem]">
                            {i + 1}
                          </span>
                          {s.label}
                        </span>
                        {i < FLOW_STEPS.length - 1 ? (
                          <span className="h-px w-4 bg-border" aria-hidden="true" />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* STEP 1: Menunggu Pilihan — Pemberitahuan awal */}
          {record?.choice_status === 'pending' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="blue">
                    <Stethoscope className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Rekomendasi Konsultasi dengan Psikolog</CardTitle>
                    <CardDescription>
                      Berdasarkan hasil asesmen dan pendampingan yang telah dilakukan, sekolah
                      merekomendasikan konsultasi lanjutan dengan Psikolog untuk mendukung
                      perkembangan dan kebutuhan anak.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-semibold text-heading">Bapak/Ibu dapat memilih:</p>
                <Button
                  className="h-auto w-full justify-start gap-2.5 py-4 text-left"
                  variant="outline"
                  onClick={() => postChoice('school_psychologist')}
                  disabled={submitting}
                >
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <span className="text-sm">Ya, lihat Psikolog Rekomendasi Sekolah</span>
                </Button>
                <Button
                  className="h-auto w-full justify-start gap-2.5 py-4 text-left"
                  variant="outline"
                  onClick={() => postChoice('private_psychologist')}
                  disabled={submitting}
                >
                  <XCircle className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">Tidak, saya akan menggunakan Psikolog Pribadi</span>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 2a: Psikolog Pribadi */}
          {record?.choice_status === 'private_psychologist' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="purple">
                    <UserRound className="size-5" />
                  </IconBox>
                  <CardTitle>Konsultasi dengan Psikolog Pribadi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-secondary-text">
                  Terima kasih atas konfirmasi Bapak/Ibu. Apabila anak anda melakukan konsultasi dengan
                  Psikolog pribadi, kami mengharapkan kesediaan Bapak/Ibu untuk menyampaikan kepada
                  sekolah hasil atau catatan konsultasi yang relevan dengan kebutuhan pendampingan anak
                  di sekolah. Informasi tersebut akan digunakan secara terbatas untuk membantu sekolah
                  memberikan dukungan yang sesuai bagi Ananda.
                </p>
                {!acknowledgePrivate ? (
                  <Button onClick={() => setAcknowledgePrivate(true)} className="w-full">
                    Saya Mengerti
                  </Button>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl border border-border bg-success-soft p-3.5 text-sm text-secondary-text">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      Terima kasih. Sekolah akan menunggu informasi dari Bapak/Ibu.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 2b: Pilih Psikolog Sekolah */}
          {record?.choice_status === 'school_psychologist' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="teal">
                    <Stethoscope className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Pilih Psikolog Rekomendasi Sekolah</CardTitle>
                    <CardDescription>
                      Silakan memilih Psikolog yang sesuai dengan kebutuhan anak anda.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {psychologists.length === 0 ? (
                  <EmptyState
                    icon={<UserRound className="size-6" />}
                    title="Belum ada psikolog rekomendasi"
                    description="Belum ada psikolog rekomendasi sekolah yang terdaftar. Silakan hubungi sekolah untuk informasi lebih lanjut."
                  />
                ) : (
                  psychologists.map((p) => (
                    <div
                      key={p.psychologist_id}
                      className="flex flex-wrap items-start gap-3.5 rounded-xl border border-border bg-card p-4"
                    >
                      <IconBox tone="purple">
                        <UserRound className="size-5" />
                      </IconBox>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm font-semibold text-heading">{p.full_name}</p>
                        <p className="text-xs text-muted-foreground">{p.expertise}</p>
                        <p className="pt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-heading">
                          <CircleDollarSign className="size-3.5 text-primary" />
                          {formatRupiah(p.consultation_fee)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => selectPsychologist(p.psychologist_id)}
                        disabled={submitting}
                      >
                        Pilih
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Psikolog Dipilih → Pembayaran */}
          {record?.choice_status === 'psychologist_selected' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="green">
                    <BadgeCheck className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Psikolog Berhasil Dipilih</CardTitle>
                    <CardDescription>
                      Bapak/Ibu telah memilih{' '}
                      <strong className="text-heading">{selectedPsychologist?.full_name}</strong> untuk
                      mendampingi anak anda.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-warning-soft p-3.5">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-heading">
                      Silakan melakukan pembayaran sebesar{' '}
                      <strong>{formatRupiah(record.payment_amount ?? 0)}</strong> sesuai petunjuk.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Setelah pembayaran berhasil dikonfirmasi, Bapak/Ibu dapat melanjutkan ke
                      penjadwalan.
                    </p>
                  </div>
                </div>
                <Button onClick={confirmPayment} disabled={submitting} className="w-full">
                  <BadgeDollarSign className="size-4" />
                  {submitting ? 'Memproses…' : 'Konfirmasi Pembayaran'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 3b: Pembayaran Diproses */}
          {record?.choice_status === 'payment_pending' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="yellow">
                    <Wallet className="size-5" />
                  </IconBox>
                  <CardTitle>Pembayaran sedang Diproses</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Pembayaran sedang diproses. Mohon tunggu konfirmasi dari sekolah sebelum melanjutkan
                  ke penjadwalan.
                </p>
              </CardContent>
            </Card>
          )}

          {/* STEP 4: Pembayaran Dikonfirmasi → Jadwal */}
          {record?.choice_status === 'payment_confirmed' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="green">
                    <CircleDollarSign className="size-5" />
                  </IconBox>
                  <div className="space-y-0.5">
                    <CardTitle>Pembayaran Berhasil Dikonfirmasi</CardTitle>
                    <CardDescription>
                      Pembayaran konsultasi telah berhasil dikonfirmasi. Silakan memilih jadwal
                      konsultasi yang tersedia.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-success-soft p-3.5 text-sm text-secondary-text">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>
                    Pembayaran telah dikonfirmasi. Silakan klik di bawah untuk memilih jadwal.
                  </span>
                </div>
                <Button onClick={confirmSchedule} disabled={submitting} className="w-full">
                  <CalendarClock className="size-4" />
                  {submitting ? 'Memproses…' : 'Lihat Jadwal Tersedia'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* STEP 5: Jadwal Terkonfirmasi */}
          {record?.choice_status === 'schedule_confirmed' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <IconBox tone="green" size="lg">
                    <CalendarCheck2 className="size-6" />
                  </IconBox>
                  <CardTitle>Jadwal Konsultasi Terkonfirmasi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Jadwal konsultasi Ananda telah berhasil dikonfirmasi.
                </p>
                <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Psikolog</dt>
                    <dd className="text-sm font-semibold text-heading">
                      {selectedPsychologist?.full_name}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Biaya</dt>
                    <dd className="text-sm font-semibold text-heading">
                      {formatRupiah(record.payment_amount ?? 0)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Status</dt>
                    <dd>
                      <StatusBadge
                        tone={severityTone(record.choice_status)}
                        label={STATUS_LABELS[record.choice_status] ?? record.choice_status}
                      />
                    </dd>
                  </div>
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Mohon hadir sesuai jadwal. Apabila terdapat perubahan, silakan lakukan penjadwalan
                  ulang.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}