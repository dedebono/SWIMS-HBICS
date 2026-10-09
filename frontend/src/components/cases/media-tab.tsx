'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBox } from '@/components/ui/icon-box';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/page-header';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileAudio,
  FileText,
  FileUp,
  FileVideo,
  Image as ImageIcon,
  ShieldAlert,
  X,
  ZoomIn,
} from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface MediaAssetRow {
  asset_id: string;
  file_name: string;
  mime_type: string;
  redaction_status: string;
  created_at: string;
}

interface AssetWithUrl extends MediaAssetRow {
  url?: string;
}

function assetKind(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function KindIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const kind = assetKind(mimeType);
  if (kind === 'audio') return <FileAudio className={className} />;
  if (kind === 'video') return <FileVideo className={className} />;
  if (kind === 'image') return <ImageIcon className={className} />;
  return <FileText className={className} />;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MediaTab({ caseId }: { caseId: string }) {
  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    const res = await apiClient<MediaAssetRow[]>(`/cases/${caseId}/media`);
    if (res.success && res.data) {
      // Backend menyertakan URL unduhan bertanda tangan pada daftar aset.
      const withUrls: AssetWithUrl[] = (res.data as (MediaAssetRow & { url?: string })[]).map(
        (asset) => ({
          ...asset,
          url: asset.url ?? `/api/media/${asset.asset_id}/download`,
        }),
      );
      setAssets(withUrls);
    }
    setIsLoading(false);
  }, [caseId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Navigasi papan cahaya dengan keyboard
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight')
        setLightboxIdx((i) => (i !== null ? Math.min(i + 1, assets.length - 1) : null));
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, assets.length]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let fileToUpload = file;

      // Kompres gambar di sisi klien sebelum diunggah
      if (file.type.startsWith('image/')) {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      }

      // Ubah ke base64 agar unggah melewati backend HTTPS
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]!;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToUpload);
      });

      const uploadRes = await apiClient<{ asset_id: string; file_name: string }>(
        '/media/direct-upload',
        {
          method: 'POST',
          body: {
            file_name: fileToUpload.name,
            mime_type: fileToUpload.type,
            file_data: fileBase64,
          },
        },
      );

      if (uploadRes.success && uploadRes.data) {
        const { asset_id } = uploadRes.data;
        await apiClient(`/media/${asset_id}/link`, {
          method: 'POST',
          body: { case_id: caseId },
        });
        fetchAssets();
      }
    } catch (err) {
      console.error('Pengunggahan gagal', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const lightboxAsset = lightboxIdx !== null ? assets[lightboxIdx] : null;
  const pendingRedaction = assets.filter((a) => a.redaction_status === 'PENDING').length;
  const totalSize = assets.length;
  const activeIndex = lightboxIdx ?? 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Lampiran"
          value={totalSize}
          hint="Berkas bukti yang terlampir pada kasus ini."
          icon={<FileUp className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Menunggu Redaksi"
          value={pendingRedaction}
          hint="Lampiran yang masih menunggu penyensoran identitas."
          icon={<ShieldAlert className="size-5" />}
          iconTone="yellow"
        />
        <StatCard
          label="Kelola Lampiran"
          value={totalSize > 0 ? 'Tersedia' : 'Kosong'}
          hint="Unggah foto, video, audio, atau dokumen sebagai bukti."
          icon={<FileText className="size-5" />}
          iconTone="slate"
        />
      </div>

      {/* Zona unggah */}
      <Card className="border-dashed">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <IconBox tone="blue" size="sm">
              <FileUp />
            </IconBox>
            <div>
              <CardTitle>Unggah Berkas Bukti</CardTitle>
              <CardDescription>
                Mendukung gambar, video, audio, PDF, dan dokumen. Gambar otomatis dikompresi.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            onChange={handleFileUpload}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            aria-label="Pilih berkas bukti"
          />
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-8 text-center">
            <IconBox tone="blue" size="lg">
              <FileUp />
            </IconBox>
            <div className="space-y-1">
              <p className="text-sm font-medium text-heading">Belum ada berkas dipilih</p>
              <p className="text-xs text-muted-foreground">
                Ukuran berkas dikompresi otomatis agar hemat ruang penyimpanan.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <FileUp className="size-4" />
              {isUploading ? 'Mengunggah...' : 'Pilih Berkas untuk Diunggah'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Galeri */}
      {assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon />}
            title="Belum ada lampiran"
            description="Anda belum memiliki data. Mulai dengan mengunggah foto, video, atau dokumen sebagai bukti kasus."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset, idx) => {
            const kind = assetKind(asset.mime_type);

            return (
              <button
                key={asset.asset_id}
                type="button"
                onClick={() => setLightboxIdx(idx)}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted/30 text-left transition-all hover:border-primary/30 hover:shadow-card"
                title={asset.file_name}
                aria-label={`Buka lampiran ${asset.file_name}`}
              >
                {kind === 'image' && asset.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.file_name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : kind === 'video' && asset.url ? (
                  <video src={asset.url} className="size-full object-cover" muted preload="metadata" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-2 p-3">
                    <IconBox tone={kind === 'audio' ? 'purple' : kind === 'video' ? 'blue' : 'slate'}>
                      <KindIcon mimeType={asset.mime_type} />
                    </IconBox>
                    <span className="w-full truncate text-center text-xs text-muted-foreground">
                      {asset.file_name}
                    </span>
                  </span>
                )}

                <span className="absolute inset-0 flex items-center justify-center bg-heading/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="size-6 text-white" />
                </span>

                <span className="absolute left-2 top-2">
                  <StatusBadge
                    tone={asset.redaction_status === 'PENDING' ? 'warning' : 'success'}
                    label={asset.redaction_status === 'PENDING' ? 'Menunggu Redaksi' : 'Tersedia'}
                  />
                </span>

                <span className="absolute bottom-2 right-2 rounded-full bg-heading/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {asset.mime_type.split('/')[1]?.toUpperCase() ?? 'BERKAS'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Papan cahaya */}
      {lightboxAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-heading/70 p-4"
          onClick={() => setLightboxIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau ${lightboxAsset.file_name}`}
        >
          <button
            className="absolute right-4 top-4 text-white/80 transition-colors hover:text-white"
            onClick={() => setLightboxIdx(null)}
            aria-label="Tutup pratinjau"
          >
            <X className="size-6" />
          </button>

          {activeIndex > 0 ? (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 transition-colors hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => (i ?? 0) - 1);
              }}
              aria-label="Lampiran sebelumnya"
            >
              <ChevronLeft className="size-8" />
            </button>
          ) : null}

          {activeIndex < assets.length - 1 ? (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 transition-colors hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => (i ?? 0) + 1);
              }}
              aria-label="Lampiran berikutnya"
            >
              <ChevronRight className="size-8" />
            </button>
          ) : null}

          <div
            className="flex max-w-4xl max-h-[85vh] flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {assetKind(lightboxAsset.mime_type) === 'image' && lightboxAsset.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxAsset.url}
                alt={lightboxAsset.file_name}
                className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-card-hover"
              />
            ) : assetKind(lightboxAsset.mime_type) === 'video' && lightboxAsset.url ? (
              <video
                src={lightboxAsset.url}
                controls
                autoPlay
                className="max-h-[75vh] max-w-full rounded-2xl shadow-card-hover"
              />
            ) : assetKind(lightboxAsset.mime_type) === 'audio' && lightboxAsset.url ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-10">
                <IconBox tone="purple" size="lg">
                  <FileAudio />
                </IconBox>
                <audio src={lightboxAsset.url} controls className="w-72" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-12">
                <IconBox tone="slate" size="lg">
                  <KindIcon mimeType={lightboxAsset.mime_type} />
                </IconBox>
                <p className="text-sm text-muted-foreground">{lightboxAsset.file_name}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/80">
              <span className="max-w-xs truncate font-medium text-white">{lightboxAsset.file_name}</span>
              <span className="size-1 rounded-full bg-white/40" />
              <span>{formatDate(lightboxAsset.created_at)}</span>
              <span className="size-1 rounded-full bg-white/40" />
              <span>
                {activeIndex + 1} / {assets.length}
              </span>
              {lightboxAsset.url ? (
                <a
                  href={lightboxAsset.url}
                  download={lightboxAsset.file_name}
                  target="_blank"
                  rel="noreferrer"
                  className="action-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Unduh
                  <Download className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}