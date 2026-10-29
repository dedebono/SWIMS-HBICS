import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the services BEFORE app is imported (routes do `import * as service`)
vi.mock('../../services/staff-booking.service.js', () => ({
  listCounselorAvailability: vi.fn(),
  verifyNik: vi.fn(),
  bookStaffCounseling: vi.fn(),
}));

vi.mock('../../services/employee-counseling-booking.service.js', () => ({
  verifyIdentityForCombined: vi.fn(),
  submitCombinedIntake: vi.fn(),
}));

import { app } from '../../index.js';
import { pool } from '../../db/pool.js';
import {
  listCounselorAvailability,
  verifyNik,
  bookStaffCounseling,
} from '../../services/staff-booking.service.js';
import {
  verifyIdentityForCombined,
  submitCombinedIntake,
} from '../../services/employee-counseling-booking.service.js';

const BASE = '/api/counseling-booking';

/** Minimal body that passes EmployeeCounselingSubmissionSchema in @swims/shared. */
function validSubmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employee_name: 'Budi Santoso',
    unit: 'Keuangan',
    position: 'Staf Administrasi',
    contact_number: '081234567890',
    answers: {
      q1_alasan: ['stres_kerja'],
      q2_deskripsi: 'Beban kerja tinggi belakangan ini.',
      q3_durasi: 'kurang_dari_1_bulan',
      q4_dampak: 3,
      q5_area_terdampak: ['pekerjaan'],
      q6_harapan: ['konseling'],
      q7_pernah_konseling: 'belum_pernah',
      q8_safety_threat: 'tidak',
      q9_bantuan_segera: 'tidak',
      e_waktu: ['jam_kerja'],
      e_hari: 'Senin',
      e_metode: 'tatap_muka',
      e_konselor_preferensi: 'tanpa_preferensi',
    },
    consents: {
      consent_confidentiality: true,
      consent_emergency_protocol: true,
    },
    ...overrides,
  };
}

describe('Counseling Booking Routes (public, tenant-by-slug)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock tenant resolution for setTenantFromSlug (?t=<slug> or body.tenant)
    (pool.query as any).mockImplementation((queryStr: string) => {
      if (queryStr.includes('FROM tenants WHERE slug')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      if (queryStr.includes('SELECT tenant_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ tenant_id: 'tenant-123' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  describe('GET /api/counseling-booking/booking/config', () => {
    it('should return counselor availability for the tenant resolved from ?t=', async () => {
      const availability = [
        { slot_id: 'slot-1', counselor_name: 'Dr. Sari', day: 'Monday' },
      ];
      (listCounselorAvailability as any).mockResolvedValue(availability);

      const res = await request(app)
        .get(`${BASE}/booking/config`)
        .query({ t: 'sekolah-contoh' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(availability);
      expect(listCounselorAvailability).toHaveBeenCalledWith('tenant-123');
    });

    it('should fail when the tenant slug is missing', async () => {
      const res = await request(app).get(`${BASE}/booking/config`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(listCounselorAvailability).not.toHaveBeenCalled();
    });

    it('should fail when the tenant slug is unknown', async () => {
      (pool.query as any).mockImplementation(() =>
        Promise.resolve({ rows: [], rowCount: 0 }),
      );

      const res = await request(app)
        .get(`${BASE}/booking/config`)
        .query({ t: 'tidak-ada' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(listCounselorAvailability).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/counseling-booking/booking/verify', () => {
    it('should verify a NIK for the tenant from body.tenant', async () => {
      (verifyNik as any).mockResolvedValue({ found: true, full_name: 'Budi Santoso' });

      const res = await request(app)
        .post(`${BASE}/booking/verify`)
        .send({ tenant: 'sekolah-contoh', nik: '3175010101900001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.found).toBe(true);
      expect(verifyNik).toHaveBeenCalledWith('tenant-123', '3175010101900001');
    });
  });

  describe('POST /api/counseling-booking/booking/submit', () => {
    it('should create a booking and return 201', async () => {
      const booking = { appointment_id: 'appt-1', slot_id: 'slot-1' };
      (bookStaffCounseling as any).mockResolvedValue(booking);

      const res = await request(app)
        .post(`${BASE}/booking/submit`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          full_name: 'Budi Santoso',
          gender: 'L',
          slot_id: 'slot-1',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(booking);
      expect(bookStaffCounseling).toHaveBeenCalledWith('tenant-123', {
        nik: '3175010101900001',
        full_name: 'Budi Santoso',
        gender: 'L',
        slot_id: 'slot-1',
      });
    });

    it('should map a service conflict (409) to a bare {message} body', async () => {
      const err = Object.assign(new Error('Slot sudah penuh'), { statusCode: 409 });
      (bookStaffCounseling as any).mockRejectedValue(err);

      const res = await request(app)
        .post(`${BASE}/booking/submit`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          full_name: 'Budi Santoso',
          gender: 'L',
          slot_id: 'slot-1',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Slot sudah penuh');
    });

    it('should map a service validation error (422) to a bare {message} body', async () => {
      const err = Object.assign(new Error('NIK tidak dikenal'), { statusCode: 422 });
      (bookStaffCounseling as any).mockRejectedValue(err);

      const res = await request(app)
        .post(`${BASE}/booking/submit`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '0000',
          full_name: 'Budi Santoso',
          gender: 'L',
          slot_id: 'slot-1',
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toBe('NIK tidak dikenal');
    });

    it('should rethrow unmapped service errors as 500', async () => {
      (bookStaffCounseling as any).mockRejectedValue(new Error('db down'));

      const res = await request(app)
        .post(`${BASE}/booking/submit`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          full_name: 'Budi Santoso',
          gender: 'L',
          slot_id: 'slot-1',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/counseling-booking/booking/verify-identity', () => {
    it('should return the pre-fill identity record from the combined service', async () => {
      const identity = {
        found: true,
        full_name: 'Budi Santoso',
        unit: 'Keuangan',
        has_open_intake: false,
      };
      (verifyIdentityForCombined as any).mockResolvedValue(identity);

      const res = await request(app)
        .post(`${BASE}/booking/verify-identity`)
        .send({ tenant: 'sekolah-contoh', nik: '3175010101900001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.has_open_intake).toBe(false);
      expect(verifyIdentityForCombined).toHaveBeenCalledWith('tenant-123', '3175010101900001');
    });
  });

  describe('POST /api/counseling-booking/booking/submit-combined', () => {
    it('should create appointment + intake in one call and return 201', async () => {
      const result = { appointment_id: 'appt-1', submission_id: 'sub-1' };
      (submitCombinedIntake as any).mockResolvedValue(result);

      const res = await request(app)
        .post(`${BASE}/booking/submit-combined`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          slot_id: 'slot-1',
          ...validSubmission(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(result);
      // Parsed questionnaire + the two identity fields; body.tenant is stripped
      // by the Zod schema and must not leak into the service payload.
      const payload = (submitCombinedIntake as any).mock.calls[0][1];
      expect((submitCombinedIntake as any).mock.calls[0][0]).toBe('tenant-123');
      expect(payload.nik).toBe('3175010101900001');
      expect(payload.slot_id).toBe('slot-1');
      expect(payload.employee_name).toBe('Budi Santoso');
      expect(payload.tenant).toBeUndefined();
    });

    it('should return the standard 422 envelope for a missing NIK', async () => {
      const res = await request(app)
        .post(`${BASE}/booking/submit-combined`)
        .send({
          tenant: 'sekolah-contoh',
          slot_id: 'slot-1',
          ...validSubmission(),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('NIK wajib diisi untuk verifikasi identitas.');
      expect(submitCombinedIntake).not.toHaveBeenCalled();
    });

    it('should return the standard 422 envelope for a missing slot', async () => {
      const res = await request(app)
        .post(`${BASE}/booking/submit-combined`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          ...validSubmission(),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Silakan pilih jadwal konseling.');
      expect(submitCombinedIntake).not.toHaveBeenCalled();
    });

    it('should return the standard 422 envelope when the questionnaire fails Zod', async () => {
      const res = await request(app)
        .post(`${BASE}/booking/submit-combined`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          slot_id: 'slot-1',
          ...validSubmission({
            employee_name: '',
            consents: { consent_confidentiality: false, consent_emergency_protocol: true },
          }),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Data belum lengkap / tidak valid');
      expect(res.body.details).toBeDefined();
      expect(submitCombinedIntake).not.toHaveBeenCalled();
    });

    it('should map a service 400/404/409 to the {success,data,error} envelope', async () => {
      const err = Object.assign(new Error('Slot sudah dibooking'), { statusCode: 409 });
      (submitCombinedIntake as any).mockRejectedValue(err);

      const res = await request(app)
        .post(`${BASE}/booking/submit-combined`)
        .send({
          tenant: 'sekolah-contoh',
          nik: '3175010101900001',
          slot_id: 'slot-1',
          ...validSubmission(),
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBe('Slot sudah dibooking');
    });
  });
});
