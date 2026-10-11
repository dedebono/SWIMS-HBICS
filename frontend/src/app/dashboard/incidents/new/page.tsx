'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressPill } from '@/components/ui/stat-card';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge, severityTone } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  FileText,
  Info,
  ListChecks,
  Loader2,
  QrCode,
  Search,
  UploadCloud,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

interface FormData {
  student_id: string;
  student_name: string;
  case_id: string;
  category: string;
  sub_category: string;
  severity: string;
  description: string;
  location: string;
  student_grade: string;
  incident_at: string;
  immediate_actions: string;
  involved_students_raw: string;
  involved_teacher: string;
  evidence_cctv: boolean;
  evidence_photo: boolean;
  evidence_video: boolean;
  evidence_screenshot: boolean;
  evidence_witness: boolean;
  evidence_none: boolean;
  assess_recurring: boolean;
  assess_similar: boolean;
  assess_escalation: boolean;
  assess_parent_comm: boolean;
}

interface StudentSearchResult {
  student_id: string;
  full_name: string;
  display_id?: string;
  metadata: any;
  /** Signed 128px WebP from the API; null/omitted renders initials. */
  thumb_url?: string | null;
}

/** A "Kelompok" from the Discipline Handbook, joined with its classification. */
interface HandbookGroup {
  id: number;
  group_name: string;
  category_id: number;
  category_name?: string | null;
}

/** Label tampilan untuk nilai enum dari backend. */
const CASE_TYPE_LABEL: Record<string, string> = {
  BEHAVIORAL: 'Perilaku',
  EMOTIONAL: 'Emosional',
  MEDICAL: 'Medis',
  ACADEMIC: 'Akademik',
  POSITIVE: 'Positif',
};

const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  MONITORING: 'Dipantau',
  CLOSED: 'Ditutup',
};

function optionLabel(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[String(value).toUpperCase()] ?? value;
}

/** Maps the handbook classification to the incident Classification scale.
 *  Pelanggaran Ringan → Minor, Sedang → Moderate, Berat → Major,
 *  Sangat Berat → Severe. Unknown categories fall back to Moderate. */
const CLASSIFICATION_BY_CATEGORY: Record<number, string> = {
  1: 'Minor',      // Pelanggaran Ringan
  2: 'Moderate',   // Pelanggaran Sedang
  3: 'Major',      // Pelanggaran Berat
  4: 'Severe',     // Pelanggaran Sangat Berat
};

/** Reverse map: Classification label → the DB severity value stored on incidents. */
const DB_SEVERITY_BY_CLASSIFICATION: Record<string, string> = {
  Minor: 'LOW',
  Moderate: 'MEDIUM',
  Major: 'HIGH',
  Severe: 'CRITICAL',
};

/**
 * Base UI's <SelectValue> renders the raw item `value` in the trigger, NOT the
 * <SelectItem> children. Without `items`, picking "Minor" would show "LOW".
 * This label lookup makes the trigger display the Classification wording.
 */
const CLASSIFICATION_ITEMS = {
  LOW: 'Minor',
  MEDIUM: 'Moderate',
  HIGH: 'Major',
  CRITICAL: 'Severe',
} as const;

/** Structured template mirroring the on-screen guide, so the placeholder shows
 *  reporters exactly which five parts a complete report contains. */
const DESCRIPTION_PLACEHOLDER = [
  'Kegiatan saat insiden terjadi: Sedang bermain basket di lapangan atau melakukan praktik di laboratorium kimia.',
  'Siapa yang terlibat: Andi (Kelas 8A) dan Budi (Kelas 8B).',
  'Bagaimana kejadiannya: Jelaskan kronologi kejadian secara netral berdasarkan fakta. Contoh: Andi terjatuh saat mencoba menangkap bola, kemudian terbentur lantai.',
  'Kapan terjadi: Saat jam pelajaran olahraga, pada 8 Oktober 2026 pukul 10.15 WITA.',
  'Siapa yang menyaksikan: Pak Hendra (Guru Olahraga) dan siswa Kelas 8A.',
].join('\n');

export default function NewIncidentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<'identify' | 'details'>('identify');
  const [qrMode, setQrMode] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [studentCases, setStudentCases] = useState<any[]>([]);
  /** Signed thumbnail of the picked student — shown in the step-2 summary. */
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null);
  const [groupOptions, setGroupOptions] = useState<HandbookGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const [ddPos, setDdPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    student_id: '',
    student_name: '',
    case_id: '',
    category: '',
    sub_category: '',
    severity: '',
    description: '',
    location: '',
    student_grade: '',
    incident_at: new Date().toISOString().slice(0, 16),
    immediate_actions: '',
    involved_students_raw: '',
    involved_teacher: '',
    evidence_cctv: false,
    evidence_photo: false,
    evidence_video: false,
    evidence_screenshot: false,
    evidence_witness: false,
    evidence_none: false,
    assess_recurring: false,
    assess_similar: false,
    assess_escalation: false,
    assess_parent_comm: false,
  });

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(file => {
        if (!file.type.startsWith('image/') && file.size > 50 * 1024 * 1024) {
          toast.error(`Berkas ${file.name} terlalu besar. Maksimal 50 MB untuk berkas non-gambar.`);
          return false;
        }
        return true;
      });
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
    // Reset input so the same file can be selected again if removed
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Load "Kelompok" (behavior groups) from the Discipline Handbook once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient<HandbookGroup[]>('/discipline-handbook/groups');
        if (cancelled) return;
        if (res.success && res.data) {
          setGroupOptions(res.data);
        } else {
          setGroupOptions([]);
        }
      } catch (err) {
        console.error('Failed to load handbook groups:', err);
        if (!cancelled) setGroupOptions([]);
      } finally {
        if (!cancelled) setIsLoadingGroups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Selecting a Kelompok sets both the sub_category (the group name) and the
   *  category (its handbook classification, e.g. "Pelanggaran Berat").
   *  Classification label is derived from the category for display. */
  const handleGroupChange = (groupName: string) => {
    const group = groupOptions.find((g) => g.group_name === groupName);
    if (!group) {
      setFormData((prev) => ({ ...prev, sub_category: '', category: '' }));
      return;
    }
    const categoryName =
      group.category_name ??
      ({ 1: 'Pelanggaran Ringan', 2: 'Pelanggaran Sedang', 3: 'Pelanggaran Berat', 4: 'Pelanggaran Sangat Berat' }[
        group.category_id
      ] ?? '');
    setFormData((prev) => ({
      ...prev,
      // Store the readable group name (sub_category is TEXT), not the numeric id.
      sub_category: group.group_name,
      category: categoryName,
      // Select the matching Classification automatically.
      severity: DB_SEVERITY_BY_CLASSIFICATION[CLASSIFICATION_BY_CATEGORY[group.category_id] ?? 'Moderate'] ?? '',
    }));
  };

  /** Classification label for the currently selected group. */
  const derivedCategory = useMemo(() => {
    const group = groupOptions.find((g) => g.group_name === formData.sub_category);
    if (!group) return null;
    return CLASSIFICATION_BY_CATEGORY[group.category_id] ?? 'Moderate';
  }, [groupOptions, formData.sub_category]);

  /** Label lookup for the Case Assignment select — Base UI renders the raw
   *  value (a UUID) in the trigger unless `items` supplies the wording. */
  const caseOptionItems = useMemo(() => {
    const map: Record<string, string> = { NEW: '+ Buat Kasus Baru (dibuat otomatis)' };
    for (const c of studentCases) {
      map[c.case_id] = `Kasus ${c.student_name ? `${c.student_name} ` : ''}#${c.case_id.slice(0, 8)} · ${optionLabel(CASE_TYPE_LABEL, c.case_type)} · ${optionLabel(CASE_STATUS_LABEL, c.status)}`;
    }
    return map;
  }, [studentCases]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (studentSearch.trim().length >= 2) {
        setIsSearching(true);
        try {
          const res = await apiClient<{ data: StudentSearchResult[] }>(`/students/search?q=${encodeURIComponent(studentSearch)}`);
          if (res.success && res.data) {
            setSearchResults(res.data.data ?? res.data);
          } else {
            setSearchResults([]);
          }
        } catch (err) {
          console.error("Search error:", err);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [studentSearch]);

  // Keep the search-results dropdown positioned under the input.
  // Rendered via portal (see below) so the Card's overflow-hidden can't clip it.
  useEffect(() => {
    const open = studentSearch.trim().length >= 2;
    if (!open || !searchWrapRef.current) {
      setDdPos(null);
      return;
    }
    const update = () => {
      const r = searchWrapRef.current!.getBoundingClientRect();
      setDdPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [studentSearch, searchResults.length, isSearching]);

  const handleStudentSelect = async (idOrUuid: string) => {
    setIsValidating(true);
    try {
      // 1. Verify student exists (resolves UUID or National ID)
      const studentRes = await apiClient<any>(`/students/${encodeURIComponent(idOrUuid)}`);
      if (!studentRes.success || !studentRes.data) {
        toast.error('ID siswa tidak ditemukan. Periksa kembali dan coba lagi.');
        setIsValidating(false);
        return;
      }

      const student = studentRes.data;
      updateField('student_id', student.student_id);
      updateField('student_name', student.full_name || student.display_id || student.student_id);
      setSelectedThumb(student.thumb_url ?? null);
      setStep('details');

      // 2. Fetch existing cases for this student
      const res = await apiClient<{ data: any[] }>(`/cases?student_id=${student.student_id}&status=OPEN`);
      if (res.success && res.data) {
        setStudentCases(res.data.data ?? res.data);
      }
    } catch (err) {
      console.error('Failed to validate student or load cases:', err);
      toast.error('Gagal memvalidasi ID siswa');
    } finally {
      setIsValidating(false);
    }
  };

  /** Auto-generated cases come from discipline-handbook groups, whose category is
   *  now "Pelanggaran Ringan/Sedang/Berat/Sangat Berat" → all behavioural.
   *  Kept the legacy English names so older records still map correctly. */
  const mapCategoryToCaseType = (category: string) => {
    switch (category) {
      case 'Medical': return 'MEDICAL';
      case 'Self-Harm':
      case 'Withdrawal': return 'EMOTIONAL';
      case 'Attendance':
      case 'Academic': return 'ACADEMIC';
      case 'Positive': return 'POSITIVE';
      default: return 'BEHAVIORAL';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!formData.case_id) {
      setError('Pilih kasus yang sudah ada atau buat kasus baru terlebih dahulu.');
      setIsSubmitting(false);
      return;
    }

    let targetCaseId = formData.case_id;

    if (targetCaseId === 'NEW') {
      const caseRes = await apiClient<{ case_id: string }>('/cases', {
        method: 'POST',
        body: {
          student_id: formData.student_id,
          case_type: mapCategoryToCaseType(formData.category),
          risk_level: formData.severity,
          summary: `Auto-generated case from incident: ${formData.description.substring(0, 50)}...`,
        }
      });

      if (!caseRes.success || !caseRes.data?.case_id) {
        setError(caseRes.error ?? 'Gagal membuat kasus baru secara otomatis');
        setIsSubmitting(false);
        return;
      }
      targetCaseId = caseRes.data.case_id;
    }

    const res = await apiClient(`/cases/${targetCaseId}/incidents`, {
      method: 'POST',
      body: {
        student_id: formData.student_id,
        category: formData.category,
        sub_category: formData.sub_category || undefined,
        severity: formData.severity,
        description: formData.description,
        location: formData.location || undefined,
        student_grade: formData.student_grade || undefined,
        incident_at: new Date(formData.incident_at).toISOString(),
        immediate_actions: formData.immediate_actions || undefined,
        metadata: {
          involved_students: formData.involved_students_raw.split(',').map(s => s.trim()).filter(Boolean),
          manual_involved_teacher: formData.involved_teacher || undefined,
          evidence: {
            cctv: formData.evidence_cctv,
            photo: formData.evidence_photo,
            video: formData.evidence_video,
            screenshot: formData.evidence_screenshot,
            witness: formData.evidence_witness,
            none: formData.evidence_none,
          },
          initial_assessment: {
            is_recurring: formData.assess_recurring,
            similar_cases: formData.assess_similar,
            needs_escalation: formData.assess_escalation,
            needs_parent_comm: formData.assess_parent_comm,
          }
        }
      },
    });

    if (res.success && res.data) {
      // The incident was created. Now upload files if any.
      const incidentData = res.data as any;
      const incidentId = incidentData.incident_id || incidentData.id || incidentData.data?.incident_id;

      if (selectedFiles.length > 0 && incidentId) {
        toast.info(`Mengunggah ${selectedFiles.length} berkas...`);
        for (const file of selectedFiles) {
          try {
            // 1. Compress if image
            let fileToUpload = file;
            if (file.type.startsWith('image/')) {
              const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
              };
              fileToUpload = await imageCompression(file, options);
            }

            // 2. Get upload URL
            const uploadRes = await apiClient<{ uploadUrl: string, asset: { asset_id: string } }>('/media/upload', {
              method: 'POST',
              body: {
                file_name: fileToUpload.name,
                mime_type: fileToUpload.type,
                file_hash: 'frontend-skip-hash',
              }
            });

            if (uploadRes.success && uploadRes.data) {
              const { uploadUrl, asset } = uploadRes.data;

              // 3. PUT file directly
              const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                body: fileToUpload,
                headers: {
                  'Content-Type': fileToUpload.type,
                }
              });

              if (putRes.ok) {
                // 4. Link asset
                await apiClient(`/media/${asset.asset_id}/link`, {
                  method: 'POST',
                  body: {
                    case_id: targetCaseId,
                    incident_id: incidentId
                  }
                });
              } else {
                toast.error(`Gagal mengunggah ${file.name}`);
              }
            } else {
              toast.error(`Gagal menyiapkan unggahan untuk ${file.name}`);
            }
          } catch (err) {
            console.error('File upload error:', err);
            toast.error(`Gagal memproses ${file.name}`);
          }
        }
        toast.success('Insiden dan media berhasil disimpan!');
      } else {
        toast.success('Insiden berhasil disimpan!');
      }

      router.push(`/dashboard/cases/${targetCaseId}`);
    } else {
      setError(res.error ?? 'Gagal mengirim laporan insiden');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Insiden"
        description="Catat insiden siswa beserta detail, bukti, dan penilaian awal."
        actions={
          user ? (
            <Badge variant="soft">
              <UserRound className="size-3.5" />
              Pelapor: {user.full_name}
            </Badge>
          ) : null
        }
      />

      <Tabs
        value={step}
        onValueChange={(v) => {
          if (v === 'identify' || v === 'details') setStep(v);
        }}
        className="gap-6"
      >
        {/* Indikator langkah */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <IconBox tone={step === 'identify' ? 'blue' : 'green'} size="lg">
                  {step === 'identify' ? <Search /> : <ClipboardList />}
                </IconBox>
                <div>
                  <p className="text-sm font-semibold text-heading">
                    {step === 'identify' ? 'Langkah 1 dari 2' : 'Langkah 2 dari 2'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step === 'identify'
                      ? 'Tentukan siswa yang dilaporkan sebelum mengisi detail insiden.'
                      : 'Lengkapi kronologi, bukti, dan penilaian awal sebelum mengirim.'}
                  </p>
                </div>
              </div>
              <div className="w-full max-w-40">
                <ProgressPill
                  value={step === 'identify' ? 50 : 100}
                  label="Kemajuan pengisian laporan"
                />
              </div>
            </div>

            <TabsList className="w-full">
              <TabsTrigger value="identify">
                <Search className="size-4" />
                Siswa yang Dilaporkan
              </TabsTrigger>
              <TabsTrigger value="details" disabled={!formData.student_id}>
                <ClipboardList className="size-4" />
                Detail Insiden
              </TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        {/* Langkah 1: Identifikasi siswa */}
        <TabsContent value="identify">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <IconBox tone="blue" size="sm">
                  <UserRound />
                </IconBox>
                Siswa yang Dilaporkan
              </CardTitle>
              <CardDescription>
                Pindai kartu QR siswa atau cari manual berdasarkan nama, kelas, maupun NIS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={qrMode ? 'qr' : 'manual'}
                onValueChange={(v) => setQrMode(v === 'qr')}
                className="gap-5"
              >
                <TabsList variant="pill" className="w-full sm:w-auto">
                  <TabsTrigger value="manual">
                    <Search className="size-4" />
                    Pencarian Manual
                  </TabsTrigger>
                  <TabsTrigger value="qr">
                    <QrCode className="size-4" />
                    Pindai QR
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="qr">
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
                    <IconBox tone="slate" size="lg">
                      <QrCode />
                    </IconBox>
                    <p className="text-sm font-semibold text-heading">Pemindai QR siswa</p>
                    <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Pemindai QR membutuhkan izin akses kamera dan akan tersedia pada tahap
                      berikutnya. Untuk saat ini, gunakan pencarian manual.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="manual">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="student-search">Cari Siswa</Label>
                      <div className="relative" ref={searchWrapRef}>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="student-search"
                          className="pl-9 pr-9"
                          placeholder="Ketik nama siswa atau kelas..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                        />
                        {isSearching && (
                          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ketik minimal 2 karakter untuk melihat daftar siswa yang cocok.
                      </p>
                    </div>

                    {/* Dropdown untuk hasil pencarian — dirender via portal agar
                        overflow-hidden pada Card tidak memotongnya. */}
                    {studentSearch.length >= 2 && ddPos && typeof document !== 'undefined' && createPortal(
                      <div
                        style={{ position: 'fixed', top: ddPos.top, left: ddPos.left, width: ddPos.width, zIndex: 50 }}
                        className="max-h-60 overflow-auto rounded-xl border border-border bg-popover p-1.5 shadow-pop"
                      >
                        {searchResults.length > 0 ? (
                          <div className="space-y-1">
                            {searchResults.map((student) => (
                              <button
                                type="button"
                                key={student.student_id}
                                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-primary-softer"
                                onClick={() => handleStudentSelect(student.student_id)}
                              >
                                <UserAvatar
                                  name={student.full_name}
                                  src={student.thumb_url}
                                  accountId={student.student_id}
                                  size="md"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-heading">
                                    {student.full_name}
                                  </span>
                                  {student.metadata?.class ? (
                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                      Kelas {student.metadata.class}
                                    </span>
                                  ) : null}
                                </span>
                                {student.display_id && (
                                  <Badge variant="outline" className="shrink-0 font-mono">
                                    ID: {student.display_id}
                                  </Badge>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : !isSearching && (
                          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                            Tidak ada siswa yang cocok dengan “{studentSearch}”.
                          </p>
                        )}
                      </div>,
                      document.body
                    )}

                    <div className="space-y-2 border-t border-border pt-5">
                      <Label htmlFor="student-id">Atau masukkan ID Siswa secara manual</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="student-id"
                          placeholder="NIS/NISN atau UUID siswa (contoh: 12345)"
                          value={formData.student_id}
                          onChange={(e) => updateField('student_id', e.target.value)}
                        />
                        <Button
                          onClick={() => handleStudentSelect(formData.student_id)}
                          disabled={!formData.student_id || isValidating}
                        >
                          {isValidating ? <Loader2 className="size-4 animate-spin" /> : null}
                          Lanjutkan
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Langkah 2: Detail insiden */}
        <TabsContent value="details">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Ringkasan siswa terpilih */}
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={formData.student_name}
                    src={selectedThumb}
                    accountId={formData.student_id || null}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-heading">
                      {formData.student_name || 'Siswa belum dipilih'}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      ID: {formData.student_id ? formData.student_id.slice(0, 8) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {derivedCategory ? (
                    <StatusBadge
                      tone={severityTone(formData.severity)}
                      label={`Klasifikasi: ${derivedCategory}`}
                    />
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={() => setStep('identify')}>
                    Ganti Siswa
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Kolom utama: detail insiden */}
              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <IconBox tone="blue" size="sm">
                        <ClipboardList />
                      </IconBox>
                      Kronologi & Detail Insiden
                    </CardTitle>
                    <CardDescription>
                      Tulis laporan secara objektif, berurutan, dan lengkap.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Penugasan kasus */}
                    <div className="space-y-2">
                      <Label htmlFor="case-id">Penugasan Kasus *</Label>
                      <Select
                        value={formData.case_id}
                        onValueChange={(v) => updateField('case_id', v ?? '')}
                        items={caseOptionItems}
                      >
                        <SelectTrigger id="case-id" className="w-full">
                          <SelectValue placeholder="Pilih kasus" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NEW" className="font-semibold text-primary">
                            + Buat Kasus Baru (dibuat otomatis)
                          </SelectItem>
                          {studentCases.map((c: any) => (
                            <SelectItem key={c.case_id} value={c.case_id}>
                              {`Kasus ${c.student_name ? `${c.student_name} ` : ''}#${c.case_id.slice(0, 8)} · ${optionLabel(CASE_TYPE_LABEL, c.case_type)} · ${optionLabel(CASE_STATUS_LABEL, c.status)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Hubungkan insiden ini ke kasus yang sudah ada, atau buat kasus baru.
                      </p>
                    </div>

                    {/* Kategori (Kelompok) */}
                    <div className="space-y-2">
                      <Label htmlFor="category">Kategori (Kelompok) *</Label>
                      <Select
                        value={formData.sub_category}
                        onValueChange={(v) => handleGroupChange(v ?? '')}
                        disabled={isLoadingGroups}
                      >
                        <SelectTrigger id="category" className="h-auto w-full min-h-10 whitespace-normal py-2">
                          <SelectValue
                            placeholder={
                              isLoadingGroups ? 'Memuat kelompok handbook...' : 'Pilih kelompok pelanggaran'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--anchor-width)] max-w-[min(42rem,calc(100vw-2rem))]">
                          {groupOptions.map((g) => (
                            <SelectItem
                              key={g.id}
                              value={g.group_name}
                              className="whitespace-normal py-1.5"
                            >
                              {g.group_name}
                            </SelectItem>
                          ))}
                          {!isLoadingGroups && groupOptions.length === 0 && (
                            <SelectItem value="__none" disabled>
                              Belum ada kelompok handbook
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Diambil dari Buku Panduan Disiplin. Kategori terisi otomatis mengikuti
                        klasifikasi kelompok.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-muted/50 px-3 py-2.5">
                        <span className="text-xs font-medium text-muted-foreground">Klasifikasi</span>
                        {derivedCategory ? (
                          <StatusBadge
                            tone={severityTone(formData.severity)}
                            label={derivedCategory}
                          />
                        ) : (
                          <span className="text-xs italic text-muted-foreground">
                            Pilih kelompok terlebih dahulu
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Klasifikasi */}
                    <div className="space-y-2">
                      <Label htmlFor="severity">Klasifikasi *</Label>
                      <Select
                        value={formData.severity}
                        onValueChange={(v) => updateField('severity', v ?? '')}
                        items={CLASSIFICATION_ITEMS}
                      >
                        <SelectTrigger id="severity" className="w-full">
                          <SelectValue placeholder="Pilih klasifikasi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full bg-severity-low" /> Minor
                            </span>
                          </SelectItem>
                          <SelectItem value="MEDIUM">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full bg-severity-medium" /> Moderate
                            </span>
                          </SelectItem>
                          <SelectItem value="HIGH">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full bg-severity-high" /> Major
                            </span>
                          </SelectItem>
                          <SelectItem value="CRITICAL">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full bg-severity-critical" /> Severe
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* Siswa yang terlibat */}
                      <div className="space-y-2">
                        <Label htmlFor="involved">Siswa yang Terlibat / Korban</Label>
                        <Input
                          id="involved"
                          placeholder="Nama siswa lain yang terlibat, pisahkan dengan koma"
                          value={formData.involved_students_raw}
                          onChange={(e) => updateField('involved_students_raw', e.target.value)}
                        />
                      </div>

                      {/* Guru yang terlibat */}
                      <div className="space-y-2">
                        <Label htmlFor="involved-teacher">Guru yang Terlibat (manual)</Label>
                        <Input
                          id="involved-teacher"
                          placeholder="Nama guru yang terlibat (diisi manual)"
                          value={formData.involved_teacher}
                          onChange={(e) => updateField('involved_teacher', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Kolom teks bebas dan tidak terhubung ke basis data pengguna.
                        </p>
                      </div>

                      {/* Tingkat kelas */}
                      <div className="space-y-2">
                        <Label htmlFor="student-grade">Kelas Siswa</Label>
                        <Input
                          id="student-grade"
                          placeholder="Contoh: KG-A, Kelas 5, Kelas 12"
                          value={formData.student_grade}
                          onChange={(e) => updateField('student_grade', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Kolom teks bebas (dari taman kanak-kanak hingga kelas atas).
                        </p>
                      </div>

                      {/* Lokasi */}
                      <div className="space-y-2">
                        <Label htmlFor="location">Lokasi Insiden</Label>
                        <Input
                          id="location"
                          placeholder="Contoh: Kelas 8A, Lapangan, Kantin"
                          value={formData.location}
                          onChange={(e) => updateField('location', e.target.value)}
                        />
                      </div>

                      {/* Waktu */}
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="incident-at">Tanggal & Waktu Insiden *</Label>
                        <Input
                          id="incident-at"
                          type="datetime-local"
                          value={formData.incident_at}
                          onChange={(e) => updateField('incident_at', e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Deskripsi */}
                    <div className="space-y-2">
                      <Label htmlFor="description">Deskripsi *</Label>
                      <Textarea
                        id="description"
                        placeholder={DESCRIPTION_PLACEHOLDER}
                        value={formData.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        rows={10}
                        required
                      />
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        Gunakan bahasa objektif dan netral. Hindari istilah yang melabeli siswa.
                      </p>
                      {/* Panduan terstruktur agar laporan lengkap dan konsisten */}
                      <div className="rounded-[10px] border border-border bg-muted/50 p-4">
                        <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-heading">
                          <ListChecks className="size-3.5 text-primary" />
                          Panduan penulisan (isi berurutan)
                        </p>
                        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                          <li>
                            <span className="font-semibold text-secondary-text">Kegiatan saat insiden terjadi:</span>{' '}
                            Sedang bermain basket di lapangan atau melakukan praktik di laboratorium kimia.
                          </li>
                          <li>
                            <span className="font-semibold text-secondary-text">Siapa yang terlibat:</span>{' '}
                            Andi (Kelas 8A) dan Budi (Kelas 8B).
                          </li>
                          <li>
                            <span className="font-semibold text-secondary-text">Bagaimana kejadiannya:</span>{' '}
                            Jelaskan kronologi kejadian secara netral berdasarkan fakta. Contoh: Andi terjatuh saat
                            mencoba menangkap bola, kemudian terbentur lantai.
                          </li>
                          <li>
                            <span className="font-semibold text-secondary-text">Kapan terjadi:</span>{' '}
                            Saat jam pelajaran olahraga, pada 8 Oktober 2026 pukul 10.15 WITA.
                          </li>
                          <li>
                            <span className="font-semibold text-secondary-text">Siapa yang menyaksikan:</span>{' '}
                            Pak Hendra (Guru Olahraga) dan siswa Kelas 8A.
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Tindakan yang sudah dilakukan */}
                    <div className="space-y-2">
                      <Label htmlFor="immediate-actions">Tindakan yang Sudah Dilakukan</Label>
                      <Textarea
                        id="immediate-actions"
                        placeholder="Jelaskan tindakan yang segera dilakukan setelah insiden terjadi..."
                        value={formData.immediate_actions}
                        onChange={(e) => updateField('immediate_actions', e.target.value)}
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">Diisi secara berurutan.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kolom samping: bukti, penilaian, lampiran */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <IconBox tone="teal" size="sm">
                        <Users />
                      </IconBox>
                      Bukti yang Tersedia
                    </CardTitle>
                    <CardDescription>
                      Centang bukti pendukung insiden, jika ada.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { key: 'evidence_cctv', label: 'Rekaman CCTV' },
                      { key: 'evidence_photo', label: 'Foto' },
                      { key: 'evidence_video', label: 'Video' },
                      { key: 'evidence_screenshot', label: 'Tangkapan layar' },
                      { key: 'evidence_witness', label: 'Pernyataan saksi' },
                      { key: 'evidence_none', label: 'Tidak ada bukti' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        htmlFor={item.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2 transition-colors hover:bg-primary-softer"
                      >
                        <input
                          type="checkbox"
                          id={item.key}
                          className="size-4 accent-[var(--color-primary)]"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <span className="text-sm text-secondary-text">{item.label}</span>
                      </label>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <IconBox tone="purple" size="sm">
                        <AlertTriangle />
                      </IconBox>
                      Penilaian Awal
                    </CardTitle>
                    <CardDescription>
                      Tandai hal yang relevan untuk tindak lanjut.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { key: 'assess_recurring', label: 'Apakah kejadian ini berulang?' },
                      { key: 'assess_similar', label: 'Apakah siswa pernah punya kasus serupa?' },
                      { key: 'assess_escalation', label: 'Apakah perlu eskalasi?' },
                      { key: 'assess_parent_comm', label: 'Apakah perlu komunikasi kepada orang tua?' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        htmlFor={item.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2 transition-colors hover:bg-primary-softer"
                      >
                        <input
                          type="checkbox"
                          id={item.key}
                          className="size-4 accent-[var(--color-primary)]"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <span className="text-sm text-secondary-text">{item.label}</span>
                      </label>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <IconBox tone="blue" size="sm">
                        <UploadCloud />
                      </IconBox>
                      Lampiran
                    </CardTitle>
                    <CardDescription>
                      Foto, video, atau dokumen pendukung insiden.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary-softer">
                      <input
                        type="file"
                        multiple
                        aria-label="Unggah lampiran insiden"
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                        onChange={handleFileChange}
                      />
                      <IconBox tone="blue" size="lg">
                        <UploadCloud />
                      </IconBox>
                      <p className="text-sm font-medium text-heading">
                        Klik atau tarik &amp; letakkan berkas di sini
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Gambar otomatis dikompres. Maksimal 50 MB untuk video.
                      </p>
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="card-label">
                          Berkas dipilih ({selectedFiles.length})
                        </p>
                        <div className="space-y-2">
                          {selectedFiles.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 p-2"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <IconBox tone="slate" size="sm">
                                  <FileText />
                                </IconBox>
                                <span className="truncate text-xs text-secondary-text">
                                  {file.name}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Hapus berkas ${file.name}`}
                                title={`Hapus ${file.name}`}
                                onClick={() => removeFile(idx)}
                              >
                                <X className="size-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Galat */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Aksi */}
            <Card>
              <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-end">
                <p className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5 shrink-0 text-primary" />
                  Pastikan kategori, klasifikasi, dan deskripsi sudah terisi sebelum dikirim.
                </p>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Batal
                </Button>
                <Button type="button" variant="secondary">
                  Simpan sebagai Draf
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !formData.category || !formData.severity || !formData.description}
                >
                  {isSubmitting ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Mengirim...
                    </>
                  ) : (
                    'Kirim Laporan'
                  )}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}