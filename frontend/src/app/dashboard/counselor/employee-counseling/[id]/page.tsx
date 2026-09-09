'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, User, Calendar, Clock, FileText, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface SessionNote {
  session_id: string;
  session_number: number;
  session_date: string | null;
  method: string | null;
  section_2_presenting_concern: string | null;
  section_8_risk: { level: string; safety_action: string } | null;
  section_9_followup: { status: string; target_sesi_berikutnya: string } | null;
  created_at: string;
}

interface Submission {
  submission_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  contact_number: string | null;
  answers: any;
  is_high_priority: boolean;
  submission_status: 'submitted' | 'in_progress' | 'completed' | 'closed';
  assigned_counselor_id: string | null;
  counselor_name: string | null;
  submitted_at: string;
}

const ANSWER_LABELS_Q1: Record<string, string> = {
  'Masalah pribadi': 'Masalah pribadi',
  'Keluarga/pernikahan': 'Keluarga / Pernikahan',
  'Relasi dengan orang lain': 'Relasi dengan orang lain',
  'Pekerjaan': 'Pekerjaan',
  'Konflik di tempat kerja': 'Konflik di tempat kerja',
  'Tekanan/stres': 'Tekanan / Stres',
  'Emosi yang sulit dikelola': 'Emosi yang sulit dikelola',
  'Kehilangan/dukacita': 'Kehilangan / Dukacita',
  'Pengambilan keputusan': 'Pengambilan keputusan',
  'Pertumbuhan pribadi/kariter': 'Pertumbuhan pribadi/karakter',
  'Kehidupan rohani': 'Kehidupan rohani',
  'Membutuhkan seseorang untuk mendengarkan': 'Membutuhkan seseorang untuk mendengarkan',
  'Lainnya': 'Lainnya',
};

const AREA_LABELS: Record<string, string> = {
  'Konsentrasi': 'Konsentrasi',
  'Produktivitas kerja': 'Produktivitas kerja',
  'Hubungan dengan orang lain': 'Hubungan dengan orang lain',
  'Kondisi emosi': 'Kondisi emosi',
  'Tidur/istirahat': 'Tidur / Istirahat',
  'Aktivitas sehari-hari': 'Aktivitas sehari-hari',
  'Kehidupan keluarga': 'Kehidupan keluarga',
  'Kehidupan rohani': 'Kehidupan rohani',
  'Tidak ada dampak yang signifikan': 'Tidak ada dampak signifikan',
  'Lainnya': 'Lainnya',
};

export default function EmployeeCounselingDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [sessions, setSessions] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [subRes, sesRes] = await Promise.all([
      apiClient<Submission>(`/employee-counseling/submissions/${id}`),
      apiClient<SessionNote[]>(`/employee-counseling/submissions/${id}/sessions`),
    ]);
    if (subRes.success && subRes.data) setSubmission(subRes.data);
    if (sesRes.success && sesRes.data) setSessions(sesRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const assignToMe = async () => {
    if (!user) return;
    setAssigning(true);
    const res = await apiClient(`/employee-counseling/submissions/${id}/assign`, {
      method: 'PATCH',
      body: { counselor_id: user.user_id },
    });
    setAssigning(false);
    if (res.success) {
      toast.success('ditugaskan ke Anda');
      load();
    } else {
      toast.error(res.error ?? 'Gagal');
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Memuat...</div>;
  if (!submission) return <div className="p-6 text-muted-foreground">Tidak ditemukan.</div>;

  const answers = submission.answers || {};

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/counselor/employee-counseling"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent hover:bg-muted hover:text-foreground h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{submission.employee_name}</h1>
          <p className="text-sm text-muted-foreground">{submission.unit}{submission.position ? ` · ${submission.position}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {submission.is_high_priority && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> HIGH PRIORITY
            </Badge>
          )}
          <Badge>{submission.submission_status}</Badge>
        </div>
      </div>

      {/* Assign button */}
      {!submission.assigned_counselor_id && (
        <Card className="border-yellow-300 bg-yellow-50/50">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span>Pengajuan ini belum ditugaskan ke konselor.</span>
            </div>
            <Button size="sm" onClick={assignToMe} disabled={assigning}>
              {assigning ? 'Menugaskan...' : 'Tugaskan ke Saya'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Intake Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Form Intake Karyawan</CardTitle>
          <CardDescription>Diterima: {format(new Date(submission.submitted_at), 'dd MMMM yyyy, HH:mm')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Section B: Kebutuhan */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">A. Informasi Dasar</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Nama:</span> {submission.employee_name}</div>
              <div><span className="text-muted-foreground">Unit:</span> {submission.unit || '-'}</div>
              <div><span className="text-muted-foreground">Jabatan:</span> {submission.position || '-'}</div>
              <div><span className="text-muted-foreground">Kontak:</span> {submission.contact_number || '-'}</div>
            </div>
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">B. Kebutuhan Konseling</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Alasan utama:</p>
                <div className="flex flex-wrap gap-2">
                  {(answers.q1_alasan || []).map((a: string) => (
                    <Badge key={a} variant="outline">{ANSWER_LABELS_Q1[a] || a}</Badge>
                  ))}
                </div>
              </div>
              {answers.q2_deskripsi && (
                <div>
                  <p className="text-muted-foreground mb-1">Cerita singkat:</p>
                  <p className="bg-muted/50 rounded p-2">{answers.q2_deskripsi}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Durasi:</p>
                  <p className="font-medium">{answers.q3_durasi || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tingkat dampak ({answers.q4_dampak}/5):</p>
                  <div className="flex gap-1 mt-1">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className={`h-2 flex-1 rounded ${n <= (answers.q4_dampak || 0) ? 'bg-red-500' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Area terdampak:</p>
                <div className="flex flex-wrap gap-2">
                  {(answers.q5_area_terdampak || []).map((a: string) => (
                    <Badge key={a} variant="outline">{AREA_LABELS[a] || a}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">C. Harapan & Riwayat</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground">Harapan:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(answers.q6_harapan || []).map((a: string) => (
                    <Badge key={a} variant="outline">{a}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-muted-foreground">Pernah konseling:</p>
                  <p className="font-medium">{answers.q7_pernah_konseling || '-'}</p>
                </div>
                {answers.q7_pernah_konseling_detail && (
                  <div>
                    <p className="text-muted-foreground">Detail:</p>
                    <p className="font-medium">{answers.q7_pernah_konseling_detail}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">D. Kondisi Mendesak</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3 rounded-lg border ${answers.q8_safety_threat === 'ya' ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                <p className="text-mName text-muted-foreground">Keselamatan terancam:</p>
                <p className={`font-semibold ${answers.q8_safety_threat === 'ya' ? 'text-red-600' : ''}`}>{answers.q8_safety_threat || '-'}</p>
              </div>
              <div className={`p-3 rounded-lg border ${answers.q9_bantuan_segera === 'ya' ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                <p className="text-sm text-muted-foreground">Membutuhkan bantuan segera:</p>
                <p className={`font-semibold ${answers.q9_bantuan_segera === 'ya' ? 'text-red-600' : ''}`}>{answers.q9_bantuan_segera || '-'}</p>
              </div>
            </div>
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">E. Jadwal & Preferensi</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Waktu:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(answers.e_waktu || []).map((w: string) => <Badge key={w} variant="outline">{w}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Metode:</p>
                <p className="font-medium">{answers.e_metode || '-'}</p>
              </div>
              {answers.e_hari && <div><p className="text-muted-foreground">Hari diutamakan:</p><p className="font-medium">{answers.e_hari}</p></div>}
              <div>
                <p className="text-muted-foreground">Preferensi konselor:</p>
                <p className="font-medium">{answers.e_konselor_preferensi || '-'}</p>
              </div>
            </div>
          </div>

          <div className="border-t" />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">F. Persetujuan</h3>
            <div className="space-y-1 text-sm">
              <p className={answers.consents?.consent_confidentiality ? 'text-green-600' : 'text-red-600'}>
                ✓ {answers.consents?.consent_confidentiality ? 'Setuju' : 'Belum'} — Kerahasiaan informasi
              </p>
              <p className={answers.consents?.consent_emergency_protocol ? 'text-green-600' : 'text-red-600'}>
                ✓ {answers.consents?.consent_emergency_protocol ? 'Setuju' : 'Belum'} — Protokol darurat
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Catatan Sesi</CardTitle>
              <CardDescription>{sessions.length} sesi tercatat</CardDescription>
            </div>
            {submission.submission_status !== 'closed' && (
              <Link
                href={`/dashboard/counselor/employee-counseling/${id}/session/new`}
                className="inline-flex shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background hover:bg-muted hover:text-foreground gap-1 h-7 px-2.5 text-[0.8rem]"
              >
                <Plus className="h-4 w-4 mr-1" /> Sesi Baru
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada sesi tercatat.</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((s) => (
                <div key={s.session_id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Sesi {s.session_number}</Badge>
                      {s.session_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(s.session_date), 'dd MMM yyyy')}
                        </span>
                      )}
                      {s.method && <Badge variant="outline">{s.method === 'tatap_muka' ? 'Tatap Muka' : 'Online'}</Badge>}
                    </div>
                    {s.section_8_risk && (
                      <Badge variant={s.section_8_risk.level === 'high' ? 'destructive' : 'outline'} className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Risk: {s.section_8_risk.level}
                      </Badge>
                    )}
                  </div>
                  {s.section_2_presenting_concern && (
                    <p className="text-sm"><span className="text-muted-foreground">Concern:</span> {s.section_2_presenting_concern}</p>
                  )}
                  {s.section_9_followup?.target_sesi_berikutnya && (
                    <p className="text-sm"><span className="text-muted-foreground">Follow-up:</span> {s.section_9_followup.target_sesi_berikutnya}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
