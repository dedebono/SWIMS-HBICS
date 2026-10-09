import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateTestToken } from '../../test/utils/auth-mock.js';
import { getClientWithTenant } from '../../db/pool.js';
import * as mediaService from '../../services/media.service.js';

describe('Media Routes', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (getClientWithTenant as any).mockResolvedValue(mockClient);
  });

  describe('POST /api/media/upload', () => {
    it('should allow authorized user to create upload request', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (mediaService.createPresignedUpload as any).mockResolvedValue({
        assetId: 'asset-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/file',
        uploadFields: { key: 'value' }
      });

      const res = await request(app)
        .post('/api/media/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          file_name: 'test.jpg',
          mime_type: 'image/jpeg',
          file_hash: 'hash-123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('assetId');
      expect(res.body.data).toHaveProperty('presignedUrl');
      expect(mediaService.createPresignedUpload).toHaveBeenCalledWith(
        'tenant-123',
        {
          file_name: 'test.jpg',
          mime_type: 'image/jpeg',
          file_hash: 'hash-123'
        },
        'user-123',
        expect.anything()
      );
    });

    it('should require media_assets:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/media/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          file_name: 'test.jpg',
          mime_type: 'image/jpeg',
          file_hash: 'hash-123'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/media/:assetId/link', () => {
    it('should allow authorized user to link asset to case', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (mediaService.linkAsset as any).mockResolvedValue({
        assetId: 'asset-123',
        case_id: 'case-123',
        linkedAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/media/asset-123/link')
        .set('Authorization', `Bearer ${token}`)
        .send({ case_id: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mediaService.linkAsset).toHaveBeenCalledWith('tenant-123', 'asset-123', { case_id: '123e4567-e89b-12d3-a456-426614174000' }, 'user-123', expect.anything());
    });

    it('should allow linking to incident instead of case', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (mediaService.linkAsset as any).mockResolvedValue({
        assetId: 'asset-123',
        incident_id: 'incident-123',
        linkedAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/media/asset-123/link')
        .set('Authorization', `Bearer ${token}`)
        .send({ incident_id: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mediaService.linkAsset).toHaveBeenCalledWith('tenant-123', 'asset-123', { incident_id: '123e4567-e89b-12d3-a456-426614174000' }, 'user-123', expect.anything());
    });

    it('should require media_assets:create permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/media/asset-123/link')
        .set('Authorization', `Bearer ${token}`)
        .send({ case_id: '123e4567-e89b-12d3-a456-426614174000' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/media/:assetId/redact', () => {
    it('should allow authorized user to trigger redaction', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (mediaService.triggerRedaction as any).mockResolvedValue({
        assetId: 'asset-123',
        redacted: true,
        redactedAt: new Date().toISOString()
      });

      const res = await request(app)
        .post('/api/media/asset-123/redact')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mediaService.triggerRedaction).toHaveBeenCalledWith('tenant-123', 'asset-123', 'user-123', expect.anything());
    });

    it('should require media_assets:update permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .post('/api/media/asset-123/redact')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/media/:assetId', () => {
    it('should allow authorized user to get asset download URL', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');

      (mediaService.getAssetDownloadUrl as any).mockResolvedValue({
        downloadUrl: 'https://storage.example.com/file?signature=abc',
        fileName: 'test.jpg',
        contentType: 'image/jpeg'
      });

      const res = await request(app)
        .get('/api/media/asset-123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mediaService.getAssetDownloadUrl).toHaveBeenCalledWith('tenant-123', 'asset-123', 'user-123', expect.anything());
    });

    it('should require media_assets:read permission', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'STUDENT');

      const res = await request(app)
        .get('/api/media/asset-123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // NOTE: these previously targeted `/api/media/cases/:caseId/media`, a route
  // that has never existed on this router — the app exposes `GET /api/media/:assetId`
  // (gated by media_assets:read). Both assertions passed vacuously against a
  // 404 from the not-found handler, so the real route is covered here instead.
  describe('GET /api/media/:assetId', () => {
    const ASSET_ID = '123e4567-e89b-12d3-a456-426614174000';

    it('should return a signed download url for an authorised caller', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'COUNSELOR');
      (mediaService.getAssetDownloadUrl as any).mockResolvedValue({
        url: 'https://mocked-s3-url.com/file',
        expires_in: 900,
      });

      const res = await request(app)
        .get(`/api/media/${ASSET_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('url');
      expect(mediaService.getAssetDownloadUrl).toHaveBeenCalledWith(
        'tenant-123',
        ASSET_ID,
        'user-123',
        expect.anything(),
      );
    });

    it('should require media_assets:read permission', async () => {
      // BOARD_MEMBER is denied media_assets:read in the permission matrix.
      const token = generateTestToken('tenant-123', 'user-123', 'BOARD_MEMBER');

      const res = await request(app)
        .get(`/api/media/${ASSET_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(mediaService.getAssetDownloadUrl).not.toHaveBeenCalled();
    });

    it('should reject an unknown role outright', async () => {
      const token = generateTestToken('tenant-123', 'user-123', 'NOT_A_ROLE');

      const res = await request(app)
        .get(`/api/media/${ASSET_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(mediaService.getAssetDownloadUrl).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/media/${ASSET_ID}`);
      expect(res.status).toBe(401);
    });
  });
});
