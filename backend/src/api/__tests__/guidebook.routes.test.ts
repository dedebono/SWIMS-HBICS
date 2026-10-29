import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateTestToken } from '../../test/utils/auth-mock.js';

// Mock the service before app is imported (both functions are sync)
vi.mock('../../services/guidebook.service.js', () => ({
  loadAllGuidebooks: vi.fn(),
  extractViolationCategories: vi.fn(),
}));

import { app } from '../../index.js';
import {
  loadAllGuidebooks,
  extractViolationCategories,
} from '../../services/guidebook.service.js';

const MOCK_GUIDEBOOKS = [
  { filename: 'SMP.pdf', schoolLevel: 'SMP', content: '...' },
  { filename: 'SMA.pdf', schoolLevel: 'SMA', content: '...' },
];

describe('Guidebook Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/guidebook', () => {
    it('should return guidebooks structured by school level and categories', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      (loadAllGuidebooks as any).mockReturnValue(MOCK_GUIDEBOOKS);
      (extractViolationCategories as any).mockImplementation((gb: any) =>
        gb.filename === 'SMP.pdf' ? ['Terlambat', 'Atribut'] : ['Merokok'],
      );

      const res = await request(app)
        .get('/api/guidebook')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([
        { filename: 'SMP.pdf', schoolLevel: 'SMP', categories: ['Terlambat', 'Atribut'] },
        { filename: 'SMA.pdf', schoolLevel: 'SMA', categories: ['Merokok'] },
      ]);
      expect(loadAllGuidebooks).toHaveBeenCalledTimes(1);
      // Each guidebook must go through the category extractor exactly once.
      expect(extractViolationCategories).toHaveBeenCalledTimes(2);
      expect(extractViolationCategories).toHaveBeenNthCalledWith(1, MOCK_GUIDEBOOKS[0]);
      expect(extractViolationCategories).toHaveBeenNthCalledWith(2, MOCK_GUIDEBOOKS[1]);
    });

    it('should never leak raw guidebook content into the response', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      (loadAllGuidebooks as any).mockReturnValue(MOCK_GUIDEBOOKS);
      (extractViolationCategories as any).mockReturnValue([]);

      const res = await request(app)
        .get('/api/guidebook')
        .set('Authorization', `Bearer ${token}`);

      expect(JSON.stringify(res.body)).not.toContain('content');
    });

    it('should return an empty list when no guidebooks are available', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      (loadAllGuidebooks as any).mockReturnValue([]);

      const res = await request(app)
        .get('/api/guidebook')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    // The guidebook router only requires authentication — there is no
    // checkPermission middleware, so any authenticated role (even STUDENT,
    // the deny-all role) may read it. No 403 test applies here.
    it('should require authentication', async () => {
      const res = await request(app).get('/api/guidebook');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
