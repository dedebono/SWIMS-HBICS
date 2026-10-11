import { getClientWithTenant } from '../db/pool.js';
import { decryptField } from '../utils/encryption.js';
import { buildAvatarUrl } from './avatar.service.js';

export interface StudentSearchResult {
  student_id: string;
  full_name: string;
  metadata: any;
  display_id?: string;
  /**
   * Signed 128px WebP of the student's profile photo, or null when they have
   * none. The UI renders this in the student picker instead of dumping UUID +
   * e-mail at the reporter, so a photo-less student still shows their initials.
   */
  thumb_url?: string | null;
}

/** Raw row shape the student queries select. */
type StudentRow = {
  student_id: string;
  full_name: string;
  metadata: any;
  national_id: string | null;
  avatar_key: string | null;
  avatar_updated_at: string | null;
};

/**
 * Shared mapping: decrypt the National ID for display and mint the signed
 * thumbnail URL from the columns already selected (no extra query per row).
 */
function toSearchResult(r: StudentRow, tenantId: string): StudentSearchResult {
  let display_id: string | undefined;
  if (r.national_id) {
    try { display_id = decryptField(r.national_id); } catch { /* unreadable → hide */ }
  }
  return {
    student_id: r.student_id,
    full_name: r.full_name,
    metadata: r.metadata,
    display_id,
    thumb_url: r.avatar_key ? buildAvatarUrl(r.student_id, tenantId, 'thumb', r.avatar_updated_at) : null,
  };
}

/**
 * Searches for students by name, metadata, or Student ID (national_id).
 */
export async function searchStudents(tenantId: string, query: string, limit: number = 10): Promise<StudentSearchResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const client = await getClientWithTenant(tenantId);
  try {
    const searchTerm = `%${query.trim()}%`;
    const normalizedQuery = query.trim().toLowerCase();
    
    // 1. Database-side search (name and metadata)
    const { rows: dbResultsRaw } = await client.query<StudentRow>(
      `SELECT student_id, full_name, metadata, national_id, avatar_key, avatar_updated_at
       FROM students
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND (
            full_name ILIKE $2
            OR metadata::text ILIKE $2
         )
       ORDER BY full_name ASC
       LIMIT $3`,
      [tenantId, searchTerm, limit]
    );

    const dbResults = dbResultsRaw.map((r) => toSearchResult(r, tenantId));

    // 2. Search by decrypted National ID / Student ID
    const { rows: allWithId } = await client.query<StudentRow>(
      `SELECT student_id, full_name, metadata, national_id, avatar_key, avatar_updated_at
       FROM students
       WHERE tenant_id = $1 AND national_id IS NOT NULL AND deleted_at IS NULL`,
      [tenantId]
    );

    const manualMatches = allWithId
      .filter((s) => {
        try {
          return decryptField(s.national_id).toLowerCase().includes(normalizedQuery);
        } catch (e) {
          return false;
        }
      })
      .map((s) => toSearchResult(s, tenantId));

    // Combine, deduplicate, and limit
    const combined = [...dbResults];
    for (const match of manualMatches) {
      if (!combined.some(r => r.student_id === match.student_id)) {
        combined.push(match);
      }
    }

    return combined.slice(0, limit);
  } finally {
    client.release();
  }
}

/**
 * Gets a student by UUID or Student ID (national_id).
 */
export async function getStudentById(tenantId: string, idOrUuid: string): Promise<StudentSearchResult | null> {
  const client = await getClientWithTenant(tenantId);
  try {
    const normalizedId = idOrUuid.trim();

    // 1. Try UUID first (fast)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(normalizedId)) {
      const { rows } = await client.query<StudentRow>(
        `SELECT student_id, full_name, metadata, national_id, avatar_key, avatar_updated_at
         FROM students
         WHERE tenant_id = $1 AND student_id = $2 AND deleted_at IS NULL`,
        [tenantId, normalizedId]
      );
      if (rows[0]) {
        return toSearchResult(rows[0], tenantId);
      }
    }

    // 2. Try Student ID (decrypted national_id)
    const { rows: allWithId } = await client.query<StudentRow>(
      `SELECT student_id, full_name, metadata, national_id, avatar_key, avatar_updated_at
       FROM students
       WHERE tenant_id = $1 AND national_id IS NOT NULL AND deleted_at IS NULL`,
      [tenantId]
    );

    for (const s of allWithId) {
      try {
        const decrypted = decryptField(s.national_id);
        if (decrypted.toLowerCase() === normalizedId.toLowerCase()) {
          return toSearchResult(s, tenantId);
        }
      } catch (e) {
        // ignore
      }
    }

    return null;
  } finally {
    client.release();
  }
}

