'use client';

import { useRouter } from 'next/navigation';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface TopbarProps {
  user: {
    full_name: string;
    email: string;
    role: string;
  };
  onMenuClick?: () => void;
}

const roleTranslationKeys: Record<string, string> = {
  TEACHER: 'role.teacher',
  SUBSTITUTE_TEACHER: 'role.substitute_teacher',
  COUNSELOR: 'role.counselor',
  SCHOOL_NURSE: 'role.school_nurse',
  SCHOOL_HEAD: 'role.school_head',
  BOARD_MEMBER: 'role.board_member',
  CASE_REVIEWER: 'role.case_reviewer',
  IT_ADMIN: 'role.it_admin',
};

export function Topbar({ user, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { t, language } = useTranslation();
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  const initials = user.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="md:hidden -ml-1 h-9 w-9"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{t('dashboard.title')}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}
          className="text-xs h-7 px-2"
        >
          {language === 'en' ? 'ID' : 'EN'}
        </Button>
        <Badge variant="outline" className="hidden text-xs font-normal sm:inline-flex">
          {user.role in roleTranslationKeys ? t(roleTranslationKeys[user.role]) : user.role}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="relative h-9 w-9 rounded-full" />}
          >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-primary to-chart-4 text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {t('sign_out')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
