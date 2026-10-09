'use client';

import { useEffect, useState, use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { PageHeader, EmptyState } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CalendarClock,
  Check,
  ClipboardList,
  FileWarning,
  GraduationCap,
  HeartHandshake,
  History,
  ListChecks,
  MapPin,
  Paperclip,
  Pencil,
  Ruler,
  Share2,
  ShieldAlert,
  Sparkles,
  Tags,
  User,
  Users,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { InterventionsTab } from '@/components/cases/interventions-tab';
import { MediaTab } from '@/components/cases/media-tab';
import { CommunicationsTab } from '@/components/cases/communications-tab';
import { StudentProfileDialog } from '@/components/students/student-profile-dialog';
import { CounselingTab } from '@/components/counseling/counseling-tab';

/* ─── Label Bahasa Indonesia ─────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  MONITORING: 'Dipantau',
  CLOSED: 'Ditutup',
};

const RISK_LABEL: Record<string, string> = {
  LOW: 'Minor',
  MEDIUM: 'Moderat',
  HIGH: 'Mayor',
  CRITICAL: 'Serius',
};

const EVIDENCE_LABEL: Record<string, string> = {
  CCTV: 'CCTV',
  PHOTO: 'Foto',
  VIDEO: 'Video',
  SCREENSHOT: 'Tangkapan layar',
  WITNESS: 'Saksi',
  NONE: 'Tidak ada',
};

function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value.toUpperCase()] ?? value;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ─── Tipe data ──────────────────────────────────────────────────────────── */

interface CaseDetail {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  risk_level_source: string;
  assigned_counselor: string | null;
  school_phase_ref: string | null;
  opened_date: string;
  closed_date: string | null;
  summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  student_name?: string | null;
}

interface IncidentItem {
  incident_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  student_grade?: string | null;
  incident_at: string;
  immediate_actions: string | null;
  language_flag: boolean;
  witnesses: Array<{ user_id?: string; name: string; statement?: string }>;
  metadata: {
    involved_students?: string[];
    evidence?: {
      cctv?: boolean;
      photo?: boolean;
      video?: boolean;
      screenshot?: boolean;
      witness?: boolean;
      none?: boolean;
    };
    manual_involved_teacher?: string;
    initial_assessment?: {
      is_recurring?: boolean;
      similar_cases?: boolean;
      needs_escalation?: boolean;
      needs_parent_comm?: boolean;
    };
  };
  reported_by: string;
  reporter_name?: string;
  involved_teacher?: string | null;
  involved_teacher_name?: string | null;
  created_at: string;
}

/* ─── Wrapper ────────────────────────────────────────────────────────────── */

export default function CaseDetailPageWrapper(props: { params: Promise<{ caseId: string }> }) {
  return (
    <ErrorBoundary>
      <CaseDetailPage {...props} />
    </ErrorBoundary>
  );
}

function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const resolvedParams = use(params);
  const { user } = useAuth();
  const canEditIncident = ['COUNSELOR', 'HEAD', 'IT_ADMIN'].includes(user?.role ?? '');
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [studentData, setStudentData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [riskOverride, setRiskOverride] = useState('');
  const [justification, setJustification] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Bagikan kasus
  const [shares, setShares] = useState<
    Array<{
      share_id: string;
      shared_with: string;
      shared_with_name: string;
      shared_with_role: string;
    }>
  >([]);
  const [teachers, setTeachers] = useState<
    Array<{ user_id: string; full_name: string; email: string; role: string }>
  >([]);
  const [teacherPage, setTeacherPage] = useState(1);
  const [hasMoreTeachers, setHasMoreTeachers] = useState(false);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Ubah guru yang terlibat pada insiden
  const [editingIncident, setEditingIncident] = useState<IncidentItem | null>(null);
  const [involvedTeacherSelect, setInvolvedTeacherSelect] = useState('');
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);

  // Kasus tidak punya kolom `category` — diturunkan dari insidennya.
  const caseCategory = useMemo(() => {
    const cats = [...new Set(incidents.map((i) => i.category).filter(Boolean))];
    const groups = [...new Set(incidents.map((i) => i.sub_category).filter(Boolean))];
    if (cats.length === 0) return '—';
    const base = cats.join(', ');
    return groups.length > 0 ? `${base} — ${groups.join(', ')}` : base;
  }, [incidents]);

  const fetchIncidents = useCallback(async (caseId: string) => {
    const incRes = await apiClient<IncidentItem[]>(`/cases/${caseId}/incidents`);
    if (incRes.success && incRes.data) setIncidents(incRes.data);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const caseRes = await apiClient<CaseDetail>(`/cases/${resolvedParams.caseId}`);

      if (caseRes.success && caseRes.data) {
        setCaseData(caseRes.data);
        const studentRes = await apiClient<Record<string, unknown>>(
          `/students/${caseRes.data.student_id}`,
        );
        if (studentRes.success && studentRes.data) {
          setStudentData(studentRes.data);
        }
        const sharesRes = await apiClient<
          Array<{ share_id: string; shared_with: string; shared_with_name: string; shared_with_role: string }>
        >(`/cases/${resolvedParams.caseId}/shares`);
        if (sharesRes.success && sharesRes.data) setShares(sharesRes.data);
      }
      await fetchIncidents(resolvedParams.caseId);
      setIsLoading(false);
    };
    fetchData();
  }, [resolvedParams.caseId, fetchIncidents]);

  /* ─── Aksi risiko ─────────────────────────────────────────────────────── */

  const handleRiskOverride = async () => {
    if (!riskOverride || !justification.trim()) return;
    setIsOverriding(true);
    const res = await apiClient<CaseDetail>(`/cases/${resolvedParams.caseId}`, {
      method: 'PATCH',
      body: {
        risk_level: riskOverride,
        risk_level_source: 'MANUAL',
        metadata: { risk_override_justification: justification },
      },
    });
    if (res.success && res.data) {
      setCaseData(res.data);
      toast.success('Klasifikasi risiko berhasil diperbarui.');
    } else {
      toast.error(res.error || 'Gagal memperbarui klasifikasi risiko.');
    }
    setIsOverriding(false);
    setJustification('');
  };

  const handleGenerateSummary = async () => {
    try {
      setIsGeneratingSummary(true);
      const res = await apiClient<{ summary: string; ai_confidence_score: number }>(
        `/cases/${resolvedParams.caseId}/insights/generate`,
        { method: 'POST' },
      );

      if (res.success && res.data) {
        setCaseData((prev) => (prev ? { ...prev, summary: res.data!.summary } : null));
        toast.success('Ringkasan otomatis berhasil dibuat.');
      } else {
        toast.error('Gagal membuat ringkasan otomatis.');
      }
    } catch {
      toast.error('Terjadi kesalahan saat menghubungi layanan ringkasan otomatis.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  /* ─── Bagikan kasus ────────────────────────────────────────────────────── */

  const loadTeachers = async (page: number) => {
    setIsLoadingTeachers(true);
    const res = await apiClient<{
      rows: Array<{ user_id: string; full_name: string; email: string; role: string }>;
      total: number;
      page: number;
      hasMore: boolean;
    }>(`/users/teachers?page=${page}`);
    if (res.success && res.data) {
      setTeachers((prev) => (page === 1 ? res.data!.rows : [...prev, ...res.data!.rows]));
      setHasMoreTeachers(res.data.hasMore);
      setTeacherPage(page);
    }
    setIsLoadingTeachers(false);
  };

  const openShareDialog = async () => {
    setSelectedTeachers(shares.map((s) => s.shared_with));
    setShareDialogOpen(true);
    if (teachers.length === 0) {
      await loadTeachers(1);
    }
  };

  const toggleTeacher = (userId: string) => {
    setSelectedTeachers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleShareSave = async () => {
    if (!caseData) return;
    setIsSharing(true);
    const existingIds = shares.map((s) => s.shared_with);
    const toRemove = existingIds.filter((id) => !selectedTeachers.includes(id));
    for (const userId of toRemove) {
      await apiClient(`/cases/${caseData.case_id}/share/${userId}`, { method: 'DELETE' });
    }
    const toAdd = selectedTeachers.filter((id) => !existingIds.includes(id));
    if (toAdd.length > 0) {
      const res = await apiClient(`/cases/${caseData.case_id}/share`, {
        method: 'POST',
        body: { shared_with: toAdd, permission: 'CONTRIBUTE' },
      });
      if (!res.success) {
        toast.error(res.error || 'Gagal membagikan kasus.');
        setIsSharing(false);
        return;
      }
    }
    toast.success('Daftaran berbagi kasus diperbarui.');
    setShareDialogOpen(false);
    const sharesRes = await apiClient<
      Array<{ share_id: string; shared_with: string; shared_with_name: string; shared_with_role: string }>
    >(`/cases/${caseData.case_id}/shares`);
    if (sharesRes.success && sharesRes.data) setShares(sharesRes.data);
    setIsSharing(false);
  };

  const removeShare = async (userId: string) => {
    if (!caseData) return;
    const res = await apiClient(`/cases/${caseData.case_id}/share/${userId}`, { method: 'DELETE' });
    if (res.success) {
      setShares((prev) => prev.filter((s) => s.shared_with !== userId));
      toast.success('Berbagi kasus dihapus.');
    } else {
      toast.error('Gagal menghapus berbagi kasus.');
    }
  };

  /* ─── Guru terlibat ───────────────────────────────────────────────────── */

  const openInvolvedTeacherDialog = async (inc: IncidentItem) => {
    setEditingIncident(inc);
    setInvolvedTeacherSelect(inc.involved_teacher ?? '');
    if (teachers.length === 0) {
      await loadTeachers(1);
    }
  };

  const handleSaveInvolvedTeacher = async (teacherId: string | null) => {
    if (!editingIncident) return;
    setIsSavingTeacher(true);
    const res = await apiClient(`/incidents/${editingIncident.incident_id}`, {
      method: 'PATCH',
      body: { involved_teacher: teacherId },
    });
    setIsSavingTeacher(false);
    if (res.success) {
      toast.success(teacherId ? 'Guru terlibat berhasil diperbarui.' : 'Guru terlibat dikosongkan.');
      setEditingIncident(null);
      await fetchIncidents(resolvedParams.caseId);
    } else {
      toast.error(res.error || 'Gagal memperbarui guru terlibat.');
    }
  };

  /* ─── Status tampilan ─────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <Card>
        <EmptyState
          icon={<FileWarning />}
          title="Kasus tidak ditemukan"
          description="Kasus yang Anda cari tidak tersedia atau sudah dihapus."
          action={
            <Button variant="outline" size="sm" render={<Link href="/dashboard/cases" />}>
              <ArrowLeft className="size-4" />
              Kembali ke daftar kasus
            </Button>
          }
        />
      </Card>
    );
  }

  const isCounselor = user?.role === 'COUNSELOR';
  const openIncidents = incidents.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL');

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          caseData.student_name
            ? `Kasus ${caseData.student_name}`
            : `Kasus #${caseData.case_id.slice(0, 8)}`
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">#{caseData.case_id.slice(0, 8)}</span>
            <StatusBadge tone={severityTone(caseData.status)} label={label(STATUS_LABEL, caseData.status)} />
            <StatusBadge
              tone={severityTone(caseData.risk_level)}
              label={`Risiko ${label(RISK_LABEL, caseData.risk_level)}`}
            />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Dibuka {formatDate(caseData.opened_date)}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/cases" />}>
              <ArrowLeft className="size-4" />
              Daftar Kasus
            </Button>
            {isCounselor ? (
              <Dialog>
                <DialogTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <Ruler className="size-4" />
                      Ubah Klasifikasi Risiko
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ubah Klasifikasi Risiko</DialogTitle>
                    <DialogDescription>
                      Tentukan klasifikasi risiko secara manual. Pengaturan ini mengunci perhitungan
                      otomatis sampai diubah kembali.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="risk-override">Klasifikasi Baru</Label>
                      <Select value={riskOverride} onValueChange={(v) => setRiskOverride(v ?? '')}>
                        <SelectTrigger id="risk-override">
                          <SelectValue placeholder="Pilih klasifikasi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">Minor</SelectItem>
                          <SelectItem value="MEDIUM">Moderat</SelectItem>
                          <SelectItem value="HIGH">Mayor</SelectItem>
                          <SelectItem value="CRITICAL">Serius</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="risk-justification">Alasan Perubahan (wajib)</Label>
                      <Textarea
                        id="risk-justification"
                        placeholder="Jelaskan alasan perubahan klasifikasi risiko..."
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleRiskOverride}
                      disabled={isOverriding || !riskOverride || !justification.trim()}
                    >
                      {isOverriding ? 'Menyimpan...' : 'Terapkan Perubahan'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        }
      />

      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Insiden"
          value={incidents.length}
          hint="Insiden yang tercatat pada kasus ini."
          icon={<ClipboardList className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Insiden Serius"
          value={openIncidents.length}
          hint="Insiden dengan klasifikasi mayor atau serius."
          icon={<AlertCircle className="size-5" />}
          iconTone="red"
          progress={incidents.length ? (openIncidents.length / incidents.length) * 100 : 0}
          progressLabel="Proporsi insiden berisiko tinggi"
        />
        <StatCard
          label="Guru Terlibat"
          value={shares.length}
          hint="Guru yang dapat mengakses kasus ini."
          icon={<Users className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Sumber Klasifikasi"
          value={caseData.risk_level_source === 'AUTO' ? 'Otomatis' : 'Manual'}
          hint={`Diperbarui ${formatDate(caseData.updated_at)}`}
          icon={<Sparkles className="size-5" />}
          iconTone="slate"
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Ringkasan</TabsTrigger>
          <TabsTrigger value="incidents">
            Insiden
            <Badge variant="muted" className="ml-1.5">
              {incidents.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="interventions">Intervensi</TabsTrigger>
          <TabsTrigger value="communications">Komunikasi</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="timeline">Riwayat</TabsTrigger>
          <TabsTrigger value="counseling">Janji Temu</TabsTrigger>
        </TabsList>

        {/* ── Ringkasan ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Data siswa */}
              {studentData ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <IconBox tone="blue" size="sm">
                        <GraduationCap />
                      </IconBox>
                      <div>
                        <CardTitle>Data Siswa</CardTitle>
                        <CardDescription>Profil singkat siswa terdampak.</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setProfileDialogOpen(true)}>
                      <User className="size-4" />
                      Lihat Profil
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <InfoRow label="Nama" value={String(studentData.full_name ?? '—')} />
                    <InfoRow
                      label="ID Siswa"
                      value={String(studentData.student_id ?? caseData.student_id).slice(0, 8)}
                    />
                    {studentData.metadata
                      ? Object.entries(studentData.metadata).map(([key, val]) => (
                          <InfoRow
                            key={key}
                            label={key.charAt(0).toUpperCase() + key.slice(1)}
                            value={String(val)}
                          />
                        ))
                      : null}
                  </CardContent>
                </Card>
              ) : null}

              {/* Ringkasan otomatis */}
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <IconBox tone="purple" size="sm">
                      <Sparkles />
                    </IconBox>
                    <div>
                      <CardTitle>Ringkasan Otomatis</CardTitle>
                      <CardDescription>Menggabungkan insiden dan intervensi kasus.</CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                  >
                    <Bot className="size-4" />
                    {isGeneratingSummary ? 'Menganalisis...' : 'Buat Ringkasan'}
                  </Button>
                </CardHeader>
                <CardContent>
                  {caseData.summary ? (
                    <AiSummaryDisplay summary={caseData.summary} />
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
                      <IconBox tone="slate" size="lg">
                        <Bot />
                      </IconBox>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Belum ada ringkasan. Tekan <span className="font-semibold text-primary">Buat Ringkasan</span>{' '}
                        untuk menganalisis insiden dan catatan intervensi menjadi ringkasan singkat.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* Informasi kasus */}
              <Card>
                <CardHeader className="border-b border-border">
                  <div className="flex items-center gap-3">
                    <IconBox tone="slate" size="sm">
                      <Tags />
                    </IconBox>
                    <div>
                      <CardTitle>Informasi Kasus</CardTitle>
                      <CardDescription>Atribut utama kasus.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow
                    label="Klasifikasi"
                    value={label(RISK_LABEL, caseData.risk_level)}
                    hint={caseData.risk_level_source === 'AUTO' ? 'otomatis' : 'manual'}
                  />
                  <InfoRow label="Kategori" value={caseCategory} />
                  <InfoRow label="Status" value={label(STATUS_LABEL, caseData.status)} />
                  <InfoRow label="Tanggal laporan" value={formatDate(caseData.opened_date)} />
                  <div className="space-y-3 border-t border-border pt-3">
                    <InfoRow label="Jenis kasus" value={caseData.case_type} />
                    <InfoRow label="Tingkat sekolah" value={caseData.school_phase_ref ?? '—'} />
                    {caseData.closed_date ? (
                      <InfoRow label="Tanggal ditutup" value={formatDate(caseData.closed_date)} />
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Dibagikan dengan */}
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <IconBox tone="teal" size="sm">
                      <Share2 />
                    </IconBox>
                    <div>
                      <CardTitle>Dibagikan Kepada</CardTitle>
                      <CardDescription>Guru yang dapat mengakses kasus.</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={openShareDialog}>
                    <Users className="size-4" />
                    Kelola
                  </Button>
                </CardHeader>
                <CardContent>
                  {shares.length === 0 ? (
                    <EmptyState
                      icon={<Users />}
                      title="Belum ada guru"
                      description="Kasus ini belum dibagikan kepada guru mana pun."
                      className="py-8"
                    />
                  ) : (
                    <div className="space-y-2">
                      {shares.map((s) => (
                        <div
                          key={s.share_id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-primary-softer px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <IconBox tone="teal" size="sm">
                              <User />
                            </IconBox>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-heading">
                                {s.shared_with_name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {s.shared_with_role?.replace('_', ' ')}
                              </span>
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeShare(s.shared_with)}
                            aria-label={`Hapus berbagi kasus dengan ${s.shared_with_name}`}
                            title="Hapus berbagi kasus"
                          >
                            <X className="size-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Insiden ── */}
        <TabsContent value="incidents" className="space-y-4">
          {incidents.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ClipboardList />}
                title="Belum ada insiden"
                description="Tidak ada insiden yang tercatat pada kasus ini."
              />
            </Card>
          ) : (
            incidents.map((inc) => {
              const evidence = inc.metadata?.evidence ?? {};
              const assessment = inc.metadata?.initial_assessment ?? {};
              const involvedStudents = inc.metadata?.involved_students ?? [];
              const activeEvidence = Object.entries(evidence)
                .filter(([, v]) => v === true)
                .map(([k]) => k.toUpperCase());
              const activeAssessment: string[] = [];
              if (assessment.is_recurring) activeAssessment.push('Berulang');
              if (assessment.similar_cases) activeAssessment.push('Kasus serupa');
              if (assessment.needs_escalation) activeAssessment.push('Perlu eskalasi');
              if (assessment.needs_parent_comm) activeAssessment.push('Perlu komunikasi orang tua');

              return (
                <Card key={inc.incident_id}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-sm">{inc.category}</CardTitle>
                      {inc.sub_category ? (
                        <span className="text-xs text-muted-foreground">/ {inc.sub_category}</span>
                      ) : null}
                      <StatusBadge
                        tone={severityTone(inc.severity)}
                        label={label(RISK_LABEL, inc.severity)}
                      />
                      {inc.language_flag ? (
                        <StatusBadge tone="danger" label="Indikator Bahasa" />
                      ) : null}
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {formatDateTime(inc.incident_at)}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed text-secondary-text">{inc.description}</p>

                    {inc.immediate_actions ? (
                      <div className="rounded-xl border border-border bg-primary-softer p-3.5">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-heading">
                          <ListChecks className="size-3.5 text-primary" />
                          Tindakan yang Sudah Dilakukan
                        </p>
                        <p className="text-sm text-secondary-text">{inc.immediate_actions}</p>
                      </div>
                    ) : null}

                    {canEditIncident ||
                    inc.involved_teacher_name ||
                    inc.metadata?.manual_involved_teacher ||
                    inc.involved_teacher ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-muted-foreground">Guru Terlibat</p>
                          {inc.involved_teacher_name ||
                          inc.metadata?.manual_involved_teacher ||
                          inc.involved_teacher ? (
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-heading">
                              <User className="size-3.5 text-primary" />
                              {inc.involved_teacher_name ??
                                inc.metadata?.manual_involved_teacher ??
                                inc.involved_teacher}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground">Belum ditentukan</p>
                          )}
                        </div>
                        {canEditIncident ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openInvolvedTeacherDialog(inc)}
                          >
                            <Pencil className="size-3.5" />
                            {inc.involved_teacher_name || inc.metadata?.manual_involved_teacher
                              ? 'Ubah'
                              : 'Tentukan'}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {inc.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {inc.location}
                        </span>
                      ) : null}
                      {inc.student_grade ? (
                        <span className="flex items-center gap-1 font-medium text-primary">
                          <GraduationCap className="size-3.5" />
                          Tingkat: {inc.student_grade}
                        </span>
                      ) : null}
                      {inc.reporter_name ? (
                        <span className="flex items-center gap-1 font-medium text-primary">
                          <User className="size-3.5" />
                          Dilaporkan oleh: {inc.reporter_name}
                        </span>
                      ) : null}
                    </div>

                    {involvedStudents.length > 0 ? (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <Users className="size-3.5" />
                          Siswa yang Terlibat
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {involvedStudents.map((s) => (
                            <Badge key={s} variant="soft">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {activeEvidence.length > 0 || activeAssessment.length > 0 ? (
                      <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                        {activeEvidence.length > 0 ? (
                          <div>
                            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <Paperclip className="size-3.5" />
                              Bukti
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {activeEvidence.map((e) => (
                                <Badge key={e} variant="secondary">
                                  {label(EVIDENCE_LABEL, e)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {activeAssessment.length > 0 ? (
                          <div>
                            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <ShieldAlert className="size-3.5" />
                              Penilaian Awal
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {activeAssessment.map((a) => (
                                <StatusBadge key={a} tone="warning" label={a} />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="interventions">
          <InterventionsTab caseId={caseData.case_id} />
        </TabsContent>

        <TabsContent value="communications">
          <CommunicationsTab caseId={caseData.case_id} />
        </TabsContent>

        <TabsContent value="media">
          <MediaTab caseId={caseData.case_id} />
        </TabsContent>

        {/* ── Riwayat ── */}
        <TabsContent value="timeline">
          <Card>
            <EmptyState
              icon={<History />}
              title="Riwayat lengkap siswa"
              description="Lihat seluruh riwayat kejadian siswa pada halaman khusus riwayat siswa."
              action={
                <Button
                  size="sm"
                  render={<Link href={`/dashboard/students/${caseData.student_id}/timeline`} />}
                >
                  Buka Riwayat Siswa
                </Button>
              }
            />
          </Card>
        </TabsContent>

        {/* ── Janji Temu ── */}
        <TabsContent value="counseling">
          <CounselingTab caseId={caseData.case_id} studentId={caseData.student_id} user={user} />
        </TabsContent>
      </Tabs>

      {/* Dialog Bagikan Kasus */}
      <Dialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedTeachers([]);
          setShareDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-4 text-primary" />
              Kelola Guru yang Dapat Mengakses
            </DialogTitle>
            <DialogDescription>
              Pilih guru yang dapat melihat kasus ini dan mencatat intervensi.
            </DialogDescription>
          </DialogHeader>

          {isLoadingTeachers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data guru.</p>
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
              {hasMoreTeachers ? (
                <button
                  type="button"
                  onClick={() => loadTeachers(teacherPage + 1)}
                  className="w-full py-2 text-xs text-primary hover:underline"
                >
                  Muat lebih banyak guru
                </button>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleShareSave} disabled={isSharing}>
              {isSharing ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Guru Terlibat */}
      <Dialog
        open={!!editingIncident}
        onOpenChange={(open) => {
          if (!open) setEditingIncident(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="size-4 text-primary" />
              Tentukan Guru Terlibat
            </DialogTitle>
            <DialogDescription>
              Pilih guru yang terlibat pada insiden ini. Data ini mencatat siapa yang hadir atau
              berkaitan dengan kejadian.
            </DialogDescription>
          </DialogHeader>

          {isLoadingTeachers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data guru.</p>
          ) : (
            <div className="scroll-slim max-h-72 space-y-1 overflow-y-auto">
              {teachers.map((t) => {
                const selected = involvedTeacherSelect === t.user_id;
                return (
                  <button
                    key={t.user_id}
                    type="button"
                    onClick={() => setInvolvedTeacherSelect(t.user_id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-primary/30 bg-primary-soft'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${
                        selected ? 'border-primary bg-primary' : 'border-border'
                      }`}
                    >
                      {selected ? <Check className="size-3 text-white" /> : null}
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
              {hasMoreTeachers ? (
                <button
                  type="button"
                  onClick={() => loadTeachers(teacherPage + 1)}
                  className="w-full py-2 text-xs text-primary hover:underline"
                >
                  Muat lebih banyak guru
                </button>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleSaveInvolvedTeacher(null)}
              disabled={isSavingTeacher}
            >
              Kosongkan
            </Button>
            <Button
              onClick={() => handleSaveInvolvedTeacher(involvedTeacherSelect || null)}
              disabled={isSavingTeacher}
            >
              {isSavingTeacher ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentProfileDialog
        studentId={caseData.student_id}
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />
    </div>
  );
}

/* ─── Komponen kecil ─────────────────────────────────────────────────────── */

function InfoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-heading">
        {value}
        {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span> : null}
      </span>
    </div>
  );
}

function AiSummaryDisplay({ summary }: { summary: string }) {
  const cleanSummary = summary.replace('[AI-GENERATED SUMMARY]', '').trim();
  const paragraphs = cleanSummary.split('\n\n').filter((p) => p.trim() !== '');

  let whatHappened = cleanSummary;
  let howHandled = '';

  if (paragraphs.length >= 2) {
    whatHappened = paragraphs[0];
    howHandled = paragraphs.slice(1).join('\n\n');
  }

  const cleanText = (text: string) =>
    text
      .replace(/^(1\.|2\.|Apa yang terjadi:?|Bagaimana penanganannya:?|-|--)/i, '')
      .trim();

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-danger-soft bg-danger-soft p-3.5">
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-danger">
          <AlertCircle className="size-3.5" />
          Apa yang Terjadi
        </h4>
        <p className="whitespace-pre-wrap text-sm text-secondary-text">{cleanText(whatHappened)}</p>
      </div>

      {howHandled ? (
        <div className="rounded-xl border border-success-soft bg-success-soft p-3.5">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-success">
            <HeartHandshake className="size-3.5" />
            Bagaimana Penanganannya
          </h4>
          <p className="whitespace-pre-wrap text-sm text-secondary-text">{cleanText(howHandled)}</p>
        </div>
      ) : null}

      <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
        <Bot className="size-3.5" />
        Ringkasan dibuat otomatis dari insiden dan intervensi. Mohon periksa kebenarannya.
      </p>
    </div>
  );
}