import { queryWithTenant, getClientWithTenant } from '../db/pool.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DisciplineCategory {
  id: number;
  name: string;
  general_description: string | null;
  impact_victim: string | null;
  impact_perpetrator: string | null;
  impact_school: string | null;
}

export interface DisciplineEducationLevel {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface DisciplineBehaviorGroup {
  id: number;
  category_id: number;
  group_name: string;
  description: string | null;
}

export interface DisciplineBehaviorDetail {
  id: number;
  group_id: number;
  behavior_text: string;
}

export interface DisciplineHandlingGuideline {
  id: number;
  category_id: number;
  level_id: number;
  target_type: string;
  step_number: number;
  guideline_text: string;
}

export interface DisciplineConsequenceGuideline {
  id: number;
  category_id: number;
  level_id: number;
  consequence_type: string;
  consequence_text: string;
}

export interface DisciplineRequiredDocument {
  id: number;
  category_id: number;
  level_id: number;
  document_name: string;
  template_url: string | null;
  description: string | null;
}

export interface SearchParams {
  q?: string;
  category_id?: number;
  level_id?: number;
  group_id?: number;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string): Promise<DisciplineCategory[]> {
  const { rows } = await queryWithTenant<DisciplineCategory>(
    tenantId,
    `SELECT * FROM discipline_categories ORDER BY id`,
  );
  return rows;
}

export async function getCategoryById(tenantId: string, id: number): Promise<DisciplineCategory> {
  const { rows } = await queryWithTenant<DisciplineCategory>(
    tenantId,
    `SELECT * FROM discipline_categories WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('DisciplineCategory', String(id));
  return rows[0];
}

export async function createCategory(
  tenantId: string,
  input: Omit<DisciplineCategory, 'id'>
): Promise<DisciplineCategory> {
  const { rows } = await queryWithTenant<DisciplineCategory>(
    tenantId,
    `INSERT INTO discipline_categories (name, general_description, impact_victim, impact_perpetrator, impact_school)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.general_description, input.impact_victim, input.impact_perpetrator, input.impact_school],
  );
  return rows[0]!;
}

export async function updateCategory(
  tenantId: string,
  id: number,
  input: Partial<Omit<DisciplineCategory, 'id'>>
): Promise<DisciplineCategory> {
  const client = await getClientWithTenant(tenantId);
  try {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let i = 1;
    if (input.name !== undefined)          { sets.push(`name = $${i++}`);          values.push(input.name); }
    if (input.general_description !== undefined) { sets.push(`general_description = $${i++}`); values.push(input.general_description); }
    if (input.impact_victim !== undefined) { sets.push(`impact_victim = $${i++}`);   values.push(input.impact_victim); }
    if (input.impact_perpetrator !== undefined) { sets.push(`impact_perpetrator = $${i++}`); values.push(input.impact_perpetrator); }
    if (input.impact_school !== undefined) { sets.push(`impact_school = $${i++}`);  values.push(input.impact_school); }
    values.push(id);
    const { rows } = await client.query<DisciplineCategory>(
      `UPDATE discipline_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new NotFoundError('DisciplineCategory', String(id));
    return rows[0]!;
  } finally {
    client.release();
  }
}

export async function deleteCategory(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_categories WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineCategory', String(id));
}

// ─── Education Levels ─────────────────────────────────────────────────────────

export async function listEducationLevels(tenantId: string): Promise<DisciplineEducationLevel[]> {
  const { rows } = await queryWithTenant<DisciplineEducationLevel>(
    tenantId,
    `SELECT * FROM discipline_education_levels ORDER BY sort_order, id`,
  );
  return rows;
}

export async function createEducationLevel(
  tenantId: string,
  input: Omit<DisciplineEducationLevel, 'id'>
): Promise<DisciplineEducationLevel> {
  const { rows } = await queryWithTenant<DisciplineEducationLevel>(
    tenantId,
    `INSERT INTO discipline_education_levels (code, name, sort_order)
     VALUES ($1, $2, $3) RETURNING *`,
    [input.code, input.name, input.sort_order ?? 0],
  );
  return rows[0]!;
}

export async function deleteEducationLevel(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_education_levels WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineEducationLevel', String(id));
}

// ─── Behavior Groups ──────────────────────────────────────────────────────────

export async function listBehaviorGroups(tenantId: string, categoryId?: number): Promise<DisciplineBehaviorGroup[]> {
  const { rows } = await queryWithTenant<DisciplineBehaviorGroup>(
    tenantId,
    categoryId
      ? `SELECT * FROM discipline_behavior_groups WHERE category_id = $1 ORDER BY id`
      : `SELECT * FROM discipline_behavior_groups ORDER BY id`,
    categoryId ? [categoryId] : [],
  );
  return rows;
}

export async function createBehaviorGroup(
  tenantId: string,
  input: Omit<DisciplineBehaviorGroup, 'id'>
): Promise<DisciplineBehaviorGroup> {
  const { rows } = await queryWithTenant<DisciplineBehaviorGroup>(
    tenantId,
    `INSERT INTO discipline_behavior_groups (category_id, group_name, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [input.category_id, input.group_name, input.description],
  );
  return rows[0]!;
}

export async function deleteBehaviorGroup(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_behavior_groups WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineBehaviorGroup', String(id));
}

// ─── Behavior Details ─────────────────────────────────────────────────────────

export async function listBehaviorDetails(
  tenantId: string,
  groupId?: number
): Promise<DisciplineBehaviorDetail[]> {
  const { rows } = await queryWithTenant<DisciplineBehaviorDetail>(
    tenantId,
    groupId
      ? `SELECT * FROM discipline_behavior_details WHERE group_id = $1 ORDER BY id`
      : `SELECT * FROM discipline_behavior_details ORDER BY id`,
    groupId ? [groupId] : [],
  );
  return rows;
}

export async function createBehaviorDetail(
  tenantId: string,
  input: Omit<DisciplineBehaviorDetail, 'id'>
): Promise<DisciplineBehaviorDetail> {
  const { rows } = await queryWithTenant<DisciplineBehaviorDetail>(
    tenantId,
    `INSERT INTO discipline_behavior_details (group_id, behavior_text)
     VALUES ($1, $2) RETURNING *`,
    [input.group_id, input.behavior_text],
  );
  return rows[0]!;
}

export async function deleteBehaviorDetail(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_behavior_details WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineBehaviorDetail', String(id));
}

// ─── Behavior Levels (Pivot) ──────────────────────────────────────────────────

export async function setBehaviorLevels(
  tenantId: string,
  behaviorId: number,
  levelIds: number[]
): Promise<void> {
  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM discipline_behavior_levels WHERE behavior_id = $1`,
      [behaviorId],
    );
    for (const levelId of levelIds) {
      await client.query(
        `INSERT INTO discipline_behavior_levels (behavior_id, level_id) VALUES ($1, $2)`,
        [behaviorId, levelId],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getBehaviorLevels(tenantId: string, behaviorId: number): Promise<number[]> {
  const { rows } = await queryWithTenant<{ level_id: number }>(
    tenantId,
    `SELECT level_id FROM discipline_behavior_levels WHERE behavior_id = $1`,
    [behaviorId],
  );
  return rows.map(r => r.level_id);
}

// ─── Handling Guidelines ────────────────────────────────────────────────────

export async function listHandlingGuidelines(
  tenantId: string,
  categoryId?: number,
  levelId?: number
): Promise<DisciplineHandlingGuideline[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (categoryId) {
    conditions.push(`category_id = $${idx++}`);
    values.push(categoryId);
  }
  if (levelId) {
    conditions.push(`level_id = $${idx++}`);
    values.push(levelId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await queryWithTenant<DisciplineHandlingGuideline>(
    tenantId,
    `SELECT * FROM discipline_handling_guidelines ${where} ORDER BY category_id, level_id, target_type, step_number`,
    values,
  );
  return rows;
}

export async function createHandlingGuideline(
  tenantId: string,
  input: Omit<DisciplineHandlingGuideline, 'id'>
): Promise<DisciplineHandlingGuideline> {
  const { rows } = await queryWithTenant<DisciplineHandlingGuideline>(
    tenantId,
    `INSERT INTO discipline_handling_guidelines (category_id, level_id, target_type, step_number, guideline_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.category_id, input.level_id, input.target_type, input.step_number, input.guideline_text],
  );
  return rows[0]!;
}

export async function deleteHandlingGuideline(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_handling_guidelines WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineHandlingGuideline', String(id));
}

// ─── Consequence Guidelines ──────────────────────────────────────────────────

export async function listConsequenceGuidelines(
  tenantId: string,
  categoryId?: number,
  levelId?: number
): Promise<DisciplineConsequenceGuideline[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (categoryId) {
    conditions.push(`category_id = $${idx++}`);
    values.push(categoryId);
  }
  if (levelId) {
    conditions.push(`level_id = $${idx++}`);
    values.push(levelId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await queryWithTenant<DisciplineConsequenceGuideline>(
    tenantId,
    `SELECT * FROM discipline_consequence_guidelines ${where} ORDER BY category_id, level_id, consequence_type`,
    values,
  );
  return rows;
}

export async function createConsequenceGuideline(
  tenantId: string,
  input: Omit<DisciplineConsequenceGuideline, 'id'>
): Promise<DisciplineConsequenceGuideline> {
  const { rows } = await queryWithTenant<DisciplineConsequenceGuideline>(
    tenantId,
    `INSERT INTO discipline_consequence_guidelines (category_id, level_id, consequence_type, consequence_text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.category_id, input.level_id, input.consequence_type, input.consequence_text],
  );
  return rows[0]!;
}

export async function deleteConsequenceGuideline(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_consequence_guidelines WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineConsequenceGuideline', String(id));
}

// ─── Required Documents ───────────────────────────────────────────────────────

export async function listRequiredDocuments(
  tenantId: string,
  categoryId?: number,
  levelId?: number
): Promise<DisciplineRequiredDocument[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (categoryId) {
    conditions.push(`category_id = $${idx++}`);
    values.push(categoryId);
  }
  if (levelId) {
    conditions.push(`level_id = $${idx++}`);
    values.push(levelId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await queryWithTenant<DisciplineRequiredDocument>(
    tenantId,
    `SELECT * FROM discipline_required_documents ${where} ORDER BY category_id, level_id`,
    values,
  );
  return rows;
}

export async function createRequiredDocument(
  tenantId: string,
  input: Omit<DisciplineRequiredDocument, 'id'>
): Promise<DisciplineRequiredDocument> {
  const { rows } = await queryWithTenant<DisciplineRequiredDocument>(
    tenantId,
    `INSERT INTO discipline_required_documents (category_id, level_id, document_name, template_url, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.category_id, input.level_id, input.document_name, input.template_url, input.description],
  );
  return rows[0]!;
}

export async function deleteRequiredDocument(tenantId: string, id: number): Promise<void> {
  const { rowCount } = await queryWithTenant(
    tenantId,
    `DELETE FROM discipline_required_documents WHERE id = $1`,
    [id],
  );
  if (!rowCount) throw new NotFoundError('DisciplineRequiredDocument', String(id));
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  behavior: DisciplineBehaviorDetail;
  group: DisciplineBehaviorGroup;
  category: DisciplineCategory;
  levels: DisciplineEducationLevel[];
}

export async function searchBehaviors(tenantId: string, params: SearchParams): Promise<SearchResult[]> {
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;

  if (params.q) {
    conditions.push(`to_tsvector('indonesian', bd.behavior_text) @@ plainto_tsquery('indonesian', $${idx++})`);
    values.push(params.q);
  }
  if (params.category_id) {
    conditions.push(`bg.category_id = $${idx++}`);
    values.push(params.category_id);
  }
  if (params.level_id) {
    conditions.push(`EXISTS (SELECT 1 FROM discipline_behavior_levels bl WHERE bl.behavior_id = bd.id AND bl.level_id = $${idx++})`);
    values.push(params.level_id);
  }
  if (params.group_id) {
    conditions.push(`bd.group_id = $${idx++}`);
    values.push(params.group_id);
  }

  const { rows } = await queryWithTenant<SearchResult & {
    behavior_id: number;
    group_id: number;
    category_id: number;
    level_id: number;
    level_code: string;
    level_name: string;
    level_sort_order: number;
  }>(
    tenantId,
    `SELECT
       bd.id as behavior_id, bd.behavior_text, bd.group_id,
       bg.category_id, bg.group_name,
       bc.name as category_name, bc.general_description,
       el.id as level_id, el.code as level_code, el.name as level_name, el.sort_order as level_sort_order
     FROM discipline_behavior_details bd
     JOIN discipline_behavior_groups bg ON bg.id = bd.group_id
     JOIN discipline_categories bc ON bc.id = bg.category_id
     JOIN discipline_behavior_levels bl ON bl.behavior_id = bd.id
     JOIN discipline_education_levels el ON el.id = bl.level_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY bc.id, bg.id, bd.id`,
    values,
  );

  // Group by behavior
  const map = new Map<number, SearchResult>();
  for (const r of rows) {
    if (!map.has(r.behavior_id)) {
      map.set(r.behavior_id, {
        behavior: { id: r.behavior_id, group_id: r.group_id, behavior_text: r.behavior_text },
        group: { id: r.group_id, category_id: r.category_id, group_name: r.group_name, description: null },
        category: {
          id: r.category_id,
          name: r.category_name,
          general_description: r.general_description ?? null,
          impact_victim: null, impact_perpetrator: null, impact_school: null,
        },
        levels: [],
      });
    }
    const entry = map.get(r.behavior_id)!;
    if (!entry.levels.find(l => l.id === r.level_id)) {
      entry.levels.push({
        id: r.level_id,
        code: r.level_code,
        name: r.level_name,
        sort_order: r.level_sort_order,
      });
    }
  }

  return Array.from(map.values());
}

// ─── Full Handbook Tree ───────────────────────────────────────────────────────
// Returns complete hierarchical data for frontend display

export interface HandbookTreeNode {
  category: DisciplineCategory;
  groups: {
    group: DisciplineBehaviorGroup;
    behaviors: Array<DisciplineBehaviorDetail & { levels: DisciplineEducationLevel[] }>;
  }[];
  handling_guidelines: DisciplineHandlingGuideline[];
  consequence_guidelines: DisciplineConsequenceGuideline[];
  required_documents: DisciplineRequiredDocument[];
}

export async function getFullHandbook(tenantId: string, levelId?: number): Promise<HandbookTreeNode[]> {
  // levelCondition uses $2 for level_id when provided
  const levelCondition = levelId ? `AND EXISTS (
    SELECT 1 FROM discipline_behavior_levels bl
    JOIN discipline_behavior_details bd2 ON bd2.id = bl.behavior_id
    WHERE bd2.group_id = bg.id AND bl.level_id = $2
  )` : '';

  const { rows: categories } = await queryWithTenant<DisciplineCategory>(
    tenantId,
    `SELECT * FROM discipline_categories ORDER BY id`,
  );

  // Only pass params when levelCondition references them
  const groupsParams: unknown[] = levelId ? [tenantId, levelId] : [];
  const { rows: groups } = await queryWithTenant<DisciplineBehaviorGroup>(
    tenantId,
    `SELECT DISTINCT bg.*
     FROM discipline_behavior_groups bg
     JOIN discipline_categories bc ON bc.id = bg.category_id
     WHERE EXISTS (SELECT 1 FROM discipline_behavior_details bd WHERE bd.group_id = bg.id)
     ${levelCondition}
     ORDER BY bg.id`,
    groupsParams,
  );

  const behaviorParams: unknown[] = levelId ? [tenantId, levelId] : [];
  const { rows: behaviors } = await queryWithTenant<DisciplineBehaviorDetail & { level_id: number; level_code: string; level_name: string; level_sort_order: number }>(
    tenantId,
    `SELECT bd.*, el.id as level_id, el.code as level_code, el.name as level_name, el.sort_order as level_sort_order
     FROM discipline_behavior_details bd
     JOIN discipline_behavior_groups bg ON bg.id = bd.group_id
     JOIN discipline_behavior_levels bl ON bl.behavior_id = bd.id
     JOIN discipline_education_levels el ON el.id = bl.level_id
     ${levelCondition}
     ORDER BY bd.group_id, bd.id`,
    behaviorParams,
  );

  const { rows: guidelines } = await queryWithTenant<DisciplineHandlingGuideline>(
    tenantId,
    levelId
      ? `SELECT * FROM discipline_handling_guidelines WHERE level_id = $1 ORDER BY category_id, step_number`
      : `SELECT * FROM discipline_handling_guidelines ORDER BY category_id, level_id, step_number`,
    levelId ? [levelId] : [],
  );

  const { rows: consequences } = await queryWithTenant<DisciplineConsequenceGuideline>(
    tenantId,
    levelId
      ? `SELECT * FROM discipline_consequence_guidelines WHERE level_id = $1 ORDER BY category_id, consequence_type`
      : `SELECT * FROM discipline_consequence_guidelines ORDER BY category_id, level_id, consequence_type`,
    levelId ? [levelId] : [],
  );

  const { rows: documents } = await queryWithTenant<DisciplineRequiredDocument>(
    tenantId,
    levelId
      ? `SELECT * FROM discipline_required_documents WHERE level_id = $1 ORDER BY category_id`
      : `SELECT * FROM discipline_required_documents ORDER BY category_id, level_id`,
    levelId ? [levelId] : [],
  );

  // Build tree
  const groupsByCategory = new Map<number, typeof groups>();
  const behaviorsByGroup = new Map<number, typeof behaviors>();

  for (const g of groups) {
    if (!groupsByCategory.has(g.category_id)) groupsByCategory.set(g.category_id, []);
    groupsByCategory.get(g.category_id)!.push(g);
  }

  const seenBehaviorIds = new Set<number>();
  for (const b of behaviors) {
    if (seenBehaviorIds.has(b.id)) continue; // dedupe: same behavior across multiple levels → take first level only
    seenBehaviorIds.add(b.id);
    if (!behaviorsByGroup.has(b.group_id)) behaviorsByGroup.set(b.group_id, []);
    behaviorsByGroup.get(b.group_id)!.push(b);
  }

  return categories.map(cat => {
    const catGroups = groupsByCategory.get(cat.id) ?? [];
    return {
      category: cat,
      groups: catGroups.map(g => ({
        group: g,
        behaviors: (behaviorsByGroup.get(g.id) ?? []).map(b => ({
          id: b.id,
          group_id: b.group_id,
          behavior_text: b.behavior_text,
          levels: [{ id: b.level_id, code: b.level_code, name: b.level_name, sort_order: b.level_sort_order }],
        })),
      })),
      handling_guidelines: guidelines.filter(gl => gl.category_id === cat.id),
      consequence_guidelines: consequences.filter(cg => cg.category_id === cat.id),
      required_documents: documents.filter(rd => rd.category_id === cat.id),
    };
  });
}