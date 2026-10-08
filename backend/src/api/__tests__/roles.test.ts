import { describe, it, expect } from 'vitest';
import {
  Role,
  ROLE_NAMES,
  ACCOUNT_ROLE_NAMES,
  STUDENT,
  getAccountRoleTarget,
} from '@swims/shared';
import { PERMISSIONS } from '@swims/shared';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Drift guard for the role vocabulary.
 *
 * The role list had previously drifted across five independent places (the
 * users.role CHECK constraint, the Role union, the permission matrix, the Role
 * Permissions UI, and the create/edit/filter dropdowns), which is how
 * HOMEROOM_TEACHER survived its own retirement and how SUBSTITUTE_TEACHER /
 * CASE_REVIEWER stayed selectable while having no accounts at all.
 *
 * These assertions pin the backend side together. The frontend keeps its own
 * copy (it cannot import @swims/shared), so the last test cross-checks that
 * copy against ROLE_NAMES by reading the source text.
 */

const RETIRED_ROLES = ['SUBSTITUTE_TEACHER', 'CASE_REVIEWER', 'HOMEROOM_TEACHER'] as const;

describe('role vocabulary', () => {
  it('ROLE_NAMES matches the Role union exactly', () => {
    expect([...ROLE_NAMES].sort()).toEqual(Object.keys(Role).sort());
  });

  it('ACCOUNT_ROLE_NAMES is the login roles plus STUDENT', () => {
    expect(ACCOUNT_ROLE_NAMES).toHaveLength(ROLE_NAMES.length + 1);
    expect(ACCOUNT_ROLE_NAMES).toContain(STUDENT);
    expect(ACCOUNT_ROLE_NAMES).toEqual(expect.arrayContaining([...ROLE_NAMES]));
  });

  it('STUDENT is not a login role', () => {
    expect(Object.keys(Role)).not.toContain(STUDENT);
    expect(ROLE_NAMES).not.toContain(STUDENT as never);
  });

  it('getAccountRoleTarget routes STUDENT to students and the rest to users', () => {
    expect(getAccountRoleTarget(STUDENT)).toBe('students');
    for (const role of ROLE_NAMES) {
      expect(getAccountRoleTarget(role)).toBe('users');
    }
  });

  it('the permission matrix covers exactly the login roles', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ROLE_NAMES].sort());
  });

  it('no retired role survives anywhere', () => {
    for (const role of RETIRED_ROLES) {
      expect(ROLE_NAMES).not.toContain(role as never);
      expect(ACCOUNT_ROLE_NAMES).not.toContain(role as never);
      expect(Object.keys(Role)).not.toContain(role);
      expect(PERMISSIONS).not.toHaveProperty(role);
    }
  });

  it('frontend role lists stay in sync with ROLE_NAMES', () => {
    const constants = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/lib/constants.ts'),
      'utf-8',
    );
    const block = constants.match(/export const LOGIN_ROLES = \[([\s\S]*?)\]/);
    expect(block).not.toBeNull();
    const frontendRoles = Array.from((block![1] ?? '').matchAll(/'([A-Z_]+)'/g), (m) => m[1]);

    expect(frontendRoles.sort()).toEqual([...ROLE_NAMES].sort());
    expect(frontendRoles).not.toContain(STUDENT);
  });

  it('migration 047 keeps the DB constraint in sync', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../db/migrations/047_align_roles.sql'),
      'utf-8',
    );
    const constraint = sql.match(/users_role_check CHECK \(role IN \(([\s\S]*?)\)\);/);
    expect(constraint).not.toBeNull();
    const dbRoles = Array.from((constraint![1] ?? '').matchAll(/'([A-Z_]+)'/g), (m) => m[1]);

    expect(dbRoles.sort()).toEqual([...ROLE_NAMES].sort());
    for (const role of RETIRED_ROLES) {
      expect(dbRoles).not.toContain(role);
    }
  });
});