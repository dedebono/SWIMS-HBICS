"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Calendar, ClipboardList, FileCheck2, ExternalLink } from "lucide-react";

interface CounselorAppt {
  appointment_id: string;
  type: "student" | "personal";
  status: string;
  scheduled_at: string | null;
  location: string | null;
  notes: string | null;
  created_for: string;
  student_id?: string | null;
}

interface ReferralView {
  referral_id: string;
  appointment_id: string | null;
  recommended_by: string | null;
  reason: string;
  referral_type: "internal_psychologist" | "puspaga_external";
  status: "pending" | "approved" | "rejected" | "completed";
  leader_note: string | null;
}

const apptStatusColor = (s: string) => {
  switch (s) {
    case "confirmed": return "bg-green-100 text-green-800";
    case "pending": return "bg-yellow-100 text-yellow-800";
    case "awaiting_psychologist_availability": return "bg-indigo-100 text-indigo-800";
    case "cancelled": return "bg-red-100 text-red-800";
    case "completed": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const refStatusColor = (s: string) => {
  switch (s) {
    case "approved": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "rejected": return "bg-red-100 text-red-700";
    case "completed": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-700";
  }
};

const refTypeLabel = (t: string) =>
  t === "internal_psychologist" ? "Psikolog Sekolah" : "Puspaga (Eksternal)";

export default function CounselingSessions() {
  const [appointments, setAppointments] = useState<CounselorAppt[]>([]);
  const [referrals, setReferrals] = useState<ReferralView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [refFormFor, setRefFormFor] = useState<string | null>(null);
  const [refDraft, setRefDraft] = useState<{ reason: string; type: "internal_psychologist" | "puspaga_external" }>({ reason: "", type: "internal_psychologist" });
  const [submittingRef, setSubmittingRef] = useState(false);
  const [externalResult, setExternalResult] = useState<Record<string, string>>({});
  const [savingExtId, setSavingExtId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem("swims_user") || "{}");
    const [apptRes, refRes] = await Promise.all([
      apiClient<CounselorAppt[]>(`/appointments?counselor_id=${user.user_id}`),
      apiClient<ReferralView[]>("/referrals"),
    ]);
    if (apptRes.success && apptRes.data) {
      setAppointments(apptRes.data);
      const init: Record<string, string> = {};
      apptRes.data.forEach((a) => (init[a.appointment_id] = a.notes ?? ""));
      setNotes(init);
    }
    if (refRes.success && refRes.data) setReferrals(refRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const referralFor = (apptId: string) => referrals.find((r) => r.appointment_id === apptId);

  const saveNotes = async (apptId: string) => {
    setSavingNoteId(apptId);
    const res = await apiClient(`/appointments/${apptId}/notes`, {
      method: "PATCH",
      body: { notes: notes[apptId] ?? "" },
    });
    setSavingNoteId(null);
    if (res.success) toast.success("Catatan sesi disimpan");
    else toast.error(res.error ?? "Gagal menyimpan");
  };

  const submitReferral = async (apptId: string) => {
    if (!refDraft.reason.trim()) {
      toast.error("Alasan rujukan wajib diisi.");
      return;
    }
    setSubmittingRef(true);
    const res = await apiClient("/referrals", {
      method: "POST",
      body: { appointment_id: apptId, reason: refDraft.reason, referral_type: refDraft.type },
    });
    setSubmittingRef(false);
    if (res.success) {
      toast.success("Rujukan dikirim, menunggu persetujuan School Head.");
      setRefFormFor(null);
      setRefDraft({ reason: "", type: "internal_psychologist" });
      fetchAll();
    } else {
      toast.error(res.error ?? "Gagal mengirim rujukan");
    }
  };

  const saveExternal = async (referralId: string) => {
    if (!externalResult[referralId]?.trim()) {
      toast.error("Hasil konsultasi wajib diisi.");
      return;
    }
    setSavingExtId(referralId);
    const res = await apiClient(`/referrals/${referralId}/external-result`, {
      method: "POST",
      body: { note: externalResult[referralId] },
    });
    setSavingExtId(null);
    if (res.success) {
      toast.success("Hasil konsultasi Puspaga tersimpan.");
      fetchAll();
    } else {
      toast.error(res.error ?? "Gagal menyimpan hasil");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Janji Temu & Rujukan Saya</CardTitle>
        <CardDescription>
          Isi hasil sesi konseling (poin 6) dan buat rujukan psikolog — disetujui 2 pihak (Anda + School Head).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada janji temu.</p>
        ) : (
          appointments.map((a) => {
            const ref = referralFor(a.appointment_id);
            return (
              <div key={a.appointment_id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {a.type === "student" ? "Siswa" : "Personal (Guru/Staf)"}
                      {a.created_for ? ` • ${a.created_for}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.scheduled_at
                        ? formatInTimeZone(new Date(a.scheduled_at), 'Asia/Jakarta', "dd MMM yyyy HH:mm", { locale: idLocale })
                        : "Belum dijadwalkan"}
                      {a.location ? ` • ${a.location}` : ""}
                    </p>
                  </div>
                  <Badge className={`text-[10px] ${apptStatusColor(a.status)}`}>{a.status}</Badge>
                </div>

                {/* Hasil Sesi (point 6 hook) */}
                <div className="space-y-1">
                  <Label className="text-xs">Hasil Sesi Konseling</Label>
                  <Textarea
                    className="text-xs"
                    rows={2}
                    placeholder="Catatan hasil sesi…"
                    value={notes[a.appointment_id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [a.appointment_id]: e.target.value }))}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingNoteId === a.appointment_id}
                      onClick={() => saveNotes(a.appointment_id)}
                    >
                      {savingNoteId === a.appointment_id ? "Menyimpan…" : "Simpan Catatan"}
                    </Button>
                  </div>
                </div>

                {/* Rujukan */}
                {!ref && refFormFor !== a.appointment_id && (
                  <Button size="sm" variant="secondary" className="gap-2" onClick={() => setRefFormFor(a.appointment_id)}>
                    <ClipboardList className="w-4 h-4" /> Buat Rujukan Psikolog
                  </Button>
                )}

                {!ref && refFormFor === a.appointment_id && (
                  <div className="space-y-2 border rounded p-3 bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-xs">Jenis Rujukan</Label>
                      <select
                        className="border rounded p-2 w-full text-sm"
                        value={refDraft.type}
                        onChange={(e) => setRefDraft((p) => ({ ...p, type: e.target.value as "internal_psychologist" | "puspaga_external" }))}
                      >
                        <option value="internal_psychologist">Psikolog Sekolah</option>
                        <option value="puspaga_external">Puspaga (Eksternal)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Alasan Rujukan</Label>
                      <Textarea
                        className="text-xs"
                        rows={2}
                        placeholder="Jelaskan alasan rujukan…"
                        value={refDraft.reason}
                        onChange={(e) => setRefDraft((p) => ({ ...p, reason: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setRefFormFor(null)}>Batal</Button>
                      <Button size="sm" disabled={submittingRef} onClick={() => submitReferral(a.appointment_id)}>
                        {submittingRef ? "Mengirim…" : "Kirim Rujukan"}
                      </Button>
                    </div>
                  </div>
                )}

                {ref && (
                  <div className="border rounded p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5" />
                        Rujukan: {refTypeLabel(ref.referral_type)}
                      </p>
                      <Badge className={`text-[10px] ${refStatusColor(ref.status)}`}>{ref.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{ref.reason}</p>
                    {ref.status === "rejected" && ref.leader_note && (
                      <p className="text-xs text-red-600">Ditolak: {ref.leader_note}</p>
                    )}
                    {ref.status === "approved" && ref.referral_type === "internal_psychologist" && (
                      <p className="text-xs text-green-700 flex items-center gap-1.5">
                        <FileCheck2 className="w-3.5 h-3.5" /> Disetujui — janji temu tampil di dashboard psikolog.
                      </p>
                    )}
                    {ref.status === "approved" && ref.referral_type === "puspaga_external" && (
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5" /> Hasil Konsultasi Puspaga
                        </Label>
                        <Textarea
                          className="text-xs"
                          rows={2}
                          placeholder="Isi hasil konsultasi eksternal…"
                          value={externalResult[ref.referral_id] ?? ""}
                          onChange={(e) => setExternalResult((p) => ({ ...p, [ref.referral_id]: e.target.value }))}
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            disabled={savingExtId === ref.referral_id}
                            onClick={() => saveExternal(ref.referral_id)}
                          >
                            {savingExtId === ref.referral_id ? "Menyimpan…" : "Simpan Hasil"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
