'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Memuat…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar currentPath={pathname} userRole={user.role} />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
          <Sidebar
            currentPath={pathname}
            userRole={user.role}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="scroll-slim flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[100rem] p-5 sm:p-7 lg:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}