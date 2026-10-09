'use client';

import Link from 'next/link';
import {
  BookOpen,
  FolderOpen,
  LifeBuoy,
  Sparkles,
  UserRound,
} from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';

const comingSoonFeatures = [
  {
    icon: BookOpen,
    title: 'Riwayat Perjalanan Saya',
    description:
      'Lihat seluruh aktivitas dan catatan yang pernah tercatat pada akun Anda.',
  },
  {
    icon: FolderOpen,
    title: 'Intervensi & Dukungan',
    description:
      'Ikuti program pendampingan yang disiapkan sekolah untuk kebutuhan Anda.',
  },
  {
    icon: UserRound,
    title: 'Ringkasan Kasus',
    description:
      'Pahami status pendampingan Anda dalam satu tampilan yang mudah dipahami.',
  },
];

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const firstName = user?.full_name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Selamat datang, ${firstName}` : 'Dashboard Siswa'}
        description="Ruang pribadi Anda untuk melihat catatan, intervensi, dan pendampingan dari sekolah."
        actions={
          <Button variant="outline" render={<Link href="/dashboard" />}>
            <LifeBuoy className="size-4" />
            Butuh Bantuan?
          </Button>
        }
      />

      {/* Baris kartu statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kasus Mandiri"
          value="—"
          hint="Jumlah kasus yang sedang berjalan. Fitur sedang disiapkan."
          icon={<FolderOpen />}
          iconTone="blue"
        />
        <StatCard
          label="Intervensi Diberikan"
          value="—"
          hint="Catatan pendampingan yang sudah diterima. Fitur sedang disiapkan."
          icon={<LifeBuoy />}
          iconTone="green"
        />
        <StatCard
          label="Tindak Lanjut"
          value="—"
          hint="Langkah lanjutan yang menunggu Anda. Fitur sedang disiapkan."
          icon={<BookOpen />}
          iconTone="purple"
        />
        <StatCard
          label="Kelengkapan Data"
          value="—"
          hint="Lengkapi profil agar pendampingan lebih tepat. Fitur sedang disiapkan."
          icon={<UserRound />}
          iconTone="teal"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status fitur */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>Fitur Segera Datang</CardTitle>
            <CardDescription>
              Kami sedang menyiapkan berikut agar Anda bisa melihat
              perkembangan pendampingan secara mandiri.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {comingSoonFeatures.map((feature) => (
                <li
                  key={feature.title}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                    <feature.icon className="size-5" />
                  </span>
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-semibold text-heading">
                      {feature.title}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {feature.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Empty state */}
        <Card>
          <CardContent>
            <EmptyState
              icon={<Sparkles />}
              title="Belum ada data"
              description="Portal siswa sedang dibangun. Fitur catatan pribadi dan intervensi akan segera hadir."
              action={
                <Button
                  variant="outline"
                  render={<Link href="/dashboard" />}
                >
                  Kembali ke Dashboard
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}