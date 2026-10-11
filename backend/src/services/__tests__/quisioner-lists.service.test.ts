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
});
