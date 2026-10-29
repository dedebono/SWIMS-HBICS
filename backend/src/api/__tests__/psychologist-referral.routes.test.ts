import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import * as svc from '../../services/psychologist-referral.service.js';
import { pool } from '../../db/pool.js';

vi.mock('../../services/psychologist-referral.service.js');

const mockGetTokenRecord = vi.mocked(svc.getTokenRecord);
const mockListSchoolPsychologists = vi.mocked(svc.listSchoolPsychologists);
const mockRecordParentChoice = vi.mocked(svc.recordParentChoice);
const mockSelectPsychologist = vi.mocked(svc.selectPsychologist);
const mockSetPaymentPending = vi.mocked(svc.setPaymentPending);
const mockConfirmPayment = vi.mocked(svc.confirmPayment);
const mockConfirmSchedule = vi.mocked(svc.confirmSchedule);

const validTokenRecord = {
  token_id: 't1', tenant_id: 'tenant-1', token: 'abc', choice_status: 'pending' as const,
  appointment_id: 'appt-1', student_id: 's1', parent_phone: '628',
  parent_name: null, token_expires_at: new Date(Date.now() + 86400000).toISOString(),
  selected_psychologist_id: null, payment_amount: null,
  payment_confirmed_at: null, payment_notes: null, confirmed_at: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Mock pool.query to resolve tenant for setTenantFromSlug middleware
  (pool.query as any).mockResolvedValue({
    rows: [{ tenant_id: 'tenant-1' }],
  });
});

describe('GET /api/public/psychologist-referral/psychologists', () => {
  it('should return 400 if token missing', async () => {
    const res = await request(app)
      .get('/api/public/psychologist-referral/psychologists?t=test-slug');
    expect(res.status).toBe(400);
  });

  it('should return 410 if token not found', async () => {
    mockGetTokenRecord.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/public/psychologist-referral/psychologists?t=test-slug&token=invalid');
    expect(res.status).toBe(410);
  });

  it('should return psychologists list with valid token', async () => {
    mockGetTokenRecord.mockResolvedValueOnce(validTokenRecord as any);
    mockListSchoolPsychologists.mockResolvedValueOnce([
      { psychologist_id: 'p1', tenant_id: 'tenant-1', full_name: 'Dr. Sari',
        expertise: 'Anak', photo_url: null, consultation_fee: 500000,
        is_active: true, created_at: '', updated_at: '' },
    ]);

    const res = await request(app)
      .get('/api/public/psychologist-referral/psychologists?t=test-slug&token=abc');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.psychologists).toHaveLength(1);
    expect(res.body.data.psychologists[0].full_name).toBe('Dr. Sari');
  });
});

describe('POST /api/public/psychologist-referral/choice', () => {
  it('should return 400 if token missing', async () => {
    const res = await request(app)
      .post('/api/public/psychologist-referral/choice?t=test-slug')
      .send({ choice: 'school_psychologist' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if choice invalid', async () => {
    const res = await request(app)
      .post('/api/public/psychologist-referral/choice?t=test-slug')
      .send({ token: 'abc', choice: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('should return 200 and update choice on valid school_psychologist', async () => {
    mockRecordParentChoice.mockResolvedValueOnce({ ...validTokenRecord, choice_status: 'school_psychologist' } as any);
    const res = await request(app)
      .post('/api/public/psychologist-referral/choice?t=test-slug')
      .send({ token: 'abc', choice: 'school_psychologist' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.choice_status).toBe('school_psychologist');
  });

  it('should return 200 and update choice on valid private_psychologist', async () => {
    mockRecordParentChoice.mockResolvedValueOnce({ ...validTokenRecord, choice_status: 'private_psychologist' } as any);
    const res = await request(app)
      .post('/api/public/psychologist-referral/choice?t=test-slug')
      .send({ token: 'abc', choice: 'private_psychologist' });
    expect(res.status).toBe(200);
    expect(res.body.data.choice_status).toBe('private_psychologist');
  });
});

describe('POST /api/public/psychologist-referral/select-psychologist', () => {
  it('should return 400 if token or psychologistId missing', async () => {
    const res = await request(app)
      .post('/api/public/psychologist-referral/select-psychologist?t=test-slug')
      .send({ token: 'abc' });
    expect(res.status).toBe(400);
  });

  it('should return 200 with selected psychologist', async () => {
    mockSelectPsychologist.mockResolvedValueOnce({
      ...validTokenRecord,
      choice_status: 'psychologist_selected',
      selected_psychologist_id: 'p1',
      payment_amount: 500000,
    } as any);
    const res = await request(app)
      .post('/api/public/psychologist-referral/select-psychologist?t=test-slug')
      .send({ token: 'abc', psychologistId: 'p1' });
    expect(res.status).toBe(200);
    expect(res.body.data.choice_status).toBe('psychologist_selected');
    expect(res.body.data.payment_amount).toBe(500000);
  });
});

describe('POST /api/public/psychologist-referral/confirm-payment', () => {
  it('should return 400 if token missing', async () => {
    const res = await request(app)
      .post('/api/public/psychologist-referral/confirm-payment?t=test-slug')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 200 when payment confirmed', async () => {
    mockConfirmPayment.mockResolvedValueOnce({
      ...validTokenRecord,
      choice_status: 'payment_confirmed',
      payment_confirmed_at: new Date().toISOString(),
    } as any);
    const res = await request(app)
      .post('/api/public/psychologist-referral/confirm-payment?t=test-slug')
      .send({ token: 'abc', notes: 'Transfer via BCA' });
    expect(res.status).toBe(200);
    expect(res.body.data.choice_status).toBe('payment_confirmed');
  });
});

describe('POST /api/public/psychologist-referral/confirm-schedule', () => {
  it('should return 400 if token missing', async () => {
    const res = await request(app)
      .post('/api/public/psychologist-referral/confirm-schedule?t=test-slug')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 200 when schedule confirmed', async () => {
    mockConfirmSchedule.mockResolvedValueOnce({
      ...validTokenRecord,
      choice_status: 'schedule_confirmed',
      confirmed_at: new Date().toISOString(),
    } as any);
    const res = await request(app)
      .post('/api/public/psychologist-referral/confirm-schedule?t=test-slug')
      .send({ token: 'abc', slot_id: 'slot-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.choice_status).toBe('schedule_confirmed');
  });
});
