import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'en' | 'id';

interface Translations {
  [key: string]: string;
}

const en: Translations = {
  // Topbar
  'dashboard.title': 'Dashboard',
  'role.teacher': 'Teacher',
  'role.substitute_teacher': 'Substitute Teacher',
  'role.counselor': 'Counselor',
  'role.school_nurse': 'School Nurse',
  'role.school_head': 'School Head',
  'role.board_member': 'Board Member',
  'role.case_reviewer': 'Case Reviewer',
  'role.it_admin': 'IT Admin',
  'sign_out': 'Sign Out',
  
  // Sidebar
  'nav.dashboard': 'Dashboard',
  'nav.user_management': 'User Management',
  'nav.settings': 'Settings',
  'nav.cases': 'Student Cases',
  'nav.new_incident': 'Report Incident',
  'nav.audit_logs': 'Audit Logs',
  'sidebar.subtitle': 'Wellbeing Management',
};

const id: Translations = {
  // Topbar
  'dashboard.title': 'Dasbor',
  'role.teacher': 'Guru',
  'role.substitute_teacher': 'Guru Pengganti',
  'role.counselor': 'Konselor',
  'role.school_nurse': 'Perawat Sekolah',
  'role.school_head': 'Kepala Sekolah',
  'role.board_member': 'Anggota Dewan',
  'role.case_reviewer': 'Peninjau Kasus',
  'role.it_admin': 'Admin TI',
  'sign_out': 'Keluar',
  
  // Sidebar
  'nav.dashboard': 'Dasbor',
  'nav.user_management': 'Manajemen Pengguna',
  'nav.settings': 'Pengaturan',
  'nav.cases': 'Kasus',
  'nav.new_incident': 'Insiden Baru',
  'nav.audit_logs': 'Log Audit',
  'sidebar.subtitle': 'Manajemen Kesejahteraan',
};

const dictionaries: Record<Language, Translations> = {
  en,
  id,
};

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'language-storage',
    }
  )
);

export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  const dictionary = dictionaries[language];

  const t = (key: string): string => {
    return dictionary[key] || key;
  };

  return { t, language };
}
