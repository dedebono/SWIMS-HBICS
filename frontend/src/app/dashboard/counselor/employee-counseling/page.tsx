'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Eye, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface EmployeeCounselingSubmission {
  submission_id: string;
  employee_name: string;
  unit: string | null;
  position: string | null;
  is_high_priority: boolean;
  submission_status: 'submitted' | 'in_progress' | 'completed' | 'closed';
  counselor_name: string | null;
  submitted_at: string;
  submitted_by_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Baru',
  in_progress: 'Sedang Berjalan',
  completed: 'Selesai',
  closed: 'Ditutup',
};

const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function EmployeeCounselingCounselorPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<EmployeeCounselingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high' | 'mine'>('all');

  const load = async () => {
    setLoading(true);
    let path = '/employee-counseling/submissions?limit=100';
    if (filter === 'high') path += '&is_high_priority=true';
    if (filter === 'mine') path += '&my_assignments=true';
    const res = await apiClient<{ data: EmployeeCounselingSubmission[] }>(path);
    if (res.success && Array.isArray(res.data)) setSubmissions(res.data as EmployeeCounselingSubmission[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.role === 'COUNSELOR' || user?.role === 'PSYCHOLOGIST') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, filter]);

  if (!user || (user.role !== 'COUNSELOR' && user.role !== 'PSYCHOLOGIST')) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Halaman ini hanya untuk Konselor / Psikolog.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konseling Karyawan</h1>
          <p className="text-muted-foreground">Kelola pengajuan konseling dan catat sesi karyawan.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Semua</Button>
          <Button variant={filter === 'high' ? 'destructive' : 'outline'} size="sm" onClick={() => setFilter('high')} className="gap-1">
            <AlertTriangle className="h-4 w-4" /> High Priority
          </Button>
          <Button variant={filter === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('mine')} className="gap-1">
            <CheckCircle className="h-4 w-4" /> Tugas Saya
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengajuan</CardTitle>
          <CardDescription>
            {filter === 'high' ? 'Pengajuan dengan prioritas tinggi' :
             filter === 'mine' ? 'Pengajuan yang ditugaskan ke Anda' :
             'Semua pengajuan konseling karyawan'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan konseling karyawan.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.submission_id} className={`flex items-center justify-between border rounded-lg p-4 ${s.is_high_priority ? 'border-red-300 bg-red-50/50' : ''}`}>
                  <div className="flex items-center gap-3">
                    {s.is_high_priority && (
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{s.employee_name}</p>
                        <Badge className={STATUS_COLOR[s.submission_status]}>{STATUS_LABEL[s.submission_status]}</Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        {s.unit && <span>{s.unit}</span>}
                        {s.position && <span>{s.position}</span>}
                        {s.counselor_name && <span>↓ {s.counselor_name}</span>}
                        {!s.counselor_name && s.submission_status === 'submitted' && (
                          <span className="text-yellow-600">Belum ditugaskan</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(s.submitted_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                      </p>
                      {s.submitted_by_name && (
                        <p className="text-xs text-muted-foreground">{s.submitted_by_name}</p>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/counselor/employee-counseling/${s.submission_id}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background hover:bg-muted hover:text-foreground gap-1 h-7 px-2.5 text-[0.8rem]"
                    >
                      <Eye className="h-4 w-4 mr-1" /> Detail
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
