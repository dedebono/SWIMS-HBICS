import { describe, it, expect } from 'vitest';
import { runPatternDetectionForTenant } from '../services/pattern-detection.service.js';

describe('Pattern Detection Service', () => {
  it('should run without throwing errors', async () => {
    await expect(runPatternDetectionForTenant('tenant-123')).resolves.toBeUndefined();
  });
});
