"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

/**
 * Profile-photo picker used by the "Ubah Pengguna" dialog.
 *
 * Flow: pick a file → compress it IN THE BROWSER → POST base64 to
 * `/api/avatars/:id` → the backend re-encodes to WebP (512 px + 128 px thumb)
 * and returns the signed URLs.
 *
 * Compressing client-side first is what makes the 1 MB limit practically
 * unreachable: a 4 MB phone photo lands around 120–250 KB, so the round trip is
 * fast and the server-side cap stays a hard backstop rather than the thing the
 * user bumps into.
 *
 * The upload fires immediately on selection rather than on "Simpan" — the photo
 * and the form fields are independent pieces of data, and this way a user who
 * picks a photo and then closes the dialog has not silently lost it.
 */

/** Server-side hard cap; kept in sync with MAX_UPLOAD_BYTES in avatar.service.ts. */
export const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB
/** Target after browser compression — comfortably under the cap. */
const COMPRESS_TARGET_MB = 0.85;
const MAX_DIMENSION = 1024;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export interface AvatarUploadResponse {
  avatar_url: string;
  thumb_url: string;
  size_bytes: number;
  original_bytes: number;
}

export interface AvatarUploadFieldProps {
  accountId: string;
  accountName: string;
  /** Current signed URL (thumb) or null when no photo is set. */
  currentUrl?: string | null;
  /** Fired after a successful upload/delete so the caller can refresh its list. */
  onChanged?: (result: { avatar_url: string | null; thumb_url: string | null }) => void;
  className?: string;
}

export function AvatarUploadField({
  accountId,
  accountName,
  currentUrl,
  onChanged,
  className,
}: AvatarUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Follow the parent when the dialog switches to another account.
  const [lastAccount, setLastAccount] = useState(accountId);
  if (lastAccount !== accountId) {
    setLastAccount(accountId);
    setPreview(currentUrl ?? null);
  }

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Format foto harus JPG, PNG, atau WebP.");
      return;
    }

    setIsBusy(true);
    try {
      // Shrink before upload — this is what keeps us under the 1 MB cap.
      const compressed = await imageCompression(file, {
        maxSizeMB: COMPRESS_TARGET_MB,
        maxWidthOrHeight: MAX_DIMENSION,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/png" : "image/jpeg",
        initialQuality: 0.85,
      });

      if (compressed.size > MAX_AVATAR_BYTES) {
        toast.error(
          `Ukuran foto ${(compressed.size / 1024 / 1024).toFixed(2)} MB masih melebihi batas 1 MB. Pilih foto dengan resolusi lebih rendah.`,
        );
        return;
      }

      const base64 = await compressedToBase64(compressed);

      const res = await apiClient<AvatarUploadResponse>(`/avatars/${accountId}`, {
        method: "POST",
        body: { file_data: base64, mime_type: compressed.type, file_name: file.name },
      });

      if (!res.success || !res.data) {
        toast.error(res.error || "Gagal mengunggah foto.");
        return;
      }

      setPreview(res.data.thumb_url);
      onChanged?.({ avatar_url: res.data.avatar_url, thumb_url: res.data.thumb_url });

      const saved = Math.round(res.data.size_bytes / 1024);
      const original = Math.round(res.data.original_bytes / 1024);
      toast.success(
        saved < original
          ? `Foto tersimpan sebagai WebP ${saved} KB (dari ${original} KB).`
          : `Foto tersimpan (${saved} KB).`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Gagal memproses foto. Coba foto lain.");
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setIsBusy(true);
    try {
      const res = await apiClient(`/avatars/${accountId}`, { method: "DELETE" });
      if (!res.success) {
        toast.error(res.error || "Gagal menghapus foto.");
        return;
      }
      setPreview(null);
      onChanged?.({ avatar_url: null, thumb_url: null });
      toast.success("Foto dihapus.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus foto.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <UserAvatar name={accountName} src={preview} size="xl" ring />
          {isBusy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
              <Loader2 className="size-5 animate-spin" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-heading">Foto Profil</p>
          <p className="text-xs text-muted-foreground">
            JPG/PNG/WebP, maksimal 1&nbsp;MB. Foto otomatis diperkecil dan diubah ke WebP
            supaya ringan saat dimuat.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <ButtonLike
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              icon={<UploadCloud className="size-4" />}
            >
              {preview ? "Ganti Foto" : "Unggah Foto"}
            </ButtonLike>

            {preview && (
              <ButtonLike
                type="button"
                onClick={handleRemove}
                disabled={isBusy}
                variant="danger"
                icon={<Trash2 className="size-4" />}
              >
                Hapus
              </ButtonLike>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      {/* Drop zone doubles as the click target for touch/hover users */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary-softer"
            : "border-border bg-[#fbfcfe] hover:border-primary/40 hover:bg-primary-softer",
        )}
      >
        <Camera className="size-4 text-muted-foreground" />
        <span className="text-xs text-secondary-text">
          Seret foto ke sini, atau klik untuk memilih berkas
        </span>
      </button>
    </div>
  );
}

/** Minimal button shell so this component stays decoupled from the UI Button API. */
function ButtonLike({
  children,
  icon,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "default"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-card text-danger hover:bg-danger-soft",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** FileReader → data URL (the `data:` prefix is stripped; the backend accepts both). */
function compressedToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca berkas"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}