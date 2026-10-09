"use client";

import { useEffect, useMemo, useState } from "react";
import { id as idLocale } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconBox } from "@/components/ui/icon-box";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, severityTone } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api-client";

interface ReferralRow {
  referral_id: string;
  appointment_id: string | null;
  recommended_by_name: string | null;
  reason: string;
  referral_type: "internal_psychologist" | "puspaga_external";
  status: "pending" | "approved" | "rejected" | "completed";
  leader_note: string | null;
  appointment_type: string | null;
  appointment_status: string | null;
  scheduled_at: string | null;
  created_for: string | null;
}

const refTypeLabel = (t: string) =>
  t === "internal_psychologist" ? "Psikolog Sekolah" : "Puspaga (Eksternal)";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const res = await apiClient<ReferralRow[]>("/referrals");
    if (res.success && res.data) setItems(res.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    const res = await apiClient(`/referrals/${id}/approve`, {
      method: "POST",
      body: { approve, note: notes[id] ?? "" },
    });
    setBusyId(null);
    if (res.success) {
      toast.success(approve ? "Rujukan disetujui." : "Rujukan ditolak.");
      fetchAll();
    } else {
      toast.error(res.error ?? "Gagal memproses rujukan");
    }
  };

  const stats = useMemo(
    () => ({
      total: items.length,
      pending: items.filter((r) => r.status === "pending").length,
      approved: items.filter((r) => r.status === "approved").length,
      rejected: items.filter((r) => r.status === "rejected").length,
    }),
    [items]
  );

  const decided = stats.approved + stats.rejected;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persetujuan Rujukan Psikolog"
        description="Antrian rujukan dari konselor yang menunggu persetujuan Anda sebagai pemimpin area atau divisi."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Rujukan"
          value={stats.total}
          hint="Seluruh rujukan yang masuk ke meja Anda"
          icon={<ClipboardList className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Menunggu Persetujuan"
          value={stats.pending}
          hint="Perlu ditinjau dan diputuskan"
          icon={<Inbox className="size-5" />}
          iconTone="yellow"
          trend={stats.pending > 0 ? "up" : "flat"}
          trendLabel={stats.pending > 0 ? "Perlu tindakan" : "Semua beres"}
        />
        <StatCard
          label="Disetujui"
          value={stats.approved}
          hint="Rujukan diteruskan ke psikolog tujuan"
          icon={<CheckCircle2 className="size-5" />}
          iconTone="green"
          trend="up"
          trendLabel="Sudah diproses"
        />
        <StatCard
          label="Ditolak"
          value={stats.rejected}
          hint="Rujukan tidak dilanjutkan"
          icon={<XCircle className="size-5" />}
          iconTone="red"
          progress={stats.total > 0 ? (decided / stats.total) * 100 : 0}
          progressLabel="Progres keputusan rujukan"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Antrean Rujukan</CardTitle>
          <CardDescription>
            Baca alasan rujukan, tambahkan catatan bila perlu, lalu setujui atau tolak.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm font-medium text-muted-foreground">Memuat antrean rujukan…</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-6" />}
              title="Tidak ada rujukan menunggu persetujuan"
              description="Semua rujukan sudah diproses. Rujukan baru dari konselor akan otomatis tampil di sini."
            />
          ) : (
            items.map((r) => (
              <div
                key={r.referral_id}
                className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <IconBox tone="purple" size="sm">
                      <ClipboardList className="size-4" />
                    </IconBox>
                    <div className="min-w-0 space-y-1">
                      <p className="font-heading text-sm font-semibold text-heading">
                        {refTypeLabel(r.referral_type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Diusulkan oleh {r.recommended_by_name ?? "Konselor"}
                        {r.appointment_type
                          ? ` • ${r.appointment_type === "student" ? "Siswa" : "Personal"}`
                          : ""}
                        {r.created_for ? ` • ${r.created_for}` : ""}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={severityTone(r.status)}
                    label={STATUS_LABEL[r.status] ?? r.status}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {r.scheduled_at ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {formatInTimeZone(new Date(r.scheduled_at), "Asia/Jakarta", "dd MMM yyyy HH:mm", {
                        locale: idLocale,
                      })}
                    </span>
                  ) : null}
                  {r.created_for ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserRound className="size-3.5 shrink-0" />
                      {r.created_for}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background p-3.5">
                  <p className="text-xs font-semibold text-heading">Alasan rujukan</p>
                  <p className="mt-1 text-sm leading-relaxed text-secondary-text">{r.reason}</p>
                </div>

                <div className="mt-4 space-y-2">
                  <Label htmlFor={`note-${r.referral_id}`}>Catatan persetujuan (opsional)</Label>
                  <Textarea
                    id={`note-${r.referral_id}`}
                    rows={2}
                    placeholder="Catatan untuk konselor…"
                    value={notes[r.referral_id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [r.referral_id]: e.target.value }))}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busyId === r.referral_id}
                    onClick={() => decide(r.referral_id, false)}
                  >
                    <XCircle className="size-4" /> Tolak
                  </Button>
                  <Button
                    disabled={busyId === r.referral_id}
                    onClick={() => decide(r.referral_id, true)}
                  >
                    <CheckCircle2 className="size-4" /> Setujui
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}