import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUp, File, ShieldAlert, Download } from 'lucide-react';

interface MediaAssetRow {
  asset_id: string;
  file_name: string;
  mime_type: string;
  redaction_status: string;
  created_at: string;
}

export function MediaTab({ caseId }: { caseId: string }) {
  const [assets, setAssets] = useState<MediaAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    setIsLoading(true);
    const res = await apiClient<MediaAssetRow[]>(`/cases/${caseId}/media`);
    if (res.success && res.data) {
      setAssets(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, [caseId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Get Presigned URL
      const presignedRes = await apiClient<{ uploadUrl: string; asset: MediaAssetRow }>('/media/upload', {
        method: 'POST',
        body: {
          file_name: file.name,
          mime_type: file.type,
          file_hash: 'sample-hash-skipped-for-demo', 
        }
      });

      if (presignedRes.success && presignedRes.data) {
        const { uploadUrl, asset } = presignedRes.data;

        // 2. Upload directly to MinIO (S3) bypassing NextJS/Express bottleneck
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        // 3. Link Asset to Case
        await apiClient(`/media/${asset.asset_id}/link`, {
          method: 'POST',
          body: { case_id: caseId }
        });

        // 4. Refresh List
        fetchAssets();
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (assetId: string) => {
    const res = await apiClient<{ url: string }>(`/media/${assetId}`);
    if (res.success && res.data) {
      window.open(res.data.url, '_blank');
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading media assets...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <Card className="border-dashed glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center p-8">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <FileUp className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading & Linking...' : 'Upload Evidence File'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Securely uploads directly to standard compliant S3 blob storage (MinIO).
          </p>
        </CardContent>
      </Card>

      {/* Asset List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assets.map((asset) => (
          <Card key={asset.asset_id} className="glass border-border/50">
            <CardContent className="p-4 flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-3 overflow-hidden">
                <File className="h-8 w-8 text-primary opacity-80 flex-shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-sm font-semibold truncate" title={asset.file_name}>{asset.file_name}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {asset.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}
                    </span>
                    {asset.redaction_status === 'PENDING' && (
                      <span className="text-[10px] flex items-center bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">
                        <ShieldAlert className="w-3 h-3 mr-1" /> Redaction Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => handleDownload(asset.asset_id)}>
                <Download className="w-4 h-4 text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
