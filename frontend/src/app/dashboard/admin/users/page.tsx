"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UploadCloud, RefreshCw, Search, Filter, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import Papa from "papaparse";

type Role = 'STUDENT' | 'TEACHER' | 'COUNSELOR' | 'SCHOOL_HEAD' | 'SCHOOL_NURSE' | 'BOARD_MEMBER' | 'CASE_REVIEWER' | 'HOMEROOM_TEACHER' | 'IT_ADMIN' | 'SUBSTITUTE_TEACHER';

interface UserData {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  type: 'STAFF' | 'STUDENT';
  national_id?: string;
}

export default function AdminUsersPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    role: "STUDENT" as Role,
    national_id: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<'full_name' | 'role'>('full_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const fetchUsers = async (showToast = false) => {
    setIsLoadingUsers(true);
    try {
      const res = await apiClient<{ data?: UserData[] }>("/admin/users");
      if (res.success) {
        setUsers(res.data as any || []);
        if (showToast) toast.success("User directory refreshed successfully.");
      } else {
        toast.error("Failed to load user list");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while fetching users");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers(false);
  }, []);

  const filteredAndSortedUsers = users
    .filter(user => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
                           (user.national_id?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'full_name') {
        return a.full_name.localeCompare(b.full_name) * factor;
      } else {
        return a.role.localeCompare(b.role) * factor;
      }
    });

  const toggleSort = (field: 'full_name' | 'role') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || (!formData.email && formData.role !== 'STUDENT')) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient("/admin/users", {
        method: "POST",
        body: formData,
      });

      if (res.success) {
        toast.success(`User ${formData.full_name} has been added successfully!`);
        setFormData({ full_name: "", email: "", role: "STUDENT", national_id: "" });
        fetchUsers();
      } else {
        toast.error(res.error || "Failed to add user.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,full_name,email,role,national_id\nJohn Doe,john.doe@example.edu,STUDENT,123456789\nJane Smith,jane.smith@example.edu,TEACHER,987654321";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "user_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template downloaded.");
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error("Please select a CSV file first.");
      return;
    }

    setIsBulkSubmitting(true);
    Papa.parse(bulkFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Validate and clean data
          const parsedUsers = results.data.map((row: any) => ({
            full_name: row.full_name?.trim(),
            email: row.email?.trim(),
            role: (row.role?.trim().toUpperCase() || "STUDENT") as Role,
            national_id: row.national_id?.trim() || undefined,
          })).filter(u => u.full_name);

          if (parsedUsers.length === 0) {
            toast.error("No valid users found in the CSV. Please check the format.");
            setIsBulkSubmitting(false);
            return;
          }

          toast.info(`Uploading ${parsedUsers.length} users...`);

          const res = await apiClient<{ created: number, duplicates: number }>("/admin/users/bulk", {
            method: "POST",
            body: { users: parsedUsers },
          });

          if (res.success && res.data) {
            const { created, duplicates } = res.data;
            toast.success(`Bulk import complete! Added ${created} users. Skipped ${duplicates} duplicates.`);
            setBulkFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            fetchUsers();
          } else {
            toast.error(res.error || "Failed to bulk import users.");
          }
        } catch (err) {
          toast.error("An unexpected error occurred during import.");
        } finally {
          setIsBulkSubmitting(false);
        }
      },
      error: (error) => {
        toast.error(`Error parsing CSV: ${error.message}`);
        setIsBulkSubmitting(false);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          User Directory Management
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Onboard new students, teachers, and staff members into your organization. Initial password will be set to: Welcome123!
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* MANUAL ENTRY */}
        <Card className="glass shadow-sm">
          <form onSubmit={handleManualSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                Manual Entry
              </CardTitle>
              <CardDescription>
                Add a single user to the directory manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input 
                  placeholder="e.g. John Doe" 
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address {formData.role !== 'STUDENT' && '*'}</Label>
                <Input 
                  type="email" 
                  placeholder="john@example.edu" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required={formData.role !== 'STUDENT'}
                />
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(v) => setFormData({ ...formData, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Student</SelectItem>
                    <SelectItem value="TEACHER">Teacher</SelectItem>
                    <SelectItem value="COUNSELOR">Counselor</SelectItem>
                    <SelectItem value="SCHOOL_HEAD">School Head</SelectItem>
                    <SelectItem value="SCHOOL_NURSE">School Nurse</SelectItem>
                    <SelectItem value="IT_ADMIN">IT Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>National ID / Student ID (Optional)</Label>
                <Input 
                  placeholder="e.g. 123456789" 
                  value={formData.national_id}
                  onChange={e => setFormData({ ...formData, national_id: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t p-6">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Adding User..." : "Add User"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* BULK UPLOAD */}
        <Card className="glass shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-blue-500" />
              Bulk CSV Upload
            </CardTitle>
            <CardDescription>
              Quickly onboard students and staff using a CSV file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div 
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${bulkFile ? 'border-primary bg-primary/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  setBulkFile(file);
                  if (file) toast.success(`Selected file: ${file.name}`);
                }}
              />
              <UploadCloud className={`h-10 w-10 mb-4 ${bulkFile ? 'text-primary' : 'text-muted-foreground'}`} />
              {bulkFile ? (
                <>
                  <p className="text-sm font-medium text-primary">{bulkFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(bulkFile.size / 1024).toFixed(2)} KB</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Click to browse from your computer</p>
                  <p className="text-xs text-muted-foreground mt-1">Must be a .csv file</p>
                </>
              )}
            </div>
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
              <span className="text-sm">Need the correct format?</span>
              <Button variant="link" className="h-auto p-0" onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
          </CardContent>
          <CardFooter className="border-t p-6">
            <Button 
              className="w-full" 
              variant="secondary" 
              disabled={!bulkFile || isBulkSubmitting}
              onClick={handleBulkUpload}
            >
              {isBulkSubmitting ? "Uploading..." : "Sync to Directory"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* ALL USERS LIST */}
      <Card className="glass shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              All Directory Users
            </CardTitle>
            <CardDescription>View all students and staff members in the system.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(true)} disabled={isLoadingUsers}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, email, or ID..." 
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Filter by Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Roles</SelectItem>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="TEACHER">Teacher</SelectItem>
                  <SelectItem value="COUNSELOR">Counselor</SelectItem>
                  <SelectItem value="SCHOOL_HEAD">School Head</SelectItem>
                  <SelectItem value="IT_ADMIN">IT Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoadingUsers ? (
            <div className="text-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary/50" />
              <p className="text-sm text-muted-foreground mt-2">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground border border-dashed rounded-lg">
              No users found. Try adding some above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th 
                      className="px-4 py-3 rounded-tl-md cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleSort('full_name')}
                    >
                      <div className="flex items-center gap-2">
                        Full Name
                        {sortField === 'full_name' ? (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">Student ID / Account ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th 
                      className="px-4 py-3 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleSort('role')}
                    >
                      <div className="flex items-center gap-2">
                        Role
                        {sortField === 'role' ? (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </div>
                    </th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 rounded-tr-md text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredAndSortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{user.full_name}</div>
                      </td>
                      <td className="px-4 py-4">
                        <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          {user.type === 'STUDENT' ? (user.national_id || 'no-id') : user.id.slice(0, 8)}
                        </code>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${user.type === 'STUDENT' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'}`}>
                          {user.type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-tight">
                          {user.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {user.email || <span className="text-zinc-300 dark:text-zinc-700">no-email</span>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-zinc-300'}`}></span>
                          <span className={`text-[11px] ${user.is_active ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-muted-foreground tabular-nums text-[11px]">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
