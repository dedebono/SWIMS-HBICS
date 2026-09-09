'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Users } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface Submission {
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

export default function EmployeeCounselingAdminPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'IT_ADMIN') return;
    const load = async () => {
      setLoading(true);
      const res = await apiClient<{ data: Submission[] }>('/employee-counseling/submissions?limit=200');
      if (res.success && Array.isArray(res.data)) setSubmissions(res.data as Submission[]);
      setLoading(false);
    };
    load();
  }, [user?.role]);

  if (user?.role !== 'IT_ADMIN') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Halaman ini hanya untuk IT Admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  const highCount = submissions.filter(s => s.is_high_priority).length;
  const byStatus = submissions.reduce((acc, s) => {
    acc[s.submission_status] = (acc[s.submission_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Konseling Karyawan — Admin</h1>
        <p className="text-muted-foreground">Overview & access log untuk data rahasia.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{submissions.length}</p>
                <p className="text-xs text-muted-foreground">Total Pengajuan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{highCount}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100"><FileText className="h-5 w-5 text-yellow-600" /></div>
              <div>
                <p className="text-2xl font-bold">{byStatus.submitted || 0}</p>
                <p className="text-xs text-muted-foreground">Baru</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100"><FileText className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{(byStatus.completed || 0) + (byStatus.closed || 0)}</p>
                <p className="text-xs text-muted-foreground">Selesai / Ditutup</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Submissions */}
      <Card>
        <CardHeader>
          <CardTitle>Semua Pengajuan</CardTitle>
          <CardDescription>Daftar lengkap pengajuan konseling karyawan.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="p-2">Karyawan</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">Konselor</th>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2">Pengaju</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.submission_id} className={`border-b ${s.is_high_priority ? 'bg-red-50/50' : ''}`}>
                      <td className="p-2 font-medium">{s.employee_name}</td>
                      <td className="p-2 text-muted-foreground">{s.unit || '-'}</td>
                      <td className="p-2"><Badge>{s.submission_status}</Badge></td>
                      <td className="p-2">
                        {s.is_high_priority ? (
                          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> High</Badge>
                        ) : <span className="text-muted-foreground">Normal</span>}
                      </td>
                      <td className="p-2 text-muted-foreground">{s.counselor_name || '-'}</td>
                      <td className="p-2 text-muted-foreground">
                        {format(new Date(s.submitted_at), 'dd MMM yyyy', { locale: id })}
                      </td>
                      <td className="p-2 text-muted-foreground">{s.submitted_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-4">
          <p className="text-sm text-amber-800">
            <strong>Catatan Kerahasiaan:</strong> Data konseling karyawan bersifat rahasia. Access log setiap pembukaan data tercatat otomatis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
