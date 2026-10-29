import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as quisionerListsService from '../quisioner-lists.service.js';
import * as pool from '../../db/pool.js';

vi.mock('../../db/pool.js', () => ({
  queryWithTenant: vi.fn(),
}));

describe('Quisioner Lists Service', () => {
  const mockTenantId = 'tenant-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createQuestionList', () => {
    it('creates a list and sanitizes targets', async () => {
      // Mock db response
      const mockResult = {
        rows: [{
          question_list_id: 'list-1',
          name: 'Staff List',
          description: 'Desc',
          targets: ['staff', 'appointment_student'],
          is_active: true,
        }],
      };
      (pool.queryWithTenant as any).mockResolvedValue(mockResult);

      const payload = {
        name: 'Staff List',
        description: 'Desc',
        targets: ['staff', 'appointment_student', 'invalid_target'],
        is_active: true,
      };

      const result = await quisionerListsService.createQuestionList(mockTenantId, payload);
      
      expect(pool.queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.stringContaining('INSERT INTO quisioner_question_lists'),
        expect.arrayContaining([
          mockTenantId,
          payload.name,
          payload.description,
          JSON.stringify(['staff', 'appointment_student']), // invalid_target should be stripped
          payload.is_active,
        ])
      );

      expect(result).toEqual(mockResult.rows[0]);
    });
  });

  describe('getActiveListForTargets', () => {
      it('fetches lists for matching targets', async () => {
        const mockResult = {
          rows: [{
            question_list_id: 'list-2',
            targets: ['staff'],
            is_active: true,
          }],
        };
        (pool.queryWithTenant as any).mockResolvedValue(mockResult);

        const result = await quisionerListsService.getActiveListForTargets(mockTenantId, ['staff']);

        expect(pool.queryWithTenant).toHaveBeenCalledWith(
          mockTenantId,
          expect.stringContaining('targets ?| $2'),
          [mockTenantId, ['staff']]
        );

        expect(result).toEqual(mockResult.rows[0]);
      });
    });

    describe('getActiveListForDomain — student vs staff separation', () => {
      beforeEach(() => { (pool.queryWithTenant as any).mockReset(); });

      it('scopes the student domain to appointment_* targets', async () => {
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'student');
        expect(pool.queryWithTenant).toHaveBeenCalledWith(
          mockTenantId,
          expect.any(String),
          [mockTenantId, ['appointment_student', 'appointment_case']]
        );
      });

      it('scopes the staff domain to the staff target ONLY', async () => {
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'staff');
        expect(pool.queryWithTenant).toHaveBeenCalledWith(
          mockTenantId,
          expect.any(String),
          [mockTenantId, ['staff']]
        );
      });

      it('never asks for appointment_* when resolving the staff domain', async () => {
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'staff');
        const params = (pool.queryWithTenant as any).mock.calls[0][2] as string[][];
        expect(params[1]).not.toContain('appointment_student');
        expect(params[1]).not.toContain('appointment_case');
      });

      it('never asks for the staff target when resolving the student domain', async () => {
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'student');
        const params = (pool.queryWithTenant as any).mock.calls[0][2] as string[][];
        expect(params[1]).not.toContain('staff');
      });

      it('ranks a domain-specific list above a catch-all list', async () => {
        // The ORDER BY must prefer a list carrying EVERY target of the domain
        // before falling back to updated_at — otherwise editing the catch-all
        // "Daftar Umum" list silently swaps the questionnaire teachers see.
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'student');
        const sql = (pool.queryWithTenant as any).mock.calls[0][1] as string;
        expect(sql).toContain('to_jsonb(ARRAY[t])');
        expect(sql).toContain('updated_at DESC');
      });

      it('excludes lists that have no live questions', async () => {
        // An empty scratch list must never resolve a domain to nothing.
        (pool.queryWithTenant as any).mockResolvedValue({ rows: [] });
        await quisionerListsService.getActiveListForDomain(mockTenantId, 'staff');
        const sql = (pool.queryWithTenant as any).mock.calls[0][1] as string;
        expect(sql).toContain('EXISTS');
        expect(sql).toContain('q.deleted_at IS NULL');
      });
    });
});
