'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Award,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Heart,
  Layers,
  Loader2,
  Plus,
  Search,
  Share2,
  Stethoscope,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface CaseRow {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  assigned_counselor: string | null;
  opened_date: string;
  created_at: string;
  updated_at: string;
  student_name?: string;
  reported_by_name?: string;
}

interface TeacherItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

interface CaseShare {
  share_id: string;
  shared_with: string;
  shared_with_name: string;
  shared_with_role: string;
}

/* ─── Label Bahasa Indonesia ─────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  MONITORING: 'Dipantau',
  CLOSED: 'Ditutup',
};

const RISK_LABEL: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

const CASE_TYPE_LABEL: Record<string, string> = {
  BEHAVIORAL: 'Perilaku',
  EMOTIONAL: 'Emosional',
  MEDICAL: 'Medis',
  ACADEMIC: 'Akademik',
  POSITIVE: 'Positif',
};

const CASE_TYPE_ICON: Record<string, typeof Layers> = {
  BEHAVIORAL: AlertTriangle,
  EMOTIONAL: Heart,
  MEDICAL: Stethoscope,
  ACADEMIC: GraduationCap,
  POSITIVE: Award,
};

const PAGE_SIZE = 20;

function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value.toUpperCase()] ?? value;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Judul kasus ringkas: "Kasus Nama Siswa #xxxxxxxx". */
function caseTitle(c: { case_id: string; student_name?: string | null }): string {
  const short = c.case_id.slice(0, 8);
  return c.student_name ? `Kasus ${c.student_name} #${short}` : `Kasus #${short}`;
}

export default function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Bagikan kasus
  const [shareDialogCase, setShareDialogCase] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [sharesMap, setSharesMap] = useState<Record<string, CaseShare[]>>({});
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);

  // Kelompokkan per siswa
  const [groupByStudent, setGroupByStudent] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (riskFilter !== 'all') params.set('risk_level', riskFilter);

    const res = await apiClient<CaseRow[]>(`/cases?${params.toString()}`);
    if (res.success && res.data) {
      setCases(res.data);
      setTotal(res.meta?.total ?? 0);
    }
    setIsLoading(false);
  }, [page, statusFilter, riskFilter]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    if (cases.length === 0) return;
    const caseIds = cases.map((c) => c.case_id);
    Promise.all(
      caseIds.map((caseId) =>
        apiClient<CaseShare[]>(`/cases/${caseId}/shares`)
          .then((res) => ({ caseId, shares: res.success && res.data ? res.data : [] })),
      ),
    ).then((results) => {
      const map: Record<string, CaseShare[]> = {};
      for (const r of results) map[r.caseId] = r.shares;
      setSharesMap(map);
    });
  }, [cases]);

  const openShareDialog = async (caseId: string) => {
    setShareDialogCase(caseId);
    setSelectedTeachers([]);
    if (teachers.length === 0) {
      setIsLoadingTeachers(true);
      const res = await apiClient<{ rows: TeacherItem[]; total: number; page: number; hasMore: boolean }>(
        '/users/teachers',
      );
      if (res.success && res.data) setTeachers(res.data.rows);
      setIsLoadingTeachers(false);
    }
  };

  const handleShare = async () => {
    if (!shareDialogCase || selectedTeachers.length === 0) return;
    setIsSharing(true);
    const res = await apiClient(`/cases/${shareDialogCase}/share`, {
      method: 'POST',
      body: { shared_with: selectedTeachers, permission: 'CONTRIBUTE' },
    });
    if (res.success) {
      toast.success('Kasus berhasil dibagikan.');
      setShareDialogCase(null);
      const sharesRes = await apiClient<CaseShare[]>(`/cases/${shareDialogCase}/shares`);
      if (sharesRes.success && sharesRes.data) {
        setSharesMap((prev) => ({ ...prev, [shareDialogCase]: sharesRes.data! }));
      }
    } else {
      toast.error(res.error || 'Gagal membagikan kasus.');
    }
    setIsSharing(false);
  };

  const toggleTeacher = (userId: string) => {
    setSelectedTeachers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleGroup = (studentKey: string) => {
    setExpandedGroups((prev) =>
      prev.has(studentKey)
        ? new Set([...prev].filter((k) => k !== studentKey))
        : new Set([...prev, studentKey]),
    );
  };

  const toggleGroupByStudent = () => {
    if (groupByStudent) {
      setGroupByStudent(false);
      return;
    }
    setGroupByStudent(true);
    const allKeys = new Set<string>();
    for (const c of filteredCases) allKeys.add(c.student_name ?? 'Siswa tidak dikenal');
    setExpandedGroups(allKeys);
  };

  const filteredCases = search
    ? cases.filter(
        (c) =>
          (c.case_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (c.case_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (c.student_name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : cases;

  /* ─── Statistik ─────────────────────────────────────────────────────────── */

  const openCount = filteredCases.filter((c) => c.status === 'OPEN').length;
  const highRiskCount = filteredCases.filter(
    (c) => c.risk_level === 'HIGH' || c.risk_level === 'CRITICAL',
  ).length;
  const studentCount = new Set(filteredCases.map((c) => c.student_name ?? c.student_id)).size;
  const activeRatio = filteredCases.length ? (openCount / filteredCases.length) * 100 : 0;
  const riskRatio = filteredCases.length ? (highRiskCount / filteredCases.length) * 100 : 0;

  /* ─── Kelompok per siswa ───────────────────────────────────────────────── */

  const groups = Object.entries(
    filteredCases.reduce<Record<string, CaseRow[]>>((acc, c) => {
      const key = c.student_name ?? 'Siswa tidak dikenal';
      (acc[key] ||= []).push(c);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b, 'id'));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kasus Siswa"
        description={
          user?.role === 'TEACHER'
            ? 'Menampilkan kasus dari laporan Anda dan kasus yang dibagikan kepada Anda.'
            : 'Pantau dan tangani kasus siswa yang tercatat di sekolah.'
        }
        actions={
          <>
            <Button
              variant={groupByStudent ? 'outline' : 'default'}
              size="sm"
              onClick={toggleGroupByStudent}
            >
              <Users className="size-4" />
              {groupByStudent ? 'Kelompokkan per Siswa' : 'Tampilan Daftar'}
            </Button>
            <Button size="sm" render={<Link href="/dashboard/incidents/new" />}>
              <Plus className="size-4" />
              Laporan Insiden
            </Button>
          </>
        }
      />

      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Kasus"
          value={total}
          hint="Seluruh kasus yang tercatat di sekolah."
          icon={<Layers className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Kasus Terbuka"
          value={openCount}
          hint="Dari kasus pada halaman ini."
          icon={<ClipboardList className="size-5" />}
          iconTone="green"
          progress={activeRatio}
          progressLabel="Proporsi kasus terbuka"
        />
        <StatCard
          label="Risiko Tinggi"
          value={highRiskCount}
          hint="Kasus dengan klasifikasi tinggi atau kritis."
          icon={<AlertTriangle className="size-5" />}
          iconTone="red"
          progress={riskRatio}
          progressLabel="Proporsi kasus berisiko tinggi"
        />
        <StatCard
          label="Siswa Terdampak"
          value={studentCount}
          hint="Jumlah siswa unik pada halaman ini."
          icon={<Users className="size-5" />}
          iconTone="purple"
        />
      </div>

      {/* Penyaring */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari kasus, siswa, atau jenis kasus..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Cari kasus"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
            <SelectTrigger className="w-44" aria-label="Saring status">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="OPEN">Terbuka</SelectItem>
              <SelectItem value="MONITORING">Dipantau</SelectItem>
              <SelectItem value="CLOSED">Ditutup</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v ?? 'all')}>
            <SelectTrigger className="w-44" aria-label="Saring klasifikasi risiko">
              <SelectValue placeholder="Semua risiko" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Klasifikasi</SelectItem>
              <SelectItem value="CRITICAL">Kritis</SelectItem>
              <SelectItem value="HIGH">Tinggi</SelectItem>
              <SelectItem value="MEDIUM">Sedang</SelectItem>
              <SelectItem value="LOW">Rendah</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Daftar kasus */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      ) : filteredCases.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="Belum ada kasus"
            description="Anda belum memiliki data. Mulai dengan menambahkan laporan insiden."
            action={
              <Button size="sm" render={<Link href="/dashboard/incidents/new" />}>
                <Plus className="size-4" />
                Laporan Insiden
              </Button>
            }
          />
        </Card>
      ) : groupByStudent ? (
        <div className="space-y-4">
          {groups.map(([studentName, studentCases]) => {
            const isExpanded = expandedGroups.has(studentName);
            const highestRisk = studentCases.reduce((best, c) => {
              const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
              return (order[c.risk_level] ?? 4) < (order[best] ?? 4) ? c.risk_level : best;
            }, 'LOW');

            return (
              <Card key={studentName}>
                <button
                  type="button"
                  onClick={() => toggleGroup(studentName)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 border-b border-border px-5 py-4 text-left transition-colors hover:bg-primary-softer"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <IconBox tone="purple" size="sm">
                    <Users />
                  </IconBox>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-heading">{studentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {studentCases.length} kasus
                    </p>
                  </div>
                  <StatusBadge
                    tone={severityTone(highestRisk)}
                    label={`Risiko ${label(RISK_LABEL, highestRisk)}`}
                  />
                </button>

                {isExpanded ? (
                  <div className="divide-y divide-border">
                    {studentCases.map((c) => {
                      const shares = sharesMap[c.case_id] || [];
                      const TypeIcon = CASE_TYPE_ICON[c.case_type] ?? ClipboardList;
                      return (
                        <div
                          key={c.case_id}
                          className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-primary-softer"
                        >
                          <Link
                            href={`/dashboard/cases/${c.case_id}`}
                            className="flex min-w-0 flex-1 items-center gap-3.5"
                          >
                            <IconBox tone="blue" size="sm">
                              <TypeIcon />
                            </IconBox>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-heading">
                                {caseTitle(c)}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {label(CASE_TYPE_LABEL, c.case_type)} • Dibuka {formatDate(c.opened_date)}
                                {c.reported_by_name ? ` • Dilaporkan oleh ${c.reported_by_name}` : ''}
                              </p>
                              {shares.length > 0 ? (
                                <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                                  <Share2 className="size-3" />
                                  Dibagikan ke {shares.map((s) => s.shared_with_name).join(', ')}
                                </p>
                              ) : null}
                            </div>
                          </Link>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge
                              tone={severityTone(c.status)}
                              label={label(STATUS_LABEL, c.status)}
                            />
                            <StatusBadge
                              tone={severityTone(c.risk_level)}
                              label={label(RISK_LABEL, c.risk_level)}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openShareDialog(c.case_id)}
                              aria-label={`Bagikan kasus ${caseTitle(c)}`}
                              title="Bagikan kasus ini"
                            >
                              <Share2 className="size-4 text-muted-foreground" />
                            </Button>
                            <Link
                              href={`/dashboard/cases/${c.case_id}`}
                              className="text-muted-foreground transition-colors hover:text-primary"
                              aria-label={`Lihat detail ${caseTitle(c)}`}
                            >
                              <ChevronRight className="size-4" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="px-0 pb-0">
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Kasus</TableHeaderCell>
                  <TableHeaderCell scope="col">Jenis</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                  <TableHeaderCell scope="col">Klasifikasi</TableHeaderCell>
                  <TableHeaderCell scope="col">Tanggal Dibuka</TableHeaderCell>
                  <TableHeaderCell scope="col">Pelapor</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">
                    Aksi
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCases.map((c) => {
                  const shares = sharesMap[c.case_id] || [];
                  const TypeIcon = CASE_TYPE_ICON[c.case_type] ?? ClipboardList;
                  return (
                    <TableRow key={c.case_id} interactive>
                      <TableCell>
                        <Link
                          href={`/dashboard/cases/${c.case_id}`}
                          className="flex items-center gap-2.5"
                        >
                          <IconBox tone="blue" size="sm">
                            <TypeIcon />
                          </IconBox>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-heading">
                              {caseTitle(c)}
                            </span>
                            {shares.length > 0 ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                Dibagikan ke {shares.map((s) => s.shared_with_name).join(', ')}
                              </span>
                            ) : (
                              <span className="block truncate text-xs text-muted-foreground">
                                {c.case_id.slice(0, 8)}
                              </span>
                            )}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-secondary-text">
                        {label(CASE_TYPE_LABEL, c.case_type)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={severityTone(c.status)} label={label(STATUS_LABEL, c.status)} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={severityTone(c.risk_level)}
                          label={label(RISK_LABEL, c.risk_level)}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-secondary-text">
                        {formatDate(c.opened_date)}
                      </TableCell>
                      <TableCell className="text-sm text-secondary-text">
                        {c.reported_by_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openShareDialog(c.case_id)}
                            aria-label={`Bagikan kasus ${caseTitle(c)}`}
                            title="Bagikan kasus ini"
                          >
                            <Share2 className="size-4 text-muted-foreground" />
                          </Button>
                          <Link
                            href={`/dashboard/cases/${c.case_id}`}
                            className="text-muted-foreground transition-colors hover:text-primary"
                            aria-label={`Lihat detail ${caseTitle(c)}`}
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          </CardContent>
        </Card>
      )}

      {/* Paginasi */}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-sm text-muted-foreground">
            Halaman {page} dari {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      ) : null}

      {/* Dialog Bagikan Kasus */}
      <Dialog
        open={!!shareDialogCase}
        onOpenChange={(open) => !open && setShareDialogCase(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-4 text-primary" />
              Bagikan Kasus
            </DialogTitle>
            <DialogDescription>
              Pilih guru yang dapat melihat kasus ini dan mencatat penanganan. Guru yang dipilih dapat
              melihat detail kasus serta mencatat intervensi.
            </DialogDescription>
          </DialogHeader>

          {isLoadingTeachers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada data guru.
            </p>
          ) : (
            <div className="scroll-slim max-h-64 space-y-1 overflow-y-auto">
              {teachers.map((t) => {
                const isSelected = selectedTeachers.includes(t.user_id);
                return (
                  <button
                    key={t.user_id}
                    type="button"
                    onClick={() => toggleTeacher(t.user_id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary/30 bg-primary-soft'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${
                        isSelected ? 'border-primary bg-primary' : 'border-border'
                      }`}
                    >
                      {isSelected ? <Check className="size-3 text-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-heading">
                        {t.full_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.email} • {t.role.replace('_', ' ')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogCase(null)}>
              Batal
            </Button>
            <Button onClick={handleShare} disabled={selectedTeachers.length === 0 || isSharing}>
              {isSharing
                ? 'Membagikan...'
                : `Bagikan ke ${selectedTeachers.length} guru`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}