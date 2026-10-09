'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTranslation, useLanguageStore } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { LogOut, Menu, Search, Bell, ChevronDown } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';

interface TopbarProps {
  user: {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    /** Signed 128px WebP URL from /auth/login, or null when no photo is set. */
    avatar_url?: string | null;
  };
  onMenuClick?: () => void;
}

const roleLabels: Record<string, string> = {
  TEACHER: 'Guru',
  SUBSTITUTE_TEACHER: 'Guru Pengganti',
  COUNSELOR: 'Konselor',
  SCHOOL_NURSE: 'Perawat Sekolah',
  SCHOOL_HEAD: 'Kepala Sekolah',
  BOARD_MEMBER: 'Anggota Dewan',
  CASE_REVIEWER: 'Peninjau Kasus',
  IT_ADMIN: 'Admin TI',
  PSYCHOLOGIST: 'Psikolog',
  PERSONAL: 'Personal',
  STUDENT: 'Siswa',
};

/** Human-readable title for the current route, shown next to the logo. */
function useRouteTitle(): string {
  const pathname = usePathname();
  const titles: [string, string][] = [
    ['/dashboard/admin/users', 'Manajemen Pengguna'],
    ['/dashboard/admin/settings', 'Pengaturan'],
    ['/dashboard/admin/quisioner', 'Kelola Kuisiner'],
    ['/dashboard/admin/psychologists', 'Data Psikolog'],
    ['/dashboard/admin/employee-counseling', 'Konseling Karyawan'],
    ['/dashboard/admin/discipline-handbook', 'Buku Pedoman Disiplin'],
    ['/dashboard/admin', 'Dasbor Admin'],
    ['/dashboard/teacher/discipline-handbook', 'Buku Pedoman Disiplin'],
    ['/dashboard/incidents/new', 'Laporan Insiden'],
    ['/dashboard/incidents', 'Daftar Insiden'],
    ['/dashboard/cases', 'Kasus Siswa'],
    ['/dashboard/approvals', 'Persetujuan Rujukan'],
    ['/dashboard/audit-logs', 'Log Audit'],
    ['/dashboard/counselor/employee-counseling', 'Konseling Karyawan'],
    ['/dashboard/students', 'Data Siswa'],
    ['/dashboard/timeline', 'Linimasa Siswa'],
    ['/dashboard/quisioner', 'Kuisiner'],
    ['/dashboard/head', 'Dasbor Kepala Sekolah'],
    ['/dashboard/board', 'Dasbor Dewan'],
    ['/dashboard/teacher', 'Dasbor Guru'],
    ['/dashboard/counselor', 'Dasbor Konselor'],
    ['/dashboard/nurse', 'Dasbor Perawat'],
    ['/dashboard/reviewer', 'Dasbor Peninjau'],
    ['/dashboard/psychologist', 'Dasbor Psikolog'],
    ['/dashboard/personal', 'Dasbor Personal'],
    ['/dashboard/student', 'Dasbor Siswa'],
    ['/dashboard', 'Dasbor'],
  ];

  for (const [prefix, title] of titles) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return 'Dasbor';
}

export function Topbar({ user, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { language } = useTranslation();
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const routeTitle = useRouteTitle();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      {/* Brand + current section */}
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="md:hidden -ml-1"
          aria-label="Buka menu navigasi"
        >
          <Menu className="size-5" />
        </Button>

        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-button">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold leading-tight text-heading">
              SWIMS
            </p>
            <p className="hidden truncate text-[0.6875rem] leading-tight text-muted-foreground sm:block">
              {routeTitle}
            </p>
          </div>
        </div>
      </div>

      {/* Search — expands on mobile */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div
          className={[
            'relative transition-all duration-200',
            searchOpen ? 'w-full sm:w-72' : 'w-10 sm:w-64',
          ].join(' ')}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Cari siswa, kasus, laporan..."
            aria-label="Pencarian"
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            className="h-9 w-full rounded-[10px] border border-border bg-[#f7faff] pl-9 pr-3 text-sm text-heading outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:ring-3 focus:ring-ring/15"
          />
        </div>

        {/* Language toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}
          className="hidden h-9 px-2.5 text-xs font-semibold sm:inline-flex"
          aria-label="Ganti bahasa"
        >
          {language === 'en' ? 'ID' : 'EN'}
        </Button>

        {/* Notifications */}
        <button
          type="button"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-secondary-text transition-colors hover:bg-accent hover:text-heading"
          aria-label="Notifikasi"
        >
          <Bell className="size-[1.125rem]" />
          <span
            className="absolute right-2 top-2 size-1.5 rounded-full bg-danger ring-2 ring-card"
            aria-hidden="true"
          />
        </button>

        {/* Profile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex shrink-0 items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 transition-colors hover:bg-accent"
                aria-label="Menu profil"
              />
            }
          >
            <UserAvatar
              name={user.full_name}
              src={user.avatar_url}
              accountId={user.user_id}
              size="sm"
            />
            <span className="hidden min-w-0 text-left lg:block">
              <span className="block max-w-[10rem] truncate text-[0.8125rem] font-semibold leading-tight text-heading">
                {user.full_name}
              </span>
              <span className="block text-[0.6875rem] leading-tight text-muted-foreground">
                {roleLabels[user.role] ?? user.role}
              </span>
            </span>
            <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-heading">{user.full_name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}
                className="cursor-pointer"
              >
                {language === 'en' ? 'Ganti ke Bahasa Indonesia' : 'Switch to English'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-[#b42318]"
              >
                <LogOut className="mr-2 size-4" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}