/**
 * Loads credentials from the environment the backend already has, so no secret
 * is ever copied, echoed, or passed on a command line.
 */
export function loadDbConfig() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_AUDIT_URL;
  if (!url) throw new Error('DATABASE_URL not set in this container env');
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'swims',
  };
}