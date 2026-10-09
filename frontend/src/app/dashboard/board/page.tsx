"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { IconBox } from "@/components/ui/icon-box";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ChartPie,
  Download,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  FileBarChart,
} from "lucide-react";

const ringkasanTren = [
  {
    label: "Kepatuhan Prosedur",
    value: "98%",
    tren: "naik",
    keterangan: "Seluruh protokol telah dipenuhi.",
  },
  {
    label: "Kesejahteraan Siswa",
    value: "+4,2%",
    tren: "naik",
    keterangan: "Pengamatan positif meningkat.",
  },
  {
    label: "Rata-rata Penyelesaian",
    value: "3,2 hari",
    tren: "turun",
    keterangan: "Lebih cepat dari kuartal lalu.",
  },
];

export default function BoardMemberDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tampilan Dewan Yayasan"
        description={
          user?.full_name
            ? `Selamat datang, ${user.full_name}. Berikut metrik kepatuhan dan kesejahteraan dalam bentuk anonim.`
            : "Metrik kepatuhan dan kesejahteraan dalam bentuk anonim untuk oversee program."
        }
        actions={
          <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-card">
            <FileBarChart className="size-4" />
            Periode: Semester berjalan
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Skor Kepatuhan"
          value="98%"
          hint="Seluruh protokol telah dipenuhi"
          icon={<ShieldCheck className="size-5" />}
          iconTone="green"
          trend="up"
          trendLabel="+2% vs kuartal lalu"
          progress={98}
          progressLabel="Skor kepatuhan"
        />
        <StatCard
          label="Tren Kesejahteraan"
          value="+4,2%"
          hint="Pengamatan positif meningkat"
          icon={<TrendingUp className="size-5" />}
          iconTone="blue"
          trend="up"
          trendLabel="arah naik"
        />
        <StatCard
          label="Data Insiden Anonim"
          value="Siap"
          hint="Laporan kuartalan telah dikompilasi"
          icon={<ChartPie className="size-5" />}
          iconTone="purple"
          trend="flat"
          trendLabel="Siap diunduh"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ringkasan Kinerja Triwulan</CardTitle>
            <CardDescription>
              Angka agregat tanpa identitas siswa untuk keperluan oversight.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {ringkasanTren.map((item) => (
                <li key={item.label} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-heading">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.keterangan}</p>
                  </div>
                  <span className="stat-value text-xl">{item.value}</span>
                  <StatusBadge
                    tone={item.tren === "naik" ? "success" : "info"}
                    label={item.tren === "naik" ? "Meningkat" : "Membaik"}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Laporan Kuartalan</CardTitle>
            <CardDescription>Ringkasan anonim untuk rapat dewan berikutnya.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <IconBox tone="purple" size="sm">
                <FileBarChart />
              </IconBox>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-heading">
                  Laporan Kepatuhan K1
                </p>
                <p className="text-xs text-muted-foreground">PDF · 2,4 MB</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <IconBox tone="blue" size="sm">
                <FileBarChart />
              </IconBox>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-heading">
                  Ringkasan Kesejahteraan Siswa
                </p>
                <p className="text-xs text-muted-foreground">PDF · 1,1 MB</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <IconBox tone="teal" size="sm">
                <ChartPie />
              </IconBox>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-heading">
                  Statistik Insiden Anonim
                </p>
                <p className="text-xs text-muted-foreground">Excel · 780 KB</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-xs text-success">
              <TrendingDown className="size-4" />
              Rata-rata penyelesaian kasus turun menjadi 3,2 hari pada kuartal ini.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
        <p className="text-sm text-secondary-text">
          Butuh data agregat tambahan untuk rapat berikutnya?
        </p>
        <Button>
          <Download className="size-4" />
          Unduh laporan
        </Button>
      </div>
    </div>
  );
}