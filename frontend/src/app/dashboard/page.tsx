'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardRootPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    
    // Redirect EVERY role to their specific sub-dashboard folder
    switch (user.role) {
      case 'IT_ADMIN':
        router.replace('/dashboard/admin');
        break;
      case 'COUNSELOR':
        router.replace('/dashboard/counselor');
        break;
      case 'SCHOOL_HEAD':
        router.replace('/dashboard/head');
        break;
      case 'BOARD_MEMBER':
        router.replace('/dashboard/board');
        break;
      case 'SCHOOL_NURSE':
        router.replace('/dashboard/nurse');
        break;
      case 'CASE_REVIEWER':
        router.replace('/dashboard/reviewer');
        break;
      case 'STUDENT':
        router.replace('/dashboard/student');
        break;
      case 'TEACHER':
      case 'SUBSTITUTE_TEACHER':
      default:
        // Teacher dashboard is now in its own folder
        router.replace('/dashboard/teacher');
        break;
    }
  }, [user, router]);

  // Show a loading state while redirecting
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
