'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard, ProgressPill } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Users,
  UserCheck,
  UserX,
  GraduationCap,
  ShieldCheck,
  Download,
  Upload,
  FileUp,
  Settings,
  TriangleAlert,
  CircleCheckBig,
} from 'lucide-react';

interface SystemSummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  students: number;
  roleDistribution: Record<string, number>;
}

const STAFF_ROLES = [
  'TEACHER',
  'SUBSTITUTE_TEACHER',
  'COUNSELOR',
  'SCHOOL_HEAD',
  'SCHOOL_NURSE',
  'BOARD_MEMBER',
  'CASE_REVIEWER',
  'IT_ADMIN',
];

function roleLabel(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient<SystemSummary>('/admin/system-summary');
        if (!cancelled) {
          if (res.success && res.data) setSummary(res.data);
          else setError(res.error || 'Gagal memuat ringkasan sistem.');
        }
      } catch {
        if (!cancelled) setError('Terjadi kesalahan jaringan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dist = STAFF_ROLES.filter((r) => summary?.roleDistribution[r]).map((r) => ({
    role: r,
    count: summary!.roleDistribution[r],
  }));
  const maxDist = Math.max(1, ...dist.map((d) => d.count));
  const totalStaff = dist.reduce((sum, d) => sum + d.count, 0);

  // ── Data migration (export / import) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setImportError(null);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('swims_access_token')
          : null;
      const res = await fetch('/api/admin/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Export gagal (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swims-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setImportError(e?.message || 'Export gagal.');
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
    setImportResult(null);
    setImportError(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const text = await selectedFile.text();
      const payload = JSON.parse(text);
      const res = await apiClient<{ imported: Record<string, number>; version: number }>(
        '/admin/import',
        { method: 'POST', body: payload },
      );
      if (res.success && res.data) setImportResult(res.data.imported);
      else setImportError(res.error || 'Import gagal.');
    } catch (e: any) {
      setImportError(e?.message || 'Import gagal.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ringkasan Sistem"
          description="Gambaran pengguna dan hak akses untuk organisasi Anda."
        />
        <div className="flex h-64 items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ringkasan Sistem"
        description="Gambaran pengguna dan hak akses untuk organisasi Anda."
        actions={
          <>
            <Button variant="outline" render={<Link href="/dashboard/admin/settings" />}>
              <Settings className="size-4" />
              Pengaturan
            </Button>
            <Button render={<Link href="/dashboard/admin/users" />}>
              <Users className="size-4" />
              Kelola Pengguna
            </Button>
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <StatusBadge tone="danger" label="Gagal memuat" />
            <p className="text-sm text-secondary-text">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Pengguna"
              value={summary.totalUsers}
              hint={`${summary.activeUsers} pengguna aktif`}
              icon={<Users className="size-5" />}
              iconTone="blue"
              progress={
                summary.totalUsers > 0
                  ? Math.round((summary.activeUsers / summary.totalUsers) * 100)
                  : 0
              }
              progressLabel="Persentase pengguna aktif"
            />
            <StatCard
              label="Pengguna Aktif"
              value={summary.activeUsers}
              hint="Akun yang dapat masuk ke sistem"
              icon={<UserCheck className="size-5" />}
              iconTone="green"
              progress={
                summary.totalUsers > 0
                  ? Math.round((summary.activeUsers / summary.totalUsers) * 100)
                  : 0
              }
              progressLabel="Persentase pengguna aktif"
            />
            <StatCard
              label="Pengguna Nonaktif"
              value={summary.inactiveUsers}
              hint="Akun yang dinonaktifkan atau belum pernah masuk"
              icon={<UserX className="size-5" />}
              iconTone="yellow"
              progress={
                summary.totalUsers > 0
                  ? Math.round((summary.inactiveUsers / summary.totalUsers) * 100)
                  : 0
              }
              progressLabel="Persentase pengguna nonaktif"
            />
            <StatCard
              label="Data Siswa"
              value={summary.students}
              hint="Jumlah siswa yang terdaftar di sekolah"
              icon={<GraduationCap className="size-5" />}
              iconTone="purple"
            />
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Distribusi Peran</CardTitle>
              <CardDescription>
                Jumlah akun staf per peran. Total {totalStaff} akun staf terdaftar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dist.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck />}
                  title="Belum ada data staf"
                  description="Belum ada akun staf yang tercatat. Tambahkan pengguna melalui menu Kelola Pengguna."
                />
              ) : (
                dist.map((d) => (
                  <div key={d.role} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-heading">{roleLabel(d.role)}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{d.count} akun</p>
                    </div>
                    <ProgressPill
                      value={(d.count / maxDist) * 100}
                      tone="blue"
                      label={`${roleLabel(d.role)}: ${d.count} akun`}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Data migration */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Migrasi Data</CardTitle>
          <CardDescription>
            Ekspor semua data ke server produksi baru, lalu impor di server tujuan.
            Mencakup pengguna, siswa, kasus, insiden, intervensi, observasi, konseling,
            kuisioner, rujukan psikolog, buku pedoman disiplin, dan lainnya. Berkas media
            tidak disertakan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="size-4" />
              {exporting ? 'Mengekspor…' : 'Ekspor Data'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="size-4" />
              Pilih Berkas JSON
            </Button>
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
              <Upload className="size-4" />
              {importing ? 'Mengimpor…' : 'Impor Data'}
            </Button>
          </div>

          {selectedFile ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-4 py-3">
              <StatusBadge tone="info" label="Berkas dipilih" />
              <p className="text-sm text-secondary-text">{selectedFile.name}</p>
            </div>
          ) : null}

          {importError ? (
            <div className="flex items-start gap-3 rounded-xl border border-danger-soft bg-danger-soft/40 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <p className="text-sm text-secondary-text">{importError}</p>
            </div>
          ) : null}

          {importResult ? (
            <div className="space-y-3 rounded-xl border border-success-soft bg-success-soft/40 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <CircleCheckBig className="size-4 text-success" />
                <p className="text-sm font-semibold text-heading">Impor berhasil selesai</p>
              </div>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(importResult).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-border pb-1.5">
                    <span className="text-sm capitalize text-secondary-text">{k.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-semibold text-heading">{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Baris dengan ID yang sudah ada akan dilewati (idempoten).
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}