import { getEmailSettings } from './tenant-settings.service.js';

/**
 * Back-compat wrapper: the SMTP settings live in `tenants.settings` and are
 * read through the shared `getEmailSettings` reader. This function used to run
 * its own `SELECT settings FROM tenants` and return `null` whenever the section
 * was missing — which was always, because the PATCH schema had no `email`
 * key and Zod silently stripped it. The admin filled in SMTP, got a green
 * toast, and the mailer kept using whatever env fallback it had.
 */
export async function getTenantEmailSettings(tenantId: string): Promise<{
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
} | null> {
  return getEmailSettings(tenantId);
}