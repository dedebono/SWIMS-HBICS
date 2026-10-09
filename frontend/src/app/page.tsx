'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  FileText,
  Lock,
  Menu,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { getStoredUser } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconBox } from '@/components/ui/icon-box';
import { StatCard } from '@/components/ui/stat-card';

const featureItems = [
  {
    title: 'Akses Terbatas & Terukur',
    desc: 'Setiap guru, wali, dan kepala sekolah hanya melihat data yang menjadi tanggung jawabnya.',
    icon: Shield,
    tone: 'blue',
  },
  {
    title: 'Penanganan Insiden Terstruktur',
    desc: 'Setiap laporan tercatat rapi, dari laporan pertama hingga tindak lanjut sampai penyelesaian kasus.',
    icon: Activity,
    tone: 'green',
  },
  {
    title: 'Catatan Positif Siswa',
    desc: 'Apresiasi dan perilaku positif terekam sehingga guru punya gambaran perkembangan siswa.',
    icon: Award,
    tone: 'yellow',
  },
  {
    title: 'Ringkasan Cerdas',
    desc: 'Ringkasan otomatis riwayat siswa membantu guru dan wali memahami kasus lebih cepat.',
    icon: Brain,
    tone: 'purple',
  },
] as const;

const securityPoints = [
  'Jejak audit tidak dapat diubah untuk setiap tindakan penting',
  'Hak akses data diatur per peran dan per kelas',
  'Dokumen pendukung disimpan dengan tautan aman dan masa berlaku terbatas',
  'Data terenkripsi saat disimpan dan saat dikirim',
  'Penghapusan data sesuai permintaan dengan catatan resmi',
];

const trustStats = [
  { label: 'Sekolah aktif', value: '120+', hint: 'Instansi yang sudah memakai SWIMS', icon: Users, tone: 'blue' as const },
  { label: 'Kasus tertangani', value: '38rb', hint: 'Laporan insiden yang diproses tuntas', icon: Activity, tone: 'green' as const },
  { label: 'Kepatuhan data', value: '100%', hint: 'Sesuai UU PDP No. 27 Tahun 2022', icon: ShieldCheck, tone: 'teal' as const },
  { label: 'Peran pengguna', value: '7', hint: 'Guru, wali, perawat, hingga komite', icon: FileText, tone: 'purple' as const },
];

export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setIsLoggedIn(!!user);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 16);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#fitur', label: 'Fitur' },
    { href: '#keamanan', label: 'Keamanan' },
    { href: '#statistik', label: 'Statistik' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navbar */}
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-200 ${
          isScrolled ? 'border-border bg-card/95 shadow-card backdrop-blur' : 'border-transparent bg-background'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <IconBox tone="blue" size="md" className="rounded-[10px]">
              <ShieldCheck aria-hidden="true" />
            </IconBox>
            <span className="font-heading text-lg font-bold text-heading">SWIMS</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2.5 md:flex">
            {isLoggedIn ? (
              <Button onClick={() => router.push('/dashboard')}>
                Buka Dasbor
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => router.push('/login')}>
                  Masuk
                </Button>
                <Button onClick={() => router.push('/login')}>
                  Mulai Sekarang
                  <ArrowRight aria-hidden="true" />
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-heading md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="border-b border-border bg-card px-4 pb-5 pt-3 md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-[10px] px-3 py-2.5 text-sm font-medium text-secondary-text transition-colors hover:bg-primary-softer hover:text-primary"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                {isLoggedIn ? (
                  <Button className="w-full" onClick={() => router.push('/dashboard')}>
                    Buka Dasbor
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
                      Masuk
                    </Button>
                    <Button className="w-full" onClick={() => router.push('/login')}>
                      Mulai Sekarang
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-grow">
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
          <div className="pointer-events-none absolute -top-32 left-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1.5 text-xs font-semibold text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              SWIMS 2.0 kini hadir dengan tampilan terbaru
            </span>

            <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-heading md:text-5xl lg:text-6xl">
              Dampingi setiap siswa dengan catatan yang rapi dan aman
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-secondary-text md:text-base">
              SWIMS adalah platform SaaS untuk sekolah: catat laporan insiden, pantau kasus kesehatan, dan
              bangun kebiasaan positif siswa dalam satu sistem yang mudah dipantau guru maupun wali.
            </p>

            <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button
                size="lg"
                className="h-12 w-full px-7 sm:w-auto"
                onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')}
              >
                {isLoggedIn ? 'Buka Dasbor' : 'Mulai Gratis'}
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full px-7 sm:w-auto"
                onClick={() => router.push('/register')}
              >
                Daftarkan Sekolah
              </Button>
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              Gratis untuk sekolah yang baru memulai · Tanpa kartu kredit
            </p>
          </div>
        </section>

        {/* Statistik Kepercayaan */}
        <section id="statistik" className="px-4 pb-16 md:px-6 md:pb-24">
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {trustStats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                hint={stat.hint}
                icon={<stat.icon aria-hidden="true" />}
                iconTone={stat.tone}
              />
            ))}
          </div>
        </section>

        {/* Fitur */}
        <section id="fitur" className="bg-secondary/40 px-4 py-16 md:px-6 md:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="page-title text-2xl md:text-[2rem]">Semua yang Anda Butuh dalam Satu Platform</h2>
              <p className="page-subtitle mt-3 md:text-sm">
                Ganti catatan tersebar dan sistem lama dengan satu pusat kerja yang rapi untuk kesejahteraan
                siswa.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {featureItems.map((feature) => (
                <Card key={feature.title} interactive className="p-6">
                  <IconBox tone={feature.tone} size="lg" className="mb-4">
                    <feature.icon aria-hidden="true" />
                  </IconBox>
                  <h3 className="font-heading text-base font-semibold text-heading">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-secondary-text">{feature.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="px-4 py-16 md:px-6 md:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success-soft px-3.5 py-1.5 text-xs font-semibold text-success">
                <Lock className="size-3.5" aria-hidden="true" />
                Dirancang untuk perlindungan data
              </span>

              <h2 className="page-title text-2xl md:text-[2rem]">Keamanan Kelas Tanpa Batas untuk Data Siswa</h2>

              <p className="text-sm leading-relaxed text-secondary-text">
                Data siswa bersifat sangat sensitif. SWIMS dibangun sejak awal untuk membantu sekolah
                memenuhi standar perlindungan data dan memberi kepala sekolah keyakinan penuh.
              </p>

              <ul className="space-y-3.5">
                {securityPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-secondary-text">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card className="p-6">
              <p className="card-label">Fondasi keamanan SWIMS</p>
              <CardContent className="grid grid-cols-2 gap-4 p-0 pt-5">
                {[
                  { label: 'Basis Data Terenkripsi', icon: Lock, tone: 'blue' as const },
                  { label: 'Jejak Audit', icon: FileText, tone: 'green' as const },
                  { label: 'Aturan Hak Akses', icon: Shield, tone: 'yellow' as const },
                  { label: 'Ringkasan Cerdas', icon: Brain, tone: 'purple' as const },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col items-center gap-2.5 rounded-xl border border-border bg-primary-softer p-5 text-center"
                  >
                    <IconBox tone={item.tone} size="md">
                      <item.icon aria-hidden="true" />
                    </IconBox>
                    <span className="text-sm font-semibold text-heading">{item.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Ajakan bertindak */}
        <section className="px-4 pb-16 md:px-6 md:pb-24">
          <div className="mx-auto max-w-6xl">
            <Card className="overflow-hidden bg-heading p-8 md:p-14">
              <div className="relative max-w-2xl">
                <h2 className="font-heading text-2xl font-bold text-primary-foreground md:text-3xl">
                  Siap meningkatkan strategi kesejahteraan sekolah Anda?
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-primary-foreground/75 md:text-base">
                  Bergabung dengan sekolah-sekolah yang sudah mempercayakan perlindungan, pendampingan, dan
                  perkembangan siswa kepada SWIMS.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    className="h-12 px-7"
                    onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')}
                  >
                    {isLoggedIn ? 'Buka Dasbor' : 'Mulai Sekarang'}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Link
                    href="/register"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-primary-foreground/30 px-7 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
                  >
                    Daftarkan Sekolah
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <IconBox tone="blue" size="sm">
                  <ShieldCheck aria-hidden="true" />
                </IconBox>
                <span className="font-heading text-base font-bold text-heading">SWIMS</span>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Platform lengkap untuk kesejahteraan siswa, penanganan kasus kesehatan, dan penguatan
                perilaku positif di sekolah.
              </p>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold text-heading">Produk</h3>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <a href="#fitur" className="transition-colors hover:text-primary">
                    Fitur
                  </a>
                </li>
                <li>
                  <a href="#keamanan" className="transition-colors hover:text-primary">
                    Keamanan
                  </a>
                </li>
                <li>
                  <Link href="/register" className="transition-colors hover:text-primary">
                    Daftar Sekolah
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold text-heading">Informasi</h3>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <a href="#keamanan" className="transition-colors hover:text-primary">
                    Kebijakan Privasi
                  </a>
                </li>
                <li>
                  <a href="#keamanan" className="transition-colors hover:text-primary">
                    Ketentuan Layanan
                  </a>
                </li>
                <li>
                  <a href="#keamanan" className="transition-colors hover:text-primary">
                    Kepatuhan UU PDP
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
            <p>&copy; {new Date().getFullYear()} SWIMS Platform. Seluruh hak dilindungi.</p>
            <p>Dibangun untuk operasional excellence sekolah di Indonesia.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
