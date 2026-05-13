"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UploadCloud } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          User Directory Management
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Onboard new students, teachers, and staff members into your organization.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
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
              <Label>Full Name</Label>
              <Input placeholder="e.g. John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" placeholder="john@example.edu" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select defaultValue="STUDENT">
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="TEACHER">Teacher</SelectItem>
                  <SelectItem value="COUNSELOR">Counselor</SelectItem>
                  <SelectItem value="SCHOOL_HEAD">School Head</SelectItem>
                  <SelectItem value="SCHOOL_NURSE">School Nurse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>National ID / Student ID (Optional)</Label>
              <Input placeholder="e.g. 123456789" />
            </div>
          </CardContent>
          <CardFooter className="border-t p-6">
            <Button className="w-full">Add User</Button>
          </CardFooter>
        </Card>

        <Card className="glass">
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
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">Drag & drop your CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse from your computer</p>
              <Button variant="outline" className="mt-4">Select File</Button>
            </div>
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
              <span className="text-sm">Need the correct format?</span>
              <Button variant="link" className="h-auto p-0">Download Template</Button>
            </div>
          </CardContent>
          <CardFooter className="border-t p-6">
            <Button className="w-full" variant="secondary" disabled>Sync to Directory</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
