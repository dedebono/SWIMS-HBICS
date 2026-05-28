import { getClientWithTenant } from '../db/pool.js';
import { decryptField } from '../utils/encryption.js';

export interface StudentSearchResult {
  student_id: string;
  full_name: string;
  metadata: any;
  display_id?: string;
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
    const { rows: dbResultsRaw } = await client.query<StudentSearchResult & { national_id: string | null }>(
      `SELECT student_id, full_name, metadata, national_id
       FROM students
       WHERE tenant_id = $1
         AND (
            full_name ILIKE $2
            OR metadata::text ILIKE $2
         )
       ORDER BY full_name ASC
       LIMIT $3`,
      [tenantId, searchTerm, limit]
    );

    const dbResults = dbResultsRaw.map(r => {
      let display_id = undefined;
      if (r.national_id) {
        try { display_id = decryptField(r.national_id); } catch(e) {}
      }
      const { national_id, ...rest } = r;
      return { ...rest, display_id };
    });

    // 2. Search by decrypted National ID / Student ID
    const { rows: allWithId } = await client.query<{ student_id: string, full_name: string, metadata: any, national_id: string }>(
      `SELECT student_id, full_name, metadata, national_id 
       FROM students 
       WHERE tenant_id = $1 AND national_id IS NOT NULL`,
      [tenantId]
    );

    const manualMatches = allWithId.filter(s => {
      try {
        const decrypted = decryptField(s.national_id).toLowerCase();
        return decrypted.includes(normalizedQuery);
      } catch (e) {
        return false;
      }
    }).map(s => {
      let display_id = undefined;
      try { display_id = decryptField(s.national_id); } catch(e) {}
      return { 
        student_id: s.student_id, 
        full_name: s.full_name, 
        metadata: s.metadata,
        display_id
      };
    });

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
      const { rows } = await client.query<StudentSearchResult & { national_id: string | null }>(
        `SELECT student_id, full_name, metadata, national_id
         FROM students
         WHERE tenant_id = $1 AND student_id = $2`,
        [tenantId, normalizedId]
      );
      if (rows[0]) {
        let display_id = undefined;
        if (rows[0].national_id) {
          try { display_id = decryptField(rows[0].national_id); } catch(e) {}
        }
        const { national_id, ...rest } = rows[0];
        return { ...rest, display_id };
      }
    }

    // 2. Try Student ID (decrypted national_id)
    const { rows: allWithId } = await client.query<{ student_id: string, full_name: string, metadata: any, national_id: string }>(
      `SELECT student_id, full_name, metadata, national_id 
       FROM students 
       WHERE tenant_id = $1 AND national_id IS NOT NULL`,
      [tenantId]
    );

    for (const s of allWithId) {
      try {
        const decrypted = decryptField(s.national_id);
        if (decrypted.toLowerCase() === normalizedId.toLowerCase()) {
          return {
            student_id: s.student_id,
            full_name: s.full_name,
            metadata: s.metadata,
            display_id: decrypted
          };
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

