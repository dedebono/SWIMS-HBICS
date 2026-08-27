"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ClipboardList } from "lucide-react";

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

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Persetujuan Rujukan Psikolog</h1>
        <p className="text-muted-foreground">
          Antrian rujukan dari konselor yang menunggu persetujuan Anda (pemimpin area/divisi).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <CheckCircle2 className="w-6 h-6 opacity-50" />
            <p>Tidak ada rujukan menunggu persetujuan.</p>
          </CardContent>
        </Card>
      ) : (
        items.map((r) => (
          <Card key={r.referral_id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="w-4 h-4" />
                  {refTypeLabel(r.referral_type)}
                </CardTitle>
                <Badge className="text-[10px] bg-yellow-100 text-yellow-700">{r.status}</Badge>
              </div>
              <CardDescription>
                Diusulkan oleh {r.recommended_by_name ?? "Konselor"}
                {r.appointment_type ? ` • ${r.appointment_type === "student" ? "Siswa" : "Personal"}` : ""}
                {r.created_for ? ` • ${r.created_for}` : ""}
                {r.scheduled_at
                  ? ` • ${format(new Date(r.scheduled_at), "dd MMM yyyy HH:mm", { locale: idLocale })}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{r.reason}</p>
              <div className="space-y-1">
                <Label className="text-xs">Catatan Persetujuan (opsional)</Label>
                <Textarea
                  className="text-xs"
                  rows={2}
                  placeholder="Catatan untuk konselor…"
                  value={notes[r.referral_id] ?? ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [r.referral_id]: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === r.referral_id}
                  className="gap-1.5"
                  onClick={() => decide(r.referral_id, false)}
                >
                  <XCircle className="w-4 h-4" /> Tolak
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === r.referral_id}
                  className="gap-1.5"
                  onClick={() => decide(r.referral_id, true)}
                >
                  <CheckCircle2 className="w-4 h-4" /> Setujui
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
