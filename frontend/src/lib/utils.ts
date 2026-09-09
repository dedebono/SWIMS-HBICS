import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatInTimeZone, toZonedTime } from "date-fns-tz"
import { format } from "date-fns"
import { id } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a datetime-local string (e.g. "2026-09-23T10:04") to a UTC ISO 8601 string.
 * The datetime-local input is interpreted as local time (WIB/WITA/WIT).
 * JavaScript Date parsing treats "YYYY-MM-DDTHH:mm" as UTC, so we parse manually.
 */
export function localDatetimeToUTC(localDatetime: string): string {
  if (!localDatetime) return ""
  try {
    const [datePart, timePart] = localDatetime.split("T")
    const [year, month, day] = datePart.split("-").map(Number)
    const [hour, minute] = timePart.split(":").map(Number)
    // datetime-local gives local time. Treat as Asia/Jakarta (WIB).
    // Convert to UTC by subtracting the WIB offset (7 hours).
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute) - 7 * 60 * 60 * 1000)
    return utcDate.toISOString()
  } catch {
    // fallback: let JS parse as UTC (not ideal but won't crash)
    const d = new Date(localDatetime)
    return d.toISOString()
  }
}

/**
 * Format a UTC ISO string to local Indonesian time (WIB, UTC+7) for display.
 * Falls back to date-fns format + id locale if date-fns-tz unavailable.
 */
export function formatLocalTime(utcISOString: string, fmt = "dd MMM yyyy HH:mm"): string {
  if (!utcISOString) return "—"
  try {
    return formatInTimeZone(new Date(utcISOString), "Asia/Jakarta", fmt, { locale: id })
  } catch {
    // fallback: treat as local time interpreted as UTC
    return format(new Date(utcISOString), fmt, { locale: id })
  }
}

export function formatLocalDate(utcISOString: string): string {
  return formatLocalTime(utcISOString, "dd MMM yyyy")
}

export function formatLocalTimeOnly(utcISOString: string): string {
  return formatLocalTime(utcISOString, "HH:mm")
}
