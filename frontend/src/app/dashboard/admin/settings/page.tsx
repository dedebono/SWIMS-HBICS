"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Save, Cloud, CheckCircle, AlertTriangle } from "lucide-react";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    provider: "local",
    apiUrl: "http://localhost:11434/api/generate",
    apiKey: "",
    model: "llama3",
  });

  const [storageSettings, setStorageSettings] = useState({
    provider: "s3",
    bucket: "",
    region: "",
    accessKey: "",
    secretKey: "",
    publicUrl: "",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiClient<any>("/admin/settings");
      
      if (res.success && res.data) {
        if (res.data.ai) setAiSettings(prev => ({ ...prev, ...res.data.ai }));
        if (res.data.storage) setStorageSettings(prev => ({ ...prev, ...res.data.storage }));
      }
    } catch (error) {
      toast.error("Failed to load settings. Are you an IT Admin?");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (category: "ai" | "storage") => {
    try {
      setSaving(true);
      const payload = category === "ai" 
        ? { ai: aiSettings } 
        : { storage: storageSettings };

      const res = await apiClient<any>("/admin/settings", {
        method: "PATCH",
        body: payload,
      });

      if (res.success) {
        toast.success(`${category.toUpperCase()} settings saved successfully!`);
      } else {
        toast.error(res.error || "Failed to save settings.");
      }
    } catch (error) {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestAiConnection = async () => {
    try {
      setTestingAi(true);
      const res = await apiClient<any>("/admin/ai/check-connection", {
        method: "POST",
        body: aiSettings,
      });
      
      if (res.success) {
        toast.success("Connection to AI successful! Model is responding.");
      } else {
        toast.error("AI Connection failed.");
      }
    } catch (error) {
      toast.error("Error communicating with AI endpoint. Check your URL and Key.");
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          IT Admin Settings
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Manage system configurations, integrations, and storage backends.
        </p>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
          <TabsTrigger value="storage">Storage Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-500" />
                AI Configuration
              </CardTitle>
              <CardDescription>
                Configure the AI backend used for case summarization and pattern detection. You can connect to cloud providers or a local LLM via Ollama/LMStudio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable AI Features</Label>
                  <p className="text-sm text-zinc-500">Allow Counselors to generate AI case summaries.</p>
                </div>
                <Switch 
                  checked={!!aiSettings.enabled}
                  onCheckedChange={(v) => setAiSettings({...aiSettings, enabled: v})}
                />
              </div>

              {aiSettings.enabled && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Provider Type</Label>
                      <Select 
                        value={aiSettings.provider} 
                        onValueChange={(v) => setAiSettings({...aiSettings, provider: v ?? "local"})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local Model (Ollama/LMStudio)</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Model Name</Label>
                      <Input 
                        placeholder="e.g. llama3 or gpt-4" 
                        value={aiSettings.model || ""}
                        onChange={(e) => setAiSettings({...aiSettings, model: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>API Base URL</Label>
                    <Input 
                      placeholder="http://localhost:11434/api/generate" 
                      value={aiSettings.apiUrl || ""}
                      onChange={(e) => setAiSettings({...aiSettings, apiUrl: e.target.value})}
                    />
                    <p className="text-xs text-zinc-500">For local models, use the absolute URL to the endpoint.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>API Key (Optional for Local)</Label>
                    <Input 
                      type="password" 
                      placeholder="sk-..." 
                      value={aiSettings.apiKey || ""}
                      onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                    />
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t p-6">
              <Button 
                variant="outline" 
                onClick={handleTestAiConnection}
                disabled={!aiSettings.enabled || testingAi}
              >
                {testingAi ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={() => handleSaveSettings("ai")} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save AI Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-sky-500" />
                Storage Configuration
              </CardTitle>
              <CardDescription>
                Configure where student media, PDF reports, and exported data are stored. We support S3-compatible endpoints, Firebase, and Google Drive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Storage Provider</Label>
                <Select 
                  value={storageSettings.provider} 
                  onValueChange={(v) => setStorageSettings({...storageSettings, provider: v ?? "s3"})}
                >
                  <SelectTrigger className="w-full sm:w-[300px]">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="s3">Amazon S3</SelectItem>
                    <SelectItem value="r2">Cloudflare R2</SelectItem>
                    <SelectItem value="firebase">Firebase Storage</SelectItem>
                    <SelectItem value="gdrive">Google Drive API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bucket Name / Firebase Project ID</Label>
                  <Input 
                    value={storageSettings.bucket || ""}
                    onChange={(e) => setStorageSettings({...storageSettings, bucket: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input 
                    placeholder="us-east-1"
                    value={storageSettings.region || ""}
                    onChange={(e) => setStorageSettings({...storageSettings, region: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Access Key / Client Email</Label>
                <Input 
                  value={storageSettings.accessKey || ""}
                  onChange={(e) => setStorageSettings({...storageSettings, accessKey: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Secret Key / Private Key</Label>
                <Input 
                  type="password"
                  value={storageSettings.secretKey || ""}
                  onChange={(e) => setStorageSettings({...storageSettings, secretKey: e.target.value})}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t p-6">
              <Button onClick={() => handleSaveSettings("storage")} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Storage Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
