"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { IconBox } from "@/components/ui/icon-box";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Bot,
  Save,
  Cloud,
  MessageSquare,
  Mail,
  PlugZap,
  ShieldCheck,
  HardDrive,
  Loader2,
} from "lucide-react";

/** Toggle row with a label, helper text and a right-aligned switch. */
function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  tone = "blue",
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  tone?: "blue" | "green" | "purple";
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <IconBox tone={tone} size="sm">
          <ShieldCheck />
        </IconBox>
        <div className="min-w-0 space-y-0.5">
          <Label className="text-sm">{title}</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 self-start sm:self-auto">
        <StatusBadge
          tone={checked ? "success" : "neutral"}
          label={checked ? "Aktif" : "Nonaktif"}
        />
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

/** Section heading used inside the tab panels. */
function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <IconBox tone="blue">{icon}</IconBox>
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    provider: "local",
    apiUrl: "http://localhost:11434/v1/chat/completions",
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

  const [wahaSettings, setWahaSettings] = useState({
    url: "http://100.127.221.23:3002",
    session: "default",
    apiKey: "",
  });

  const [emailSettings, setEmailSettings] = useState({
    host: "smtp.sumopod.com",
    port: 465,
    secure: true,
    username: "",
    password: "",
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
        if (res.data.waha) setWahaSettings(prev => ({ ...prev, ...res.data.waha }));
        if (res.data.email) setEmailSettings(prev => ({ ...prev, ...res.data.email }));
      }
    } catch (error) {
      toast.error("Gagal memuat pengaturan. Pastikan Anda adalah Admin IT.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (category: "ai" | "storage" | "waha" | "email") => {
    try {
      setSaving(true);
      const payload: any = {};
      if (category === "ai") payload.ai = aiSettings;
      else if (category === "storage") payload.storage = { ...storageSettings, storageProvider: storageSettings.provider };
      else if (category === "waha") payload.waha = wahaSettings;
      else if (category === "email") payload.email = emailSettings;

      const res = await apiClient<any>("/admin/settings", {
        method: "PATCH",
        body: payload,
      });

      if (res.success) {
        toast.success("Pengaturan berhasil disimpan.");
      } else {
        toast.error(res.error || "Gagal menyimpan pengaturan.");
      }
    } catch (error) {
      toast.error("Gagal menyimpan pengaturan. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestAiConnection = async () => {
    try {
      setTestingAi(true);
      const res = await apiClient<any>("/admin/ai/check-connection", {
        method: "POST",
        body: {
          ai: {
            aiApiUrl: aiSettings.apiUrl,
            aiApiKey: aiSettings.apiKey,
          },
        },
      });

      if (res.success) {
        toast.success("Koneksi ke layanan AI berhasil. Model merespons dengan baik.");
      } else {
        toast.error("Koneksi ke layanan AI gagal.");
      }
    } catch (error) {
      toast.error("Gagal menghubungi layanan AI. Periksa alamat URL dan kunci API Anda.");
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Sistem"
        description="Kelola konfigurasi, integrasi, dan layanan eksternal yang dipakai SWIMS-HBICS."
        actions={
          loading ? (
            <StatusBadge tone="info" label="Memuat pengaturan…" />
          ) : (
            <StatusBadge tone="success" label="Pengaturan tersinkron" />
          )
        }
      />

      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai">
            <Bot />
            Wawasan AI
          </TabsTrigger>
          <TabsTrigger value="storage">
            <Cloud />
            Penyimpanan
          </TabsTrigger>
          <TabsTrigger value="waha">
            <MessageSquare />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail />
            Email SMTP
          </TabsTrigger>
        </TabsList>

        {/* ── AI ── */}
        <TabsContent value="ai">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <IconBox tone="purple">
                  <Bot />
                </IconBox>
                <div className="space-y-1">
                  <CardTitle>Konfigurasi AI</CardTitle>
                  <CardDescription>
                    Atur layanan AI untuk ringkasan kasus dan deteksi pola. Anda dapat
                    terhubung ke penyedia cloud maupun model lokal melalui Ollama/LMStudio.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <ToggleRow
                title="Aktifkan Fitur AI"
                description="Izinkan konselor membuat ringkasan kasus dengan bantuan AI."
                checked={!!aiSettings.enabled}
                onCheckedChange={(v) => setAiSettings({ ...aiSettings, enabled: v })}
                tone="purple"
              />

              {aiSettings.enabled ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ai-provider">Jenis Penyedia</Label>
                      <Select
                        value={aiSettings.provider}
                        onValueChange={(v) => setAiSettings({ ...aiSettings, provider: v ?? "local" })}
                      >
                        <SelectTrigger id="ai-provider" className="w-full">
                          <SelectValue placeholder="Pilih penyedia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Model Lokal (Ollama/LMStudio)</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-model">Nama Model</Label>
                      <Input
                        id="ai-model"
                        placeholder="Contoh: llama3 atau gpt-4"
                        value={aiSettings.model || ""}
                        onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-url">Alamat Endpoint API</Label>
                    <Input
                      id="ai-url"
                      placeholder="http://localhost:11434/v1/chat/completions"
                      value={aiSettings.apiUrl || ""}
                      onChange={(e) => setAiSettings({ ...aiSettings, apiUrl: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Untuk model lokal, gunakan alamat lengkap endpoint yang diawali http://
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-key">Kunci API (opsional untuk model lokal)</Label>
                    <Input
                      id="ai-key"
                      type="password"
                      placeholder="sk-..."
                      value={aiSettings.apiKey || ""}
                      onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aktifkan fitur AI terlebih dahulu untuk mengatur model dan endpoint.
                </p>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-end gap-2.5">
              <Button
                variant="outline"
                onClick={handleTestAiConnection}
                disabled={!aiSettings.enabled || testingAi}
              >
                {testingAi ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Menguji…
                  </>
                ) : (
                  <>
                    <PlugZap className="size-4" />
                    Uji Koneksi
                  </>
                )}
              </Button>
              <Button onClick={() => handleSaveSettings("ai")} disabled={saving}>
                <Save className="size-4" />
                Simpan Pengaturan AI
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Storage ── */}
        <TabsContent value="storage">
          <SettingsSection
            icon={<HardDrive />}
            title="Konfigurasi Penyimpanan"
            description="Tentukan lokasi media siswa, laporan PDF, dan data hasil ekspor. Mendukung endpoint S3, Firebase, serta Google Drive."
          >
            <div className="space-y-2">
              <Label htmlFor="storage-provider">Penyedia Penyimpanan</Label>
              <Select
                value={storageSettings.provider}
                onValueChange={(v) => setStorageSettings({ ...storageSettings, provider: v ?? "s3" })}
              >
                <SelectTrigger id="storage-provider" className="w-full sm:w-72">
                  <SelectValue placeholder="Pilih penyedia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="s3">Amazon S3</SelectItem>
                  <SelectItem value="r2">Cloudflare R2</SelectItem>
                  <SelectItem value="firebase">Firebase Storage</SelectItem>
                  <SelectItem value="gdrive">Google Drive API</SelectItem>
                  <SelectItem value="local">Penyimpanan Server Lokal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {storageSettings.provider === "local" ? (
              <div className="flex items-start gap-3 rounded-xl border border-info-soft bg-info-soft/40 p-4">
                <IconBox tone="blue" size="sm">
                  <HardDrive />
                </IconBox>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-heading">
                    Penyimpanan server lokal sedang digunakan
                  </p>
                  <p className="text-xs leading-relaxed text-secondary-text">
                    Berkas akan disimpan langsung ke sistem berkas server, misalnya pada folder{" "}
                    <code className="rounded bg-card px-1.5 py-0.5 text-[0.7rem]">backend/uploads/</code>.
                    Penyedia ini tidak memerlukan kunci tambahan.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="storage-bucket">Nama Bucket / ID Proyek Firebase</Label>
                    <Input
                      id="storage-bucket"
                      value={storageSettings.bucket || ""}
                      onChange={(e) => setStorageSettings({ ...storageSettings, bucket: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storage-region">Region</Label>
                    <Input
                      id="storage-region"
                      placeholder="us-east-1"
                      value={storageSettings.region || ""}
                      onChange={(e) => setStorageSettings({ ...storageSettings, region: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage-access">Access Key / Email Klien</Label>
                  <Input
                    id="storage-access"
                    value={storageSettings.accessKey || ""}
                    onChange={(e) => setStorageSettings({ ...storageSettings, accessKey: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage-secret">Secret Key / Private Key</Label>
                  <Input
                    id="storage-secret"
                    type="password"
                    value={storageSettings.secretKey || ""}
                    onChange={(e) => setStorageSettings({ ...storageSettings, secretKey: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleSaveSettings("storage")} disabled={saving}>
                <Save className="size-4" />
                Simpan Pengaturan Penyimpanan
              </Button>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── WAHA ── */}
        <TabsContent value="waha">
          <SettingsSection
            icon={<MessageSquare />}
            title="Konfigurasi WhatsApp (WAHA)"
            description="Hubungkan layanan WhatsApp Business untuk notifikasi dan pesan otomatis."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="waha-url">Alamat WAHA</Label>
                <Input
                  id="waha-url"
                  placeholder="http://100.127.221.23:3002"
                  value={wahaSettings.url || ""}
                  onChange={(e) => setWahaSettings({ ...wahaSettings, url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waha-session">Sesi</Label>
                <Input
                  id="waha-session"
                  placeholder="default"
                  value={wahaSettings.session || ""}
                  onChange={(e) => setWahaSettings({ ...wahaSettings, session: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="waha-key">Kunci API</Label>
              <Input
                id="waha-key"
                type="password"
                placeholder="Masukkan kunci API WAHA"
                value={wahaSettings.apiKey || ""}
                onChange={(e) => setWahaSettings({ ...wahaSettings, apiKey: e.target.value })}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => handleSaveSettings("waha")} disabled={saving}>
                <Save className="size-4" />
                Simpan Pengaturan WhatsApp
              </Button>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── Email ── */}
        <TabsContent value="email">
          <SettingsSection
            icon={<Mail />}
            title="Konfigurasi Email SMTP"
            description="Atur server SMTP untuk mengirim email, seperti notifikasi orang tua dan konfirmasi janji temu."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">Host SMTP</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.sumopod.com"
                  value={emailSettings.host || ""}
                  onChange={(e) => setEmailSettings({ ...emailSettings, host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  placeholder="465"
                  value={emailSettings.port || ""}
                  onChange={(e) => setEmailSettings({ ...emailSettings, port: Number(e.target.value) })}
                />
              </div>
            </div>

            <ToggleRow
              title="SSL/TLS"
              description="Gunakan koneksi aman. Disarankan untuk port 465."
              checked={!!emailSettings.secure}
              onCheckedChange={(v) => setEmailSettings({ ...emailSettings, secure: v })}
              tone="green"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-user">Nama Pengguna</Label>
                <Input
                  id="smtp-user"
                  placeholder="nama-pengguna"
                  value={emailSettings.username || ""}
                  onChange={(e) => setEmailSettings({ ...emailSettings, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Kata Sandi</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  placeholder="kata-sandi"
                  value={emailSettings.password || ""}
                  onChange={(e) => setEmailSettings({ ...emailSettings, password: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => handleSaveSettings("email")} disabled={saving}>
                <Save className="size-4" />
                Simpan Pengaturan Email
              </Button>
            </div>
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}