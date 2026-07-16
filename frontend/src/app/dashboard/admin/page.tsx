'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
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
import {
  Users,
  UserCheck,
  UserX,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
  Download,
  Upload,
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

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
}) {
  return (
    <Card className="glass shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ringkasan Sistem</h1>
          <p className="text-sm text-muted-foreground">
            Gambaran pengguna &amp; akses untuk organisasi Anda.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/admin/users"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            User Management <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard/admin/settings"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Settings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <Card className="glass shadow-sm">
          <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {summary && !loading && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Total Pengguna"
              value={summary.totalUsers}
              sub={`${summary.activeUsers} aktif`}
              accent="bg-primary/10 text-primary"
            />
            <StatCard
              icon={<UserCheck className="h-5 w-5" />}
              label="Pengguna Aktif"
              value={summary.activeUsers}
              accent="bg-emerald-100 text-emerald-700"
            />
            <StatCard
              icon={<UserX className="h-5 w-5" />}
              label="Pengguna Non-aktif"
              value={summary.inactiveUsers}
              accent="bg-orange-100 text-orange-700"
            />
            <StatCard
              icon={<GraduationCap className="h-5 w-5" />}
              label="Siswa (data)"
              value={summary.students}
              sub="Data siswa terdaftar"
              accent="bg-violet-100 text-violet-700"
            />
          </div>

          {/* Role distribution */}
          <Card className="glass shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Distribusi Peran
              </CardTitle>
              <CardDescription>Jumlah akun per peran (staf).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dist.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data pengguna.</p>
              ) : (
                dist.map((d) => (
                  <div key={d.role} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-sm">{roleLabel(d.role)}</div>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(d.count / maxDist) * 100}%` }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-sm font-medium">
                      {d.count}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Data migration */}
      <Card className="glass shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-primary" />
            Migrasi Data
          </CardTitle>
          <CardDescription>
            Export data untuk migrasi ke server produksi baru, lalu import di
            server tujuan. Termasuk: pengguna, siswa, kasus aktif (+ insiden,
            intervensi, observasi, berbagi kasus). Media tidak disertakan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Mengekspor…' : 'Export Data'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Pilih File JSON
            </Button>
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
              <Upload className="mr-2 h-4 w-4" />
              {importing ? 'Mengimpor…' : 'Import Data'}
            </Button>
          </div>

          {selectedFile && (
            <p className="text-sm text-muted-foreground">File: {selectedFile.name}</p>
          )}
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          {importResult && (
            <div className="text-sm">
              <p className="font-medium text-emerald-700">Import selesai:</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {Object.entries(importResult).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Baris dengan ID sudah ada dilewati (idempoten).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
