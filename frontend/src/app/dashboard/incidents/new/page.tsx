'use client';

import { useState, useCallback, useEffect } from 'react';
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
  case_id: string;
  category: string;
  sub_category: string;
  severity: string;
  description: string;
  location: string;
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

export default function NewIncidentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<'identify' | 'details'>('identify');
  const [qrMode, setQrMode] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [studentCases, setStudentCases] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState<FormData>({
    student_id: '',
    case_id: '',
    category: '',
    sub_category: '',
    severity: '',
    description: '',
    location: '',
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
            <CardTitle>Step 1: Identify Student</CardTitle>
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
                <div className="relative">
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

                {/* Dropdown for search results */}
                {studentSearch.length >= 2 && (
                  <div className="absolute top-12 left-0 right-0 z-10 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
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
                  </div>
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
                    ID: <span className="font-mono text-xs">{formData.student_id.slice(0, 8)}...</span>
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
                <Select value={formData.case_id} onValueChange={(v) => updateField('case_id', v ?? '')}>
                  <SelectTrigger id="case-id">
                    <SelectValue placeholder="Select case assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW" className="font-semibold text-primary">
                      + Create New Case (Auto-generated)
                    </SelectItem>
                    {studentCases.map((c: any) => (
                      <SelectItem key={c.case_id} value={c.case_id}>
                        {`Case #${c.case_id.split('-')[0]} - ${c.case_type} (${c.status})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link this incident to an existing case, or generate a new one.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => updateField('category', v ?? '')}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aggression">Aggression</SelectItem>
                      <SelectItem value="Bullying">Bullying</SelectItem>
                      <SelectItem value="Disruption">Disruption</SelectItem>
                      <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                      <SelectItem value="Self-Harm">Self-Harm</SelectItem>
                      <SelectItem value="Substance">Substance</SelectItem>
                      <SelectItem value="Attendance">Attendance</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity */}
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity *</Label>
                  <Select value={formData.severity} onValueChange={(v) => updateField('severity', v ?? '')}>
                    <SelectTrigger id="severity">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-low" /> Low
                        </span>
                      </SelectItem>
                      <SelectItem value="MEDIUM">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-medium" /> Medium
                        </span>
                      </SelectItem>
                      <SelectItem value="HIGH">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-high" /> High
                        </span>
                      </SelectItem>
                      <SelectItem value="CRITICAL">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-critical" /> Critical
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sub-category */}
              <div className="space-y-2">
                <Label htmlFor="sub-category">Sub-category</Label>
                <Input
                  id="sub-category"
                  placeholder="Optional sub-category"
                  value={formData.sub_category}
                  onChange={(e) => updateField('sub_category', e.target.value)}
                />
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

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Classroom 8A, Playground, Cafeteria"
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                />
              </div>

              {/* Date/Time */}
              <div className="space-y-2">
                <Label htmlFor="incident-at">Date & Time *</Label>
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
                  placeholder="Describe the incident in detail. Use neutral, non-labeling language."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={5}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  💡 Use objective, neutral language. Avoid stigmatizing terms.
                </p>
              </div>

              {/* Immediate Actions */}
              <div className="space-y-2">
                <Label htmlFor="immediate-actions">Immediate Actions Taken</Label>
                <Textarea
                  id="immediate-actions"
                  placeholder="Describe any actions taken immediately after the incident..."
                  value={formData.immediate_actions}
                  onChange={(e) => updateField('immediate_actions', e.target.value)}
                  rows={3}
                />
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
