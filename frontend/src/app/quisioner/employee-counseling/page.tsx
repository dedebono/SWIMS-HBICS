'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmployeeCounselingWizard } from '@/components/employee-counseling/EmployeeCounselingWizard';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

function EmployeeCounselingContent() {
  const params = useSearchParams();
  const tenantSlug = params.get('t') || undefined;
  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 p-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Konseling Karyawan</h1>
          <p className="text-sm text-muted-foreground">
            Form anonim — hanya dilihat oleh Konselor &amp; Psikolog. Data Anda aman &amp; rahasia.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <ShieldCheck className="h-4 w-4" />
          <span>Semua informasi bersifat <strong>rahasia</strong> dan hanya diakses oleh tim konselor berlisensi.</span>
        </div>

        <EmployeeCounselingWizard tenantSlug={tenantSlug} />

        <p className="text-center text-xs text-muted-foreground">
          Butuh bantuan segera? Hubungi unit kesehatan sekolah atau hotline kesehatan mental terdekat.
        </p>
      </div>
    </main>
  );
}

export default function EmployeeCounselingPublicPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Memuat...</div>}>
      <EmployeeCounselingContent />
    </Suspense>
  );
}
