"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  ClipboardCheck,
  FileCheck2,
  ShieldAlert,
  ClipboardList,
  Sparkles,
} from "lucide-react";

export default function CaseReviewerDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Kasus"
        description={
          user?.full_name
            ? `Halo ${user.full_name}, lakukan audit, verifikasi tingkat risiko, dan pemeriksaan kepatuhan atas kasus yang telah diselesaikan.`
            : "Lakukan audit, verifikasi tingkat risiko, dan pemeriksaan kepatuhan atas kasus yang telah diselesaikan."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Audit Tertunda"
          value={5}
          hint="Terpilih secara acak untuk minggu ini"
          icon={<ClipboardCheck className="size-5" />}
          iconTone="purple"
          trend="flat"
          trendLabel="Perlu ditinjau"
          progress={40}
          progressLabel="Progres audit minggu ini"
        />
        <StatCard
          label="Tingkat Risiko Disputed"
          value={1}
          hint="Memerlukan arbitrasi manual"
          icon={<ShieldAlert className="size-5" />}
          iconTone="yellow"
          trend="down"
          trendLabel="-2 dari minggu lalu"
        />
        <StatCard
          label="Kasus Disetujui"
          value={142}
          hint="Kepatuhan terverifikasi tahun berjalan"
          icon={<FileCheck2 className="size-5" />}
          iconTone="green"
          trend="up"
          trendLabel="+12%"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Antrean Audit</CardTitle>
          <CardDescription>
            Pilih kasus untuk memulai pemeriksaan kepatuhan Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="Antrean audit sedang kosong"
            description="Belum ada kasus yang menunggu pemeriksaan. Kasus yang selesai akan otomatis masuk ke antrean ini."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengingat Workflow</CardTitle>
          <CardDescription>Ikuti alur kerja audit agar hasil pemeriksaan tetap konsisten.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              "Verifikasi ulang tingkat risiko setiap kasus yang sudah ditutup.",
              "Catat temuan audit beserta rekomendasi tindak lanjut.",
              "Kirim kasus berisiko tinggi ke tahan Review concurring.",
            ].map((tip) => (
              <li
                key={tip}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Sparkles className="size-4" />
                </span>
                <p className="text-sm leading-relaxed text-secondary-text">{tip}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}