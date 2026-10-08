'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileUp,
  ShieldAlert,
  Download,
  FileText,
  FileAudio,
  FileVideo,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
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

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('audio/')) return <FileAudio className="w-8 h-8 text-purple-400" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="w-8 h-8 text-blue-400" />;
  return <FileText className="w-8 h-8 text-muted-foreground" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MediaTab({ caseId }: { caseId: string }) {
  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch assets and resolve download URLs for each
  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    const res = await apiClient<MediaAssetRow[]>(`/cases/${caseId}/media`);
    if (res.success && res.data) {
      // Assets now include pre-signed download URL from backend — no extra fetch needed
      // url field is added by backend's listAssetsForCase response
      const withUrls: AssetWithUrl[] = (res.data as (MediaAssetRow & { url?: string })[]).map((asset) => ({
        ...asset,
        url: asset.url ?? `/api/media/${asset.asset_id}/download`,
      }));
      setAssets(withUrls);
    }
    setIsLoading(false);
  }, [caseId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i !== null ? Math.min(i + 1, assets.length - 1) : null));
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

      // Compress images client-side before upload
      if (file.type.startsWith('image/')) {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      }

      // Convert file to base64 for upload through HTTPS backend (avoids Mixed Content)
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]!;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToUpload);
      });

      // Upload through backend proxy (avoids Minio HTTP presigned URL)
      const uploadRes = await apiClient<{ asset_id: string; file_name: string }>('/media/direct-upload', {
        method: 'POST',
        body: {
          file_name: fileToUpload.name,
          mime_type: fileToUpload.type,
          file_data: fileBase64,
        },
      });

      if (uploadRes.success && uploadRes.data) {
        const { asset_id } = uploadRes.data;
        await apiClient(`/media/${asset_id}/link`, {
          method: 'POST',
          body: { case_id: caseId },
        });
        fetchAssets();
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const lightboxAsset = lightboxIdx !== null ? assets[lightboxIdx] : null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <Card className="border-dashed glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center p-6">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          />
          <FileUp className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload Evidence File'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Images are automatically compressed to save space.</p>
        </CardContent>
      </Card>

      {/* Thumbnail Grid */}
      {assets.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No media attachments yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {assets.map((asset, idx) => {
            const isImage = asset.mime_type.startsWith('image/');
            const isVideo = asset.mime_type.startsWith('video/');

            return (
              <div
                key={asset.asset_id}
                className="group relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => setLightboxIdx(idx)}
                title={asset.file_name}
              >
                {/* Thumbnail Content */}
                {isImage && asset.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : isVideo && asset.url ? (
                  <video
                    src={asset.url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                    {getFileIcon(asset.mime_type)}
                    <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full text-center">
                      {asset.file_name}
                    </span>
                  </div>
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <ZoomIn className="w-6 h-6 text-white drop-shadow" />
                </div>

                {/* Redaction Badge */}
                {asset.redaction_status === 'PENDING' && (
                  <div className="absolute top-1 left-1">
                    <span className="text-[9px] flex items-center bg-yellow-500/90 text-yellow-950 px-1 py-0.5 rounded font-medium">
                      <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> Redaction
                    </span>
                  </div>
                )}

                {/* Type Badge */}
                <div className="absolute bottom-1 right-1">
                  <span className="text-[9px] bg-black/60 text-white px-1 py-0.5 rounded">
                    {asset.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Prev */}
          {lightboxIdx! > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i! - 1); }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Next */}
          {lightboxIdx! < assets.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i! + 1); }}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Media Preview */}
          <div
            className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxAsset.mime_type.startsWith('image/') && lightboxAsset.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxAsset.url}
                alt={lightboxAsset.file_name}
                className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            ) : lightboxAsset.mime_type.startsWith('video/') && lightboxAsset.url ? (
              <video
                src={lightboxAsset.url}
                controls
                autoPlay
                className="max-h-[75vh] max-w-full rounded-lg shadow-2xl"
              />
            ) : lightboxAsset.mime_type.startsWith('audio/') && lightboxAsset.url ? (
              <div className="bg-muted rounded-lg p-8 flex flex-col items-center gap-4">
                <FileAudio className="w-16 h-16 text-purple-400" />
                <audio src={lightboxAsset.url} controls className="w-72" />
              </div>
            ) : (
              <div className="bg-muted rounded-lg p-12 flex flex-col items-center gap-4">
                {getFileIcon(lightboxAsset.mime_type)}
                <p className="text-sm text-muted-foreground">{lightboxAsset.file_name}</p>
              </div>
            )}

            {/* Info Bar */}
            <div className="flex items-center gap-4 text-white/70 text-xs">
              <span className="font-medium text-white truncate max-w-xs">{lightboxAsset.file_name}</span>
              <span>•</span>
              <span>{formatDate(lightboxAsset.created_at)}</span>
              <span>•</span>
              <span>{lightboxIdx! + 1} / {assets.length}</span>
              {lightboxAsset.url && (
                <a
                  href={lightboxAsset.url}
                  download={lightboxAsset.file_name}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
