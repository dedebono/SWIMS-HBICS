"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

/**
 * Profile-photo avatar with an initials fallback.
 *
 * The photo is always a WebP produced by the backend (`GET /api/avatars/:id`),
 * delivered at one of two sizes — `thumb` (128 px) for tables and lists,
 * `full` (512 px) for dialogs. Pass the signed URL the API already hands out
 * (`thumb_url` / `avatar_url`); do not build it by hand.
 *
 * Falls back to initials when there is no photo, when the signed URL has
 * expired, or when the file fails to decode — a roster never shows a broken
 * image icon.
 */

export type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  xs: "size-6 text-[0.5625rem]",
  sm: "size-8 text-[0.6875rem]",
  md: "size-10 text-xs",
  lg: "size-14 text-sm",
  xl: "size-24 text-lg",
};

/** Deterministic pastel background so a roster of initials stays readable. */
const TONES = [
  "bg-[#e8f0fe] text-[#1d4ed8]",
  "bg-[#fdeaf1] text-[#be185d]",
  "bg-[#e6f7f1] text-[#047857]",
  "bg-[#fdf0e2] text-[#b45309]",
  "bg-[#eceafd] text-[#5b21b6]",
  "bg-[#e6f6f8] text-[#0e7490]",
];

/** First letters of the first two words — "Budi Santoso" → "BS". */
export function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase();
}

function toneFor(name?: string | null): string {
  const source = (name ?? "").trim();
  if (!source) return TONES[0]!;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 100_000;
  }
  return TONES[hash % TONES.length]!;
}

export interface UserAvatarProps {
  name?: string | null;
  /** Signed avatar URL from the API; null/omitted renders initials. */
  src?: string | null;
  size?: UserAvatarSize;
  className?: string;
  /** Adds a subtle ring — useful on coloured backgrounds. */
  ring?: boolean;
  /** Force the initials style even when a photo exists (e.g. tiny list rows). */
  preferInitials?: boolean;
  /**
   * Account id. When present, an image that fails to load triggers ONE silent
   * re-mint of the signed URL via `GET /api/avatars/:id/url`. That endpoint
   * exists because the token embedded in `src` expires after an hour, while the
   * URL itself is cached in localStorage for the whole session — without this
   * the user's own photo quietly reverts to initials an hour after login.
   */
  accountId?: string | null;
  /** Which rendition to re-request when healing. Defaults to `thumb`. */
  variant?: "thumb" | "full";
}

export function UserAvatar({
  name,
  src,
  size = "md",
  className,
  ring = false,
  preferInitials = false,
  accountId,
  variant = "thumb",
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  /** A freshly-minted URL that supersedes the (possibly stale) `src`. */
  const [healedUrl, setHealedUrl] = useState<string | null>(null);

  // A new URL means a new photo (or a new account) — retry loading it.
  useEffect(() => {
    setFailed(false);
    setHealedUrl(null);
  }, [src]);

  const activeSrc = healedUrl ?? src ?? null;
  const showPhoto = Boolean(activeSrc) && !failed && !preferInitials;
  const base = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
    SIZE_CLASSES[size],
    showPhoto ? "bg-muted" : toneFor(name),
    ring && "ring-2 ring-card",
    className,
  );

  /**
   * The stored URL failed. If we have not already retried, ask the API for a
   * fresh one — an expired token is the common cause and it is fully recoverable.
   * Guarded by `healedUrl` so a genuinely missing photo cannot loop forever.
   */
  const handleError = () => {
    if (healedUrl || !accountId) {
      setFailed(true);
      return;
    }
    apiClient<{ avatar_url: string }>(`/avatars/${accountId}/url?variant=${variant}`)
      .then((res) => {
        if (res.success && res.data?.avatar_url) setHealedUrl(res.data.avatar_url);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  };

  if (showPhoto) {
    return (
      <span className={base} title={name ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, tenant-scoped
            WebP served straight from /api/avatars; next/image would need the bytes
            to be publicly fetchable from the optimiser. */}
        <img
          src={activeSrc as string}
          alt={name ?? "Foto profil"}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={handleError}
        />
      </span>
    );
  }

  return (
    <span className={base} title={name ?? undefined} aria-label={name ?? "Pengguna"}>
      {initialsOf(name)}
    </span>
  );
}