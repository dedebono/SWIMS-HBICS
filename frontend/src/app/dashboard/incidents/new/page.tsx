'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Search, Loader2, UploadCloud, FileIcon, X } from 'lucide-react';
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
}

/** A "Kelompok" from the Discipline Handbook, joined with its classification. */
interface HandbookGroup {
  id: number;
  group_name: string;
  category_id: number;
  category_name?: string | null;
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
  'Activity at the Time of Incident: Playing basketball on the field.',
  'Who involved: Andi (Class 8A) and Budi (Class 8B).',
  'How it happens: Andi fell while trying to catch the ball and hit the floor.',
  'When it happens: Sports period / 8 October 2026, 10:15 WITA.',
  'Who saw it: Pak Hendra (Sports Teacher) and the Class 8A students.',
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
          toast.error(`File ${file.name} is too large. Max 50MB for non-images.`);
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
    const map: Record<string, string> = { NEW: '+ Create New Case (Auto-generated)' };
    for (const c of studentCases) {
      map[c.case_id] = `Case ${c.student_name ? `${c.student_name} ` : ''}#${c.case_id.slice(0, 8)} - ${c.case_type} (${c.status})`;
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
        toast.error('Student ID not found. Please check and try again.');
        setIsValidating(false);
        return;
      }

      const student = studentRes.data;
      updateField('student_id', student.student_id);
      updateField('student_name', student.full_name || student.display_id || student.student_id);
      setStep('details');
      
      // 2. Fetch existing cases for this student
      const res = await apiClient<{ data: any[] }>(`/cases?student_id=${student.student_id}&status=OPEN`);
      if (res.success && res.data) {
        setStudentCases(res.data.data ?? res.data);
      }
    } catch (err) {
      console.error('Failed to validate student or load cases:', err);
      toast.error('Error validating student ID');
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
      setError('Please select an existing case or choose to create a new one');
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
        setError(caseRes.error ?? 'Failed to auto-create case');
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
        toast.info(`Uploading ${selectedFiles.length} files...`);
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
                toast.error(`Failed to upload ${file.name}`);
              }
            } else {
              toast.error(`Failed to initialize upload for ${file.name}`);
            }
          } catch (err) {
            console.error('File upload error:', err);
            toast.error(`Error processing ${file.name}`);
          }
        }
        toast.success('Incident and media saved successfully!');
      } else {
        toast.success('Incident saved successfully!');
      }
      
      router.push(`/dashboard/cases/${targetCaseId}`);
    } else {
      setError(res.error ?? 'Failed to submit incident');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Report Incident</h2>
          {user && (
            <Badge variant="secondary" className="font-normal text-xs">
              Reporter: {user.full_name}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Record a new student incident with details and context
        </p>
      </div>

      {/* Step 1: Student Identification */}
      {step === 'identify' && (
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle>Step 1: Reported Student</CardTitle>
            <CardDescription>
              Scan a QR code or search manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={!qrMode ? 'default' : 'outline'}
                onClick={() => setQrMode(false)}
                className="flex-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Manual Search
              </Button>
              <Button
                variant={qrMode ? 'default' : 'outline'}
                onClick={() => setQrMode(true)}
                className="flex-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                QR Scanner
              </Button>
            </div>

            {qrMode ? (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-12">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <p className="text-sm text-muted-foreground">
                  QR Scanner requires camera access (react-qr-reader).
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Full implementation in Phase 2. Use manual search for now.
                </p>
              </div>
            ) : (
              <div className="space-y-4 relative">
                <div className="relative" ref={searchWrapRef}>
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 bg-background"
                    placeholder="Search by student name or class..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Dropdown for search results — rendered via portal so the Card's
                    overflow-hidden can't clip it. Positioned under the input. */}
                {studentSearch.length >= 2 && ddPos && typeof document !== 'undefined' && createPortal(
                  <div
                    style={{ position: 'fixed', top: ddPos.top, left: ddPos.left, width: ddPos.width, zIndex: 50 }}
                    className="bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
                  >
                    {searchResults.length > 0 ? (
                      <div className="p-2 space-y-1">
                        {searchResults.map((student) => (
                          <div
                            key={student.student_id}
                            className="p-3 hover:bg-muted/50 rounded-md cursor-pointer transition-colors flex flex-col"
                            onClick={() => handleStudentSelect(student.student_id)}
                          >
                            <div className="flex justify-between items-start w-full">
                              <span className="font-medium text-sm">{student.full_name}</span>
                              {student.display_id && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono bg-primary/5">
                                  ID: {student.display_id}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              UUID: {student.student_id.slice(0, 8)}...
                              {student.metadata?.email && ` • ${student.metadata.email}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : !isSearching && (
                      <div className="p-4 text-sm text-center text-muted-foreground">
                        No students found matching "{studentSearch}"
                      </div>
                    )}
                  </div>,
                  document.body
                )}

                <p className="text-xs text-muted-foreground mt-4">
                  Or enter a Student ID (e.g. 12345) manually:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Student ID / UUID"
                    value={formData.student_id}
                    onChange={(e) => updateField('student_id', e.target.value)}
                  />
                  <Button
                    onClick={() => handleStudentSelect(formData.student_id)}
                    disabled={!formData.student_id || isValidating}
                  >
                    {isValidating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Continue
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Incident Details */}
      {step === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="glass border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Step 2: Incident Details</CardTitle>
                  <CardDescription>
                    Student: <span className="font-medium">{formData.student_name}</span>
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('identify')}>
                  Change Student
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Case Selection */}
              <div className="space-y-2">
                <Label htmlFor="case-id">Case Assignment *</Label>
                <Select
                  value={formData.case_id}
                  onValueChange={(v) => updateField('case_id', v ?? '')}
                  items={caseOptionItems}
                >
                  <SelectTrigger id="case-id">
                    <SelectValue placeholder="Select case assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW" className="font-semibold text-primary">
                      + Create New Case (Auto-generated)
                    </SelectItem>
                    {studentCases.map((c: any) => (
                      <SelectItem key={c.case_id} value={c.case_id}>
                        {`Case ${c.student_name ? `${c.student_name} ` : ''}#${c.case_id.slice(0, 8)} - ${c.case_type} (${c.status})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link this incident to an existing case, or generate a new one.
                </p>
              </div>

              {/* Vertical stack — Category (Kelompok) needs the full row width, its
                  labels are long and were being clipped next to Classification. */}
              <div className="space-y-4">
                {/* Category — derived from the discipline handbook "Kelompok" */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category (Kelompok) *</Label>
                  <Select
                    value={formData.sub_category}
                    onValueChange={(v) => handleGroupChange(v ?? '')}
                    disabled={isLoadingGroups}
                  >
                    <SelectTrigger id="category" className="h-auto w-full min-h-8 whitespace-normal py-2">
                      <SelectValue
                        placeholder={
                          isLoadingGroups ? 'Loading handbook groups…' : 'Select a violation group'
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
                          No handbook groups available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    From the Discipline Handbook. The category is set automatically from the
                    group&apos;s classification.
                  </p>
                  {/* Auto-derived, read-only */}
                  <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Classification</span>
                    {derivedCategory ? (
                      <span className="text-xs font-semibold text-primary">{derivedCategory}</span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        Select a group first
                      </span>
                    )}
                  </div>
                </div>

                {/* Classification (was Severity) */}
                <div className="space-y-2">
                  <Label htmlFor="severity">Classification *</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(v) => updateField('severity', v ?? '')}
                    items={CLASSIFICATION_ITEMS}
                  >
                    <SelectTrigger id="severity" className="w-full">
                      <SelectValue placeholder="Select classification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-low" /> Minor
                        </span>
                      </SelectItem>
                      <SelectItem value="MEDIUM">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-medium" /> Moderate
                        </span>
                      </SelectItem>
                      <SelectItem value="HIGH">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-high" /> Major
                        </span>
                      </SelectItem>
                      <SelectItem value="CRITICAL">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-critical" /> Severe
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Involved Students */}
              <div className="space-y-2">
                <Label htmlFor="involved">Involved Students / Victim(s)</Label>
                <Input
                  id="involved"
                  placeholder="Names of other students involved, separated by commas"
                  value={formData.involved_students_raw}
                  onChange={(e) => updateField('involved_students_raw', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="involved-teacher">Involved teacher (manual)</Label>
                <Input
                  id="involved-teacher"
                  placeholder="Name of involved teacher (manual entry)"
                  value={formData.involved_teacher}
                  onChange={(e) => updateField('involved_teacher', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">This is a free-text field and is not linked to the user database.</p>
              </div>

              {/* Student Grade */}
              <div className="space-y-2">
                <Label htmlFor="student-grade">Student Grade</Label>
                <Input
                  id="student-grade"
                  placeholder="e.g. KG-A, Grade 5, Grade 12"
                  value={formData.student_grade}
                  onChange={(e) => updateField('student_grade', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Free-text field (kindergarten to senior grade). Fill manually.
                </p>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Incident Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Classroom 8A, Playground, Cafeteria"
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                />
              </div>

              {/* Date/Time */}
              <div className="space-y-2">
                <Label htmlFor="incident-at">Date and Time Incident *</Label>
                <Input
                  id="incident-at"
                  type="datetime-local"
                  value={formData.incident_at}
                  onChange={(e) => updateField('incident_at', e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder={DESCRIPTION_PLACEHOLDER}
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={10}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  💡 Use objective, neutral language. Avoid stigmatizing terms.
                </p>
                {/* Structured guide so reports are complete and consistent */}
                <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">
                    Panduan penulisan (isi berurutan):
                  </p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">Activity at the Time of Incident:</span>{' '}
                      Playing basketball on the field / Practicing in the chemistry lab.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Who involved:</span> Andi (Class 8A) and
                      Budi (Class 8B).
                    </li>
                    <li>
                      <span className="font-medium text-foreground">How it happens:</span> Explain the
                      chronology neutrally, based on facts. Example: Andi fell while trying to catch the ball
                      and hit the floor.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">When it happens:</span> Sports period /
                      8 October 2026, 10:15 WITA.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Who saw it:</span> Pak Hendra (Sports
                      Teacher) and the Class 8A students.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Actions taken so far */}
              <div className="space-y-2">
                <Label htmlFor="immediate-actions">Actions Taken So Far</Label>
                <Textarea
                  id="immediate-actions"
                  placeholder="Describe any actions taken immediately after the incident..."
                  value={formData.immediate_actions}
                  onChange={(e) => updateField('immediate_actions', e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Filled in sequential order.</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 pt-4 border-t">
                {/* Evidence Section */}
                <div className="space-y-3">
                  <Label>Evidence Available</Label>
                  <div className="space-y-2">
                    {[
                      { key: 'evidence_cctv', label: 'CCTV' },
                      { key: 'evidence_photo', label: 'Foto' },
                      { key: 'evidence_video', label: 'Video' },
                      { key: 'evidence_screenshot', label: 'Screenshot' },
                      { key: 'evidence_witness', label: 'Witness Statement' },
                      { key: 'evidence_none', label: 'Tidak ada bukti' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={item.key}
                          className="h-4 w-4 rounded border-border"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Initial Assessment Section */}
                <div className="space-y-3">
                  <Label>Initial Assessment</Label>
                  <div className="space-y-2">
                    {[
                      { key: 'assess_recurring', label: 'Apakah kejadian berulang?' },
                      { key: 'assess_similar', label: 'Apakah siswa pernah punya kasus serupa?' },
                      { key: 'assess_escalation', label: 'Apakah perlu eskalasi?' },
                      { key: 'assess_parent_comm', label: 'Apakah perlu parent communication?' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={item.key}
                          className="h-4 w-4 rounded border-border"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Media Upload Zone */}
              <div className="space-y-2">
                <Label>Attachments (Photos, Videos, Documents)</Label>
                <div className="relative flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 hover:bg-muted/50 transition-colors cursor-pointer">
                  <input 
                    type="file" 
                    multiple 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                  />
                  <UploadCloud className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">
                    Click or drag & drop files here
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Images will be automatically compressed to save space. Max 50MB for videos.
                  </p>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">Selected Files ({selectedFiles.length})</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                            <span className="text-xs truncate">{file.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeFile(idx)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="button" variant="secondary">
              Save as Draft
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.category || !formData.severity || !formData.description}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Submitting...
                </span>
              ) : (
                'Submit Incident'
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
