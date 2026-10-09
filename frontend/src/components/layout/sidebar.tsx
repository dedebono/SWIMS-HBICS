'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LogOut } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';

/** One sidebar entry: label, route, icon and the roles allowed to see it. */
interface NavItem {
  label: string;
  i18nKey?: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  roles: string[];
}

const ALL_STAFF = [
  'TEACHER',
  'SUBSTITUTE_TEACHER',
  'COUNSELOR',
  'SCHOOL_NURSE',
  'SCHOOL_HEAD',
  'BOARD_MEMBER',
  'CASE_REVIEWER',
  'IT_ADMIN',
  'PERSONAL',
  'PSYCHOLOGIST',
];

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    i18nKey: 'nav.dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
    roles: ALL_STAFF,
  },
  {
    label: 'Kasus Siswa',
    i18nKey: 'nav.cases',
    href: '/dashboard/cases',
    icon: FolderIcon,
    // IT_ADMIN is intentionally excluded: admin IT handles system
    // configuration (users, roles, questionnaires, settings) and has no
    // business reading student wellbeing cases.
    roles: ALL_STAFF.filter((r) => r !== 'IT_ADMIN'),
  },
  {
    label: 'Laporan Insiden',
    i18nKey: 'nav.new_incident',
    href: '/dashboard/incidents/new',
    icon: AlertIcon,
    roles: ['TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_HEAD'],
  },
  {
    label: 'Persetujuan Rujukan',
    href: '/dashboard/approvals',
    icon: CheckSquareIcon,
    roles: ['SCHOOL_HEAD'],
  },
  {
    label: 'Konseling Karyawan',
    href: '/dashboard/counselor/employee-counseling',
    icon: HeartIcon,
    roles: ['COUNSELOR', 'PSYCHOLOGIST'],
  },
  {
    label: 'Buku Pedoman Disiplin',
    href: '/dashboard/teacher/discipline-handbook',
    icon: BookIcon,
    roles: ['TEACHER', 'SUBSTITUTE_TEACHER', 'COUNSELOR', 'SCHOOL_HEAD'],
  },
  {
    label: 'Buku Pedoman Disiplin',
    href: '/dashboard/admin/discipline-handbook',
    icon: BookIcon,
    roles: ['IT_ADMIN'],
  },
  {
    label: 'Manajemen Pengguna',
    i18nKey: 'nav.user_management',
    href: '/dashboard/admin/users',
    icon: UsersIcon,
    roles: ['IT_ADMIN'],
  },
  {
    label: 'Psikolog',
    href: '/dashboard/admin/psychologists',
    icon: StethoscopeIcon,
    roles: ['IT_ADMIN'],
  },
  {
    label: 'Kelola Kuisiner',
    href: '/dashboard/admin/quisioner',
    icon: ClipboardIcon,
    roles: ['IT_ADMIN'],
  },
  {
    label: 'Konseling Karyawan',
    href: '/dashboard/admin/employee-counseling',
    icon: HeartIcon,
    roles: ['IT_ADMIN'],
  },
  {
    label: 'Log Audit',
    i18nKey: 'nav.audit_logs',
    href: '/dashboard/audit-logs',
    icon: HistoryIcon,
    roles: ['SCHOOL_HEAD'],
  },
  {
    label: 'Pengaturan',
    i18nKey: 'nav.settings',
    href: '/dashboard/admin/settings',
    icon: SettingsIcon,
    roles: ['IT_ADMIN'],
  },
];

// ── Outline icons (24×24, stroke 1.8) ───────────────────────────────────────

function LayoutDashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="7" height="9" x="3" y="3" rx="2" />
      <rect width="7" height="5" x="14" y="3" rx="2" />
      <rect width="7" height="9" x="14" y="12" rx="2" />
      <rect width="7" height="5" x="3" y="16" rx="2" />
    </svg>
  );
}

function FolderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
      <path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" />
      <path d="M15 2v5h5" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CheckSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function HeartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function BookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function StethoscopeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function ClipboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="16" height="18" x="4" y="4" rx="2" />
      <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}

function HistoryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </svg>
  );
}

function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface SidebarProps {
  currentPath: string;
  userRole: string;
  onNavigate?: () => void;
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

export function Sidebar({ currentPath, userRole, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const router = useRouter();

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  const items = visibleItems;

  const fullName = user?.full_name ?? 'Pengguna';
  const email = user?.email ?? '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebar md:w-[17rem]">
      {/* Profile summary at the top */}
      <div className="shrink-0 border-b border-border px-4 py-5">
        <div className="flex items-center gap-3 rounded-xl bg-[#f7faff] p-3">
          <UserAvatar
            name={fullName}
            src={user?.avatar_url}
            accountId={user?.user_id}
            size="md"
          />
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] font-semibold text-heading">{fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabels[userRole] ?? userRole}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navigasi utama" className="scroll-slim flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Menu
        </p>
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive =
              currentPath === item.href ||
              (item.href !== '/dashboard' && currentPath.startsWith(item.href));

            const Icon = item.icon;

            return (
              <li key={`${item.href}-${item.label}`}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.8125rem] font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-button'
                      : 'text-secondary-text hover:bg-accent hover:text-heading'
                  )}
                >
                  <Icon className="size-[1.125rem] shrink-0" />
                  <span className="truncate">{item.i18nKey ? t(item.i18nKey) : item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout pinned to the bottom */}
      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-[#b42318]"
        >
          <LogOut className="size-[1.125rem] shrink-0" />
          {t('sign_out')}
        </button>
        <p className="mt-2 truncate px-3 text-[0.6875rem] text-muted-foreground/70">{email}</p>
      </div>
    </aside>
  );
}