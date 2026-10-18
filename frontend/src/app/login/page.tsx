'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2, CheckCircle2, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

const benefitPoints = [
  'Kasus siswa terstruktur dari laporan sampai penyelesaian',
  'Kontrol akses berbasis peran untuk guru, wali, dan tata usaha',
  'Laporan siap PDF untuk kepala sekolah dan komite',
  'Data dilindungi sesuai UU PDP No. 27 Tahun 2022',
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [captchaData, setCaptchaData] = useState<{ id: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const fetchCaptcha = async () => {
    try {
      const res = await apiClient<{ id: string; question: string }>('/auth/captcha');
      if (res.success && res.data) {
        setCaptchaData(res.data);
      }
    } catch (err) {
      console.error('Gagal memuat captcha', err);
    }
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!captchaData) throw new Error('Verifikasi keamanan belum selesai dimuat. Mohon coba lagi.');

      const loggedInUser = await login(email, password, tenantSlug, captchaData.id, captchaAnswer);

      switch (loggedInUser.role) {
        case 'IT_ADMIN':
          router.push('/dashboard/admin');
          break;
        case 'COUNSELOR':
          router.push('/dashboard/counselor');
          break;
        case 'SCHOOL_HEAD':
          router.push('/dashboard/head');
          break;
        case 'BOARD_MEMBER':
          router.push('/dashboard/board');
          break;
        case 'SCHOOL_NURSE':
          router.push('/dashboard/nurse');
          break;
        case 'CASE_REVIEWER':
          router.push('/dashboard/reviewer');
          break;
        case 'PERSONAL':
          router.push('/dashboard/personal');
          break;
        default:
          router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk. Silakan periksa kembali data Anda.');
      setCaptchaAnswer('');
      await fetchCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panel branding kiri */}
      <aside className="relative hidden overflow-hidden bg-heading lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-button">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="font-heading text-lg font-bold text-primary-foreground">SWIMS</p>
              <p className="text-xs text-primary-foreground/70">Sistem Informasi Wellness &amp; Incident</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md space-y-6">
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-primary-foreground">
            Platform kesejahteraan siswa yang aman, tertata, dan mudah dipantau
          </h2>
          <p className="text-sm leading-relaxed text-primary-foreground/75">
            SWIMS menyatukan laporan insiden, kasus kesehatan, dan catatan perkembangan siswa dalam satu
            sistem yang ramah untuk guru dan wali.
          </p>

          <ul className="space-y-3">
            {benefitPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-primary-foreground/85">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-primary-foreground/60">
          <Lock className="size-3.5" aria-hidden="true" />
          Data terenkripsi saat disimpan dan saat dikirim.
        </p>
      </aside>

      {/* Panel form kanan */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-3 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-button">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </div>
              <div className="leading-tight">
                <p className="font-heading text-lg font-bold text-heading">SWIMS</p>
                <p className="text-xs text-muted-foreground">Sistem Informasi Wellness &amp; Incident</p>
              </div>
            </div>
          </div>

          <Card className="p-8">
            <div className="space-y-1.5">
              <h1 className="page-title">Masuk ke Akun Anda</h1>
              <p className="page-subtitle">
                Gunakan identitas sekolah dan email yang terdaftar untuk melanjutkan.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="tenant-slug">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  Kode Sekolah
                </Label>
                <Input
                  id="tenant-slug"
                  placeholder="contoh: sdn-merdeka-01"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  required
                  autoFocus
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@sekolah.sch.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                  Kata Sandi
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {captchaData ? (
                <div className="space-y-2 rounded-xl border border-border bg-primary-softer p-4">
                  <Label htmlFor="captcha">
                    <Sparkles className="size-4 text-primary" aria-hidden="true" />
                    Verifikasi Keamanan
                  </Label>
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-card px-3 py-2 font-mono text-base font-bold tracking-wider text-primary shadow-card">
                      {captchaData.question}
                    </span>
                    <Input
                      id="captcha"
                      type="text"
                      inputMode="numeric"
                      placeholder="Jawaban"
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      required
                      className="font-mono"
                    />
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-[3px] border-primary-foreground/30 border-t-primary-foreground" />
                    Sedang masuk...
                  </span>
                ) : (
                  'Masuk'
                )}
              </Button>
            </form>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Dengan masuk, Anda menyetujui pengelolaan data sesuai UU PDP No. 27 Tahun 2022.
          </p>
        </div>
      </main>
    </div>
  );
}