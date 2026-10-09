'use client';

import { createElement, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconBox } from '@/components/ui/icon-box';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/page-header';
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
import { toast } from 'sonner';
import {
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Gavel,
  GraduationCap,
  Handshake,
  HeartHandshake,
  HeartPulse,
  Lightbulb,
  MessageSquare,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Stethoscope,
  Star,
  Users,
} from 'lucide-react';

/* ─── Tipe data ──────────────────────────────────────────────────────────── */

interface InterventionRow {
  intervention_id: string;
  type: string;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  effectiveness: number | null;
  created_at: string;
  created_by?: string;
  assigned_staff?: string[];
  metadata?: {
    parent_notified?: boolean;
    parent_contact_name?: string;
    parent_contact_method?: string;
    handled_by_role?: string;
    handler_name?: string;
    follow_up_required?: boolean;
    follow_up_date?: string;
    notes?: string;
  };
}

/* ─── Konstanta Bahasa Indonesia ─────────────────────────────────────────── */

const INTERVENTION_TYPES = [
  { value: 'COUNSELING_SESSION', label: 'Sesi Konseling', icon: HeartHandshake },
  { value: 'THERAPY_REFERRAL', label: 'Rujukan Terapi', icon: Stethoscope },
  { value: 'ADVISORY_MEETING', label: 'Memberi Saran / Nasihat', icon: MessageSquare },
  { value: 'PARENT_MEETING', label: 'Pertemuan Orang Tua / Wali', icon: Users },
  { value: 'PARENT_CALL', label: 'Telepon Orang Tua / Wali', icon: Phone },
  { value: 'DISCIPLINARY_ACTION', label: 'Tindakan Disiplin', icon: Gavel },
  { value: 'PEER_MEDIATION', label: 'Mediasi Antar Teman', icon: Handshake },
  { value: 'ACADEMIC_SUPPORT', label: 'Rencana Dukungan Akademik', icon: GraduationCap },
  { value: 'WELLNESS_CHECK', label: 'Pemeriksaan Kesejahteraan', icon: HeartPulse },
  { value: 'EXTERNAL_REFERRAL', label: 'Rujukan Instansi Luar', icon: ClipboardCheck },
  { value: 'OTHER', label: 'Lainnya', icon: NotebookPen },
] as const;

const CONTACT_METHODS = [
  'Tatap Muka',
  'Telepon',
  'Surel',
  'WhatsApp / Pesan',
  'Surat',
] as const;

const HANDLER_ROLES = [
  { value: 'COUNSELOR', label: 'Konselor' },
  { value: 'TEACHER', label: 'Guru' },
  { value: 'SCHOOL_HEAD', label: 'Kepala Sekolah' },
  { value: 'EXTERNAL', label: 'Tenaga Profesional Luar' },
];

const typeIcon = (type: string) =>
  INTERVENTION_TYPES.find((t) => t.value === type)?.icon ?? ClipboardList;

const typeLabel = (type: string) =>
  INTERVENTION_TYPES.find((t) => t.value === type)?.label ?? type;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Rating Efektivitas ─────────────────────────────────────────────────── */

function EffectivenessStars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3 ${i < value ? 'fill-warning text-warning' : 'text-border'}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{value}/5</span>
    </span>
  );
}

/* ─── Kartu Intervensi ───────────────────────────────────────────────────── */

function InterventionCard({
  inv,
  onMarkComplete,
}: {
  inv: InterventionRow;
  onMarkComplete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = inv.metadata ?? {};
  const isCompleted = !!inv.completed_at;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 border-b border-border px-5 py-4 text-left transition-colors hover:bg-primary-softer"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconBox tone="purple" size="sm">
            {createElement(typeIcon(inv.type))}
          </IconBox>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-heading">{typeLabel(inv.type)}</p>
              <StatusBadge
                tone={isCompleted ? 'success' : 'warning'}
                label={isCompleted ? 'Selesai' : 'Belum Selesai'}
              />
              {meta.parent_notified ? (
                <StatusBadge tone="info" label="Orang Tua diberi tahu" />
              ) : null}
              {meta.follow_up_required ? (
                <StatusBadge tone="danger" label="Perlu Tindak Lanjut" />
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {meta.handler_name ? (
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  {meta.handler_name}
                  {meta.handled_by_role
                    ? ` (${HANDLER_ROLES.find((r) => r.value === meta.handled_by_role)?.label ?? meta.handled_by_role})`
                    : ''}
                </span>
              ) : null}
              {inv.scheduled_at ? (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  Dijadwalkan: {formatDate(inv.scheduled_at)}
                </span>
              ) : null}
              {inv.completed_at ? (
                <span className="flex items-center gap-1 font-medium text-success">
                  <CheckCircle2 className="size-3.5" />
                  Diselesaikan: {formatDate(inv.completed_at)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EffectivenessStars value={inv.effectiveness} />
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 rotate-[-90deg] text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded ? (
        <CardContent className="space-y-4 pt-4">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <BookOpen className="size-3.5" />
              Deskripsi / Cara Ditangani
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary-text">
              {inv.description}
            </p>
          </div>

          {meta.parent_notified ? (
            <div className="space-y-1.5 rounded-xl border border-info-soft bg-info-soft p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-info">
                <Phone className="size-3.5" />
                Kontak Orang Tua / Wali
              </p>
              {meta.parent_contact_name ? (
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Nama kontak</span>
                  <span className="font-medium text-heading">{meta.parent_contact_name}</span>
                </div>
              ) : null}
              {meta.parent_contact_method ? (
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Metode</span>
                  <span className="font-medium text-heading">{meta.parent_contact_method}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {inv.outcome ? (
            <div className="rounded-xl border border-border bg-primary-softer p-3.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <HeartHandshake className="size-3.5" />
                Hasil
              </p>
              <p className="whitespace-pre-wrap text-sm text-secondary-text">{inv.outcome}</p>
              {inv.effectiveness ? (
                <div className="mt-2">
                  <EffectivenessStars value={inv.effectiveness} />
                </div>
              ) : null}
            </div>
          ) : null}

          {meta.notes ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <MessageSquare className="size-3.5" />
                Catatan Tambahan
              </p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{meta.notes}</p>
            </div>
          ) : null}

          {meta.follow_up_required ? (
            <div className="rounded-xl border border-warning-soft bg-warning-soft p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <Clock className="size-3.5" />
                Perlu Tindak Lanjut
              </p>
              <p className="mt-1 text-xs text-secondary-text">
                Dijadwalkan pada{' '}
                <span className="font-semibold text-heading">
                  {formatDate(meta.follow_up_date)}
                </span>
              </p>
            </div>
          ) : null}

          {!isCompleted ? (
            <div className="flex justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => onMarkComplete(inv.intervention_id)}>
                <CheckCircle2 className="size-4" />
                Tandai Selesai
              </Button>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

/* ─── Formulir Intervensi ────────────────────────────────────────────────── */

interface FormState {
  type: string;
  handlerName: string;
  handlerRole: string;
  scheduledAt: string;
  description: string;
  parentNotified: boolean;
  parentContactName: string;
  parentContactMethod: string;
  outcome: string;
  effectiveness: string;
  followUpRequired: boolean;
  followUpDate: string;
  notes: string;
}

const defaultForm = (): FormState => ({
  type: '',
  handlerName: '',
  handlerRole: '',
  scheduledAt: new Date().toISOString().slice(0, 16),
  description: '',
  parentNotified: false,
  parentContactName: '',
  parentContactMethod: '',
  outcome: '',
  effectiveness: '',
  followUpRequired: false,
  followUpDate: '',
  notes: '',
});

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-heading">{label}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25 ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/* ─── Komponen Utama ─────────────────────────────────────────────────────── */

export function InterventionsTab({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);

  const fetchInterventions = async () => {
    setIsLoading(true);
    const res = await apiClient<InterventionRow[]>(`/cases/${caseId}/interventions`);
    if (res.success && res.data) {
      setInterventions(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInterventions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isFormValid =
    form.type.trim() !== '' && form.description.trim() !== '' && form.handlerName.trim() !== '';

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);

    const body = {
      type: form.type,
      description: form.description,
      scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      outcome: form.outcome.trim() || undefined,
      effectiveness: form.effectiveness ? Number(form.effectiveness) : undefined,
      metadata: {
        handler_name: form.handlerName.trim(),
        handled_by_role: form.handlerRole || undefined,
        parent_notified: form.parentNotified,
        parent_contact_name: form.parentNotified
          ? form.parentContactName.trim() || undefined
          : undefined,
        parent_contact_method: form.parentNotified
          ? form.parentContactMethod || undefined
          : undefined,
        follow_up_required: form.followUpRequired,
        follow_up_date:
          form.followUpRequired && form.followUpDate
            ? new Date(form.followUpDate).toISOString()
            : undefined,
        notes: form.notes.trim() || undefined,
      },
    };

    const res = await apiClient<InterventionRow>(`/cases/${caseId}/interventions`, {
      method: 'POST',
      body,
    });

    if (res.success && res.data) {
      setInterventions((prev) => [res.data!, ...prev]);
      setForm(defaultForm());
      setDialogOpen(false);
      toast.success('Intervensi berhasil dicatat.');
    } else {
      toast.error(res.error ?? 'Gagal mencatat intervensi.');
    }

    setIsSubmitting(false);
  };

  const handleMarkComplete = async (interventionId: string) => {
    const res = await apiClient<InterventionRow>(`/interventions/${interventionId}`, {
      method: 'PATCH',
      body: { completed_at: new Date().toISOString() },
    });
    if (res.success && res.data) {
      setInterventions((prev) =>
        prev.map((i) => (i.intervention_id === interventionId ? res.data! : i)),
      );
      toast.success('Intervensi ditandai selesai.');
    } else {
      toast.error('Gagal memperbarui intervensi.');
    }
  };

  const canLog = ['COUNSELOR', 'TEACHER', 'SUBSTITUTE_TEACHER', 'SCHOOL_HEAD'].includes(
    user?.role ?? '',
  );

  const completedCount = interventions.filter((i) => i.completed_at).length;
  const pendingCount = interventions.length - completedCount;
  const followUpCount = interventions.filter((i) => i.metadata?.follow_up_required).length;
  const completionRatio = interventions.length
    ? (completedCount / interventions.length) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Intervensi"
          value={interventions.length}
          hint="Catatan penanganan pada kasus ini."
          icon={<ClipboardList className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Sudah Selesai"
          value={completedCount}
          hint="Intervensi yang sudah dituntaskan."
          icon={<CheckCircle2 className="size-5" />}
          iconTone="green"
          progress={completionRatio}
          progressLabel="Proporsi intervensi selesai"
        />
        <StatCard
          label="Belum Selesai"
          value={pendingCount}
          hint="Intervensi yang belum dituntaskan."
          icon={<Clock className="size-5" />}
          iconTone="yellow"
        />
        <StatCard
          label="Perlu Tindak Lanjut"
          value={followUpCount}
          hint="Intervensi dengan tindak lanjut terjadwal."
          icon={<CalendarCheck className="size-5" />}
          iconTone="red"
        />
      </div>

      {/* Kartu aksi */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3">
            <IconBox tone="purple" size="sm">
              <ClipboardList />
            </IconBox>
            <div>
              <CardTitle>Catat Intervensi</CardTitle>
              <CardDescription>
                Dokumentasikan konseling, rujukan, kontak orang tua, atau tindakan lain yang dilakukan.
              </CardDescription>
            </div>
          </div>
          {canLog ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger
                render={
                  <Button size="sm">
                    <Plus className="size-4" />
                    Tambah Intervensi
                  </Button>
                }
              />
              <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Pencil className="size-4 text-primary" />
                    Tambah Intervensi
                  </DialogTitle>
                  <DialogDescription>
                    Catat bagaimana kasus ini ditangani — sesi konseling, nasihat, kontak orang
                    tua, atau tindakan lainnya.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Jenis Intervensi <span className="text-destructive">*</span>
                    </Label>
                    <Select value={form.type} onValueChange={(v) => setField('type', v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih jenis intervensi..." />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVENTION_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">
                        Nama Penanggung Jawab <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="Contoh: Ibu Ratih"
                        value={form.handlerName}
                        onChange={(e) => setField('handlerName', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Peran</Label>
                      <Select
                        value={form.handlerRole}
                        onValueChange={(v) => setField('handlerRole', v ?? '')}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih peran..." />
                        </SelectTrigger>
                        <SelectContent>
                          {HANDLER_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Waktu Intervensi</Label>
                    <Input
                      type="datetime-local"
                      value={form.scheduledAt}
                      onChange={(e) => setField('scheduledAt', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Deskripsi / Cara Ditangani <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      placeholder="Jelaskan apa yang dilakukan — topik sesi, nasihat yang diberikan, tindakan yang diambil..."
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-3 rounded-xl border border-border p-3.5">
                    <Toggle
                      checked={form.parentNotified}
                      onChange={(v) => setField('parentNotified', v)}
                      label="Orang Tua / Wali Sudah Diberi Tahu"
                      description="Catat kontak dengan orang tua atau wali."
                    />
                    {form.parentNotified ? (
                      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Nama Orang Tua / Wali</Label>
                          <Input
                            placeholder="Contoh: Bapak Ahmad"
                            value={form.parentContactName}
                            onChange={(e) => setField('parentContactName', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Metode Kontak</Label>
                          <Select
                            value={form.parentContactMethod}
                            onValueChange={(v) => setField('parentContactMethod', v ?? '')}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Pilih metode..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CONTACT_METHODS.map((m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Hasil <span className="font-normal text-muted-foreground">(opsional)</span>
                    </Label>
                    <Textarea
                      placeholder="Jelaskan hasil atau respon yang diterima..."
                      value={form.outcome}
                      onChange={(e) => setField('outcome', e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Efektivitas{' '}
                      <span className="font-normal text-muted-foreground">(1 = rendah, 5 = tinggi)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setField('effectiveness', form.effectiveness === String(n) ? '' : String(n))
                          }
                          aria-label={`Beri nilai efektivitas ${n} dari 5`}
                          className="rounded-lg p-0.5 transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/25"
                        >
                          <Star
                            className={`size-6 transition-colors ${
                              Number(form.effectiveness) >= n
                                ? 'fill-warning text-warning'
                                : 'text-border hover:text-warning-soft'
                            }`}
                          />
                        </button>
                      ))}
                      {form.effectiveness ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {form.effectiveness}/5
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border p-3.5">
                    <Toggle
                      checked={form.followUpRequired}
                      onChange={(v) => setField('followUpRequired', v)}
                      label="Perlu Tindak Lanjut"
                      description="Tandai bila kasus perlu ditangani kembali."
                    />
                    {form.followUpRequired ? (
                      <div className="space-y-1.5 border-t border-border pt-3">
                        <Label className="text-xs font-semibold">Tanggal Tindak Lanjut</Label>
                        <Input
                          type="date"
                          value={form.followUpDate}
                          onChange={(e) => setField('followUpDate', e.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Catatan Tambahan{' '}
                      <span className="font-normal text-muted-foreground">(opsional)</span>
                    </Label>
                    <Textarea
                      placeholder="Amatan atau konteks lain yang relevan..."
                      value={form.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter showCloseButton>
                  <Button onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
                    <ClipboardList className="size-4" />
                    {isSubmitting ? 'Menyimpan...' : 'Simpan Intervensi'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
      </Card>

      {/* Memuat */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          </CardContent>
        </Card>
      ) : interventions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lightbulb />}
            title="Belum ada intervensi"
            description="Anda belum memiliki data. Mulai dengan mencatat bagaimana kasus ini ditangani — sesi konseling, pertemuan orang tua, rujukan terapi, dan lainnya."
            action={
              canLog ? (
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  Catat Intervensi Pertama
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {interventions.map((inv) => (
            <InterventionCard
              key={inv.intervention_id}
              inv={inv}
              onMarkComplete={handleMarkComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}