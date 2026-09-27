import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryWithTenant } from '../../db/pool.js';
import { sendWhatsAppMessage } from '../notifications.service.js';
import { auditLog } from '../../utils/audit-log.js';

vi.mock('../../db/pool.js');
vi.mock('../../utils/audit-log.js');
vi.mock('../notifications.service.js');

const mockQuery = vi.fn();
vi.mocked(queryWithTenant).mockImplementation(mockQuery as any);
const mockSendWA = vi.fn().mockResolvedValue({ success: true });
vi.mocked(sendWhatsAppMessage).mockImplementation(mockSendWA);
vi.mocked(auditLog).mockResolvedValue(undefined as any);

// Re-import after mocks are set up
import * as svc from '../../services/psychologist-referral.service.js';

describe('psychologist-referral.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReferralToken', () => {
    it('should create a token and return it', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123' }],
      });

      const result = await svc.createReferralToken('tenant-1', {
        appointmentId: 'appt-1',
        studentId: 'student-1',
        parentPhone: '6281234567890',
        parentName: 'Budi',
        caseId: 'case-1',
        studentName: 'Ani',
      });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(36); // UUID format
      expect(result.tokenId).toBe('token-123');
    });
  });

  describe('recordParentChoice', () => {
    it('should update choice_status to school_psychologist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'school_psychologist' }],
      });

      const result = await svc.recordParentChoice('tenant-1', 'some-token', 'school_psychologist');
      expect(result.choice_status).toBe('school_psychologist');
    });

    it('should throw if token not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        svc.recordParentChoice('tenant-1', 'invalid-token', 'school_psychologist'),
      ).rejects.toThrow('Token tidak valid atau sudah expire');
    });

    it('should update choice_status to private_psychologist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'private_psychologist' }],
      });

      const result = await svc.recordParentChoice('tenant-1', 'some-token', 'private_psychologist');
      expect(result.choice_status).toBe('private_psychologist');
    });
  });

  describe('selectPsychologist', () => {
    it('should set psychologist and fetch payment_amount', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          token_id: 'token-123',
          choice_status: 'psychologist_selected',
          selected_psychologist_id: 'psych-1',
          payment_amount: 500000,
        }],
      });

      const result = await svc.selectPsychologist('tenant-1', 'some-token', 'psych-1');
      expect(result.choice_status).toBe('psychologist_selected');
      expect(result.selected_psychologist_id).toBe('psych-1');
      expect(result.payment_amount).toBe(500000);
    });

    it('should throw if token not found or wrong status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        svc.selectPsychologist('tenant-1', 'invalid-token', 'psych-1'),
      ).rejects.toThrow('Token tidak valid atau belum memilih psikolog sekolah');
    });
  });

  describe('setPaymentPending', () => {
    it('should set status to payment_pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'payment_pending' }],
      });

      const result = await svc.setPaymentPending('tenant-1', 'some-token');
      expect(result.choice_status).toBe('payment_pending');
    });
  });

  describe('confirmPayment', () => {
    it('should set status to payment_confirmed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'payment_confirmed', payment_confirmed_at: new Date().toISOString() }],
      });

      const result = await svc.confirmPayment('tenant-1', 'some-token', 'Transfer via BCA');
      expect(result.choice_status).toBe('payment_confirmed');
    });

    it('should throw if token not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        svc.confirmPayment('tenant-1', 'invalid-token'),
      ).rejects.toThrow('Token tidak valid atau status bukan payment_pending');
    });
  });

  describe('confirmSchedule', () => {
    it('should set status to schedule_confirmed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'schedule_confirmed', confirmed_at: new Date().toISOString() }],
      });

      const result = await svc.confirmSchedule('tenant-1', 'some-token');
      expect(result.choice_status).toBe('schedule_confirmed');
    });

    it('should throw if payment not confirmed yet', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        svc.confirmSchedule('tenant-1', 'invalid-token'),
      ).rejects.toThrow('Token tidak valid atau pembayaran belum dikonfirmasi');
    });
  });

  describe('sendReferralNotification', () => {
    it('should call sendWhatsAppMessage with correct payload', async () => {
      const result = await svc.sendReferralNotification(
        'tenant-1',
        '6281234567890',
        'Budi',
        'Ani',
        'https://app.example.com/quisioner/psychologist-referral?t=sekolah&token=abc',
      );

      expect(result.success).toBe(true);
      expect(mockSendWA).toHaveBeenCalledWith('tenant-1', {
        chatId: '6281234567890',
        text: expect.stringContaining('Ani'),
      });
    });
  });

  describe('listSchoolPsychologists', () => {
    it('should return list of active psychologists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { psychologist_id: 'p1', full_name: 'Dr. Sari', expertise: 'Anak', consultation_fee: 500000, is_active: true },
          { psychologist_id: 'p2', full_name: 'Dr. Budi', expertise: 'Emosional', consultation_fee: 450000, is_active: true },
        ],
      });

      const result = await svc.listSchoolPsychologists('tenant-1');
      expect(result).toHaveLength(2);
      expect(result[0].full_name).toBe('Dr. Sari');
    });
  });

  describe('getTokenRecord', () => {
    it('should return token record if found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ token_id: 'token-123', choice_status: 'pending' }],
      });

      const result = await svc.getTokenRecord('tenant-1', 'some-token');
      expect(result).toBeDefined();
      expect(result!.choice_status).toBe('pending');
    });

    it('should return null if token not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await svc.getTokenRecord('tenant-1', 'invalid-token');
      expect(result).toBeNull();
    });
  });
});
