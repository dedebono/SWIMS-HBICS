'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

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
  expired: 'Link Expired',
};

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Link tidak valid. Silakan gunakan link yang dikirim melalui WhatsApp.
          </CardContent>
        </Card>
      </div>
    );
  }

  const validStatuses = ['pending','school_psychologist','private_psychologist','psychologist_selected','payment_pending','payment_confirmed','schedule_confirmed'];
  const isExpiredOrInvalid = !record || (!validStatuses.includes(record.choice_status) && record.choice_status !== 'expired');

  if (isExpiredOrInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Link Expired</CardTitle></CardHeader>
          <CardContent className="text-muted-foreground">
            Link ini sudah tidak berlaku. Silakan hubungi sekolah untuk link baru.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedPsychologist = psychologists.find(p => p.psychologist_id === record?.selected_psychologist_id);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center py-4">
          <h1 className="text-xl font-bold text-slate-800">Sistem Rujukan Psikolog</h1>
          <p className="text-sm text-muted-foreground">SDK Harapan Bangsa</p>
        </div>

        {/* STEP 1: Pending — Initial Notification */}
        {record?.choice_status === 'pending' && (
          <Card>
            <CardHeader>
              <CardTitle>Rekomendasi Konsultasi dengan Psikolog</CardTitle>
              <CardDescription>
                Berdasarkan hasil asesmen dan pendampingan yang telah dilakukan, sekolah merekomendasikan
                konsultasi lanjutan dengan Psikolog untuk mendukung perkembangan dan kebutuhan anak.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">Bapak/Ibu dapat memilih:</p>
              <Button
                className="w-full justify-start text-left h-auto py-4"
                variant="outline"
                onClick={() => postChoice('school_psychologist')}
                disabled={submitting}
              >
                <span className="text-green-600 font-bold mr-2">✓</span>
                YA, lihat Psikolog Rekomendasi Sekolah
              </Button>
              <Button
                className="w-full justify-start text-left h-auto py-4"
                variant="outline"
                onClick={() => postChoice('private_psychologist')}
                disabled={submitting}
              >
                <span className="text-blue-600 font-bold mr-2">✗</span>
                TIDAK, saya akan menggunakan Psikolog Pribadi
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP 2a: Private Psychologist */}
        {record?.choice_status === 'private_psychologist' && (
          <Card>
            <CardHeader>
              <CardTitle>Konsultasi dengan Psikolog Pribadi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Terima kasih atas konfirmasi Bapak/Ibu.<br /><br />
                Apabila anak anda melakukan konsultasi dengan Psikolog pribadi, kami mengharapkan
                kesediaan Bapak/Ibu untuk menyampaikan kepada sekolah hasil atau catatan konsultasi
                yang relevan dengan kebutuhan pendampingan anak di sekolah.<br /><br />
                Informasi tersebut akan digunakan secara terbatas untuk membantu sekolah memberikan
                dukungan yang sesuai bagi Ananda.
              </p>
              {!acknowledgePrivate ? (
                <Button onClick={() => setAcknowledgePrivate(true)} className="w-full">
                  Saya Mengerti
                </Button>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                  ✓ Terima kasih. Sekolah akan menunggu informasi dari Bapak/Ibu.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 2b: Choose School Psychologist */}
        {record?.choice_status === 'school_psychologist' && (
          <Card>
            <CardHeader>
              <CardTitle>Pilih Psikolog Rekomendasi Sekolah</CardTitle>
              <CardDescription>
                Silakan memilih Psikolog yang sesuai dengan kebutuhan anak anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {psychologists.map(p => (
                <div key={p.psychologist_id} className="border rounded-lg p-4 flex gap-4 items-start">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-lg">
                    👤
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.expertise}</p>
                    <p className="text-sm font-semibold mt-1">{formatRupiah(p.consultation_fee)}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => selectPsychologist(p.psychologist_id)}
                    disabled={submitting}
                  >
                    Pilih
                  </Button>
                </div>
              ))}
              {psychologists.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada psikolog rekomendasi sekolah.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Psychologist Selected → Payment */}
        {record?.choice_status === 'psychologist_selected' && (
          <Card>
            <CardHeader>
              <CardTitle>Psikolog Berhasil Dipilih</CardTitle>
              <CardDescription>
                Bapak/Ibu telah memilih <strong>{selectedPsychologist?.full_name}</strong> untuk mendampingi anak anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-sm font-medium text-amber-800">
                  Silakan melakukan pembayaran sebesar <strong>{formatRupiah(record.payment_amount ?? 0)}</strong> sesuai petunjuk.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Setelah pembayaran berhasil dikonfirmasi, Bapak/Ibu dapat melanjutkan ke penjadwalan.
                </p>
              </div>
              <Button onClick={confirmPayment} disabled={submitting} className="w-full">
                {submitting ? 'Memproses...' : 'Konfirmasi Pembayaran'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP 3b: Payment Pending */}
        {record?.choice_status === 'payment_pending' && (
          <Card>
            <CardHeader><CardTitle>Pembayaran sedang Diproses</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pembayaran sedang diproses. Mohon tunggu konfirmasi dari sekolah.
              </p>
            </CardContent>
          </Card>
        )}

        {/* STEP 4: Payment Confirmed → Schedule */}
        {record?.choice_status === 'payment_confirmed' && (
          <Card>
            <CardHeader>
              <CardTitle>Pembayaran Berhasil Dikonfirmasi</CardTitle>
              <CardDescription>
                Pembayaran konsultasi telah berhasil dikonfirmasi.
                Silakan memilih jadwal konsultasi yang tersedia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                ✓ Pembayaran telah dikonfirmasi. Silakan klik di bawah untuk memilih jadwal.
              </div>
              <Button onClick={confirmSchedule} disabled={submitting} className="w-full">
                {submitting ? 'Memproses...' : 'Lihat Jadwal Tersedia'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP 5: Schedule Confirmed */}
        {record?.choice_status === 'schedule_confirmed' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-green-700">✓ Jadwal Konsultasi Terkonfirmasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Jadwal konsultasi Ananda telah berhasil dikonfirmasi.
              </p>
              <div className="bg-slate-100 rounded p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Psikolog:</span>
                  <span className="font-medium">{selectedPsychologist?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Biaya:</span>
                  <span className="font-medium">{formatRupiah(record.payment_amount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="default" className="text-xs">Jadwal Terkonfirmasi</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Mohon hadir sesuai jadwal. Apabila terdapat perubahan, silakan lakukan penjadwalan ulang.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Status badge */}
        {record && (
          <div className="text-center">
            <Badge variant="outline" className="text-xs">
              Status: {STATUS_LABELS[record.choice_status] ?? record.choice_status}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}