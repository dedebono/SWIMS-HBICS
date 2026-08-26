import { getClientWithTenant } from '../db/pool.js';

export async function getTenantEmailSettings(tenantId: string): Promise<{
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
} | null> {
  const client = await getClientWithTenant(tenantId);
  try {
    const { rows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1', [tenantId]);
    const settings = rows[0]?.settings || {};
    const email = settings?.email as Record<string, unknown> | undefined;
    if (!email?.host || !email?.port) return null;
    return {
      host: String(email.host),
      port: Number(email.port),
      secure: Boolean(email.secure),
      username: email.username ? String(email.username) : undefined,
      password: email.password ? String(email.password) : undefined,
    };
  } finally {
    client.release();
  }
}
