'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const benefitPoints = [
  'Pendaftaran sekali, langsung dapat akun Admin IT sekolah',
  'Data siswa, guru, dan wali dapat diimpor bertahap',
  'Panduan awal dan pendampingan langsung dari tim kami',
  'Mulai tanpa biaya untuk sekolah yang baru memulai',
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    tenant_name: '',
    slug: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient<{ tenantId: string }>('/onboarding/register', {
        method: 'POST',
        body: formData,
      });

      if (response.success) {
        toast.success('Pendaftaran berhasil. Selamat datang di SWIMS!');
        router.push('/login');
      } else {
        const message = response.error || 'Pendaftaran gagal. Silakan coba lagi.';
        setError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Pendaftaran gagal. Silakan periksa koneksi Anda lalu coba lagi.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1fr_1.1fr]">
      {/* Panel branding kiri */}
      <aside className="relative hidden overflow-hidden bg-heading lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-20 top-10 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-10 size-80 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-button">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="font-heading text-lg font-bold text-primary-foreground">SWIMS</p>
            <p className="text-xs text-primary-foreground/70">Sistem Informasi Wellness &amp; Incident</p>
          </div>
        </div>

        <div className="relative max-w-md space-y-6">
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-primary-foreground">
            Daftarkan sekolah Anda, mulai dari satu langkah sederhana
          </h2>
          <p className="text-sm leading-relaxed text-primary-foreground/75">
            Setelah pendaftaran, Anda akan mendapat akun Admin IT untuk mengatur guru, kelas, dan seluruh
            alur penanganan kasus siswa.
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
          Seluruh data instansi tersimpan di server sekolah Anda.
        </p>
      </aside>

      {/* Panel form kanan */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-lg space-y-6">
          <div className="lg:hidden">
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
              <h1 className="page-title">Daftar Instansi Sekolah</h1>
              <p className="page-subtitle">
                Lengkapi data sekolah dan akun Admin IT untuk memulai penggunaan SWIMS.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="tenant_name">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  Nama Sekolah
                </Label>
                <Input
                  id="tenant_name"
                  name="tenant_name"
                  placeholder="contoh: SD Negeri Merdeka 01"
                  required
                  value={formData.tenant_name}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  Kode Sekolah
                </Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="contoh: sdn-merdeka-01"
                  required
                  value={formData.slug}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setFormData((prev) => ({ ...prev, slug: val }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Kode ini menjadi alamat unik masuk untuk seluruh pengguna sekolah Anda.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_name">
                  <User className="size-4 text-muted-foreground" aria-hidden="true" />
                  Nama Lengkap Admin IT
                </Label>
                <Input
                  id="admin_name"
                  name="admin_name"
                  placeholder="contoh: Budi Santoso"
                  required
                  value={formData.admin_name}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_email">
                  <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                  Email Admin IT
                </Label>
                <Input
                  id="admin_email"
                  name="admin_email"
                  type="email"
                  placeholder="admin@sekolah.sch.id"
                  required
                  value={formData.admin_email}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_password">
                  <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                  Kata Sandi Admin
                </Label>
                <Input
                  id="admin_password"
                  name="admin_password"
                  type="password"
                  placeholder="Minimal 8 karakter"
                  required
                  value={formData.admin_password}
                  onChange={handleChange}
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-[3px] border-primary-foreground/30 border-t-primary-foreground" />
                    Menyimpan akun...
                  </span>
                ) : (
                  'Daftar Sekarang'
                )}
              </Button>
            </form>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Masuk di sini
              <ArrowRight className="ml-1 inline size-3.5" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}