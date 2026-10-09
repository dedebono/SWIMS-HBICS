'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, HeartHandshake, LifeBuoy, ShieldCheck } from 'lucide-react';

import { EmployeeCounselingWizard } from '@/components/employee-counseling/EmployeeCounselingWizard';
import { Card, CardContent } from '@/components/ui/card';
import { IconBox } from '@/components/ui/icon-box';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

function EmployeeCounselingContent() {
  const params = useSearchParams();
  const tenantSlug = params.get('t') || undefined;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="space-y-6">
          <PageHeader
            title="Konseling Karyawan"
            description="Form anonim — hanya dilihat oleh Konselor & Psikolog. Data Anda aman & rahasia."
          />

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-success-soft p-4">
                <IconBox tone="green" size="sm">
                  <ShieldCheck className="size-4" />
                </IconBox>
                <p className="text-sm leading-relaxed text-secondary-text">
                  Semua informasi bersifat <strong className="font-semibold text-heading">rahasia</strong>{' '}
                  dan hanya diakses oleh tim konselor berlisensi.
                </p>
              </div>
            </CardContent>
          </Card>

          <EmployeeCounselingWizard tenantSlug={tenantSlug} />

          {/* The combined flow now does NIK verification + questionnaire + booking
              in one pass. This page stays reachable because someone may only want
              to report something without waiting for a slot, but the QR link should
              point at the flow that also books. */}
          {tenantSlug && (
            <Card className="border-primary/30 bg-primary-softer">
              <CardContent className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <IconBox tone="blue" size="sm">
                    <CalendarClock className="size-4" />
                  </IconBox>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-heading">Ingin langsung dijadwalkan?</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Verifikasi NIK, isi kuisioner, dan pilih jadwal konselor sekaligus.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/book/staff?t=${encodeURIComponent(tenantSlug)}`}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] border',
                    'border-border bg-card px-4 text-sm font-medium text-heading transition-colors',
                    'hover:bg-accent',
                  )}
                >
                  <CalendarClock className="size-4" />
                  Booking + Kuisioner
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <IconBox tone="blue" size="sm">
                  <LifeBuoy className="size-4" />
                </IconBox>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-heading">Butuh bantuan segera?</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Hubungi unit kesehatan sekolah atau hotline kesehatan mental terdekat. Anda tidak
                    perlu menunggu jawaban dari formulir ini.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <HeartHandshake className="size-3.5 shrink-0" />
            SDK Harapan Bangsa siap mendampingi Anda.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function EmployeeCounselingPublicPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
          <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Memuat…</p>
        </div>
      }
    >
      <EmployeeCounselingContent />
    </Suspense>
  );
}