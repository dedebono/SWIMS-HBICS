import { describe, it, expect } from 'vitest';
import {
  parseSummarySections,
  mapPhaseToLevelId,
  mapRiskToCategoryId,
  sanitizeAiText,
  SUMMARY_SECTIONS,
} from '../ai-insights.service.js';

describe('parseSummarySections', () => {
  it('memecah blok AI per judul bagian', () => {
    const raw = `[AI-GENERATED SUMMARY]
APA YANG TERJADI
Siswa Ribu dengan teman di kelas.

YANG SUDAH DILAKUKAN
Guru sudah menasihati dan mencatat kejadian.

KOMUNIKASI
Orang tua sudah dihubungi lewat telepon dua kali.

SUDAH SAMPAI MANA
Kasus sedang dipantau, menunggu hasil minggu depan.

SARAN UNTUK GURU
- Lanjutkanconference dengan wali kelas.
- Catat tugas refleksi harian.
- Hubungi orang tua lagi minggu ini.`;

    const sections = parseSummarySections(raw);

    expect(sections.terjadi).toContain('Siswa Ribu');
    expect(sections.sudah_dilakukan).toContain('menasihati');
    expect(sections.komunikasi).toContain('telepon dua kali');
    expect(sections.posisi).toContain('dipantau');
    expect(sections.saran).toContain('wali kelas');
    // tidak ada teks yang bocor ke bagian berikutnya
    expect(sections.terjadi).not.toContain('SARAN');
    expect(sections.saran).not.toContain('APA YANG TERJADI');
  });

  it('menangani judul berformat markdown', () => {
    const raw = `## APA YANG TERJADI
Terjadi perkelahian.

**SARAN UNTUK GURU**
- Pisahkan keduanya.`;
    const sections = parseSummarySections(raw);
    expect(sections.terjadi).toBe('Terjadi perkelahian.');
    expect(sections.saran).toContain('Pisahkan keduanya');
  });

  it('membuang garis pemisah dan markdown yang bocor ke isi bagian', () => {
    const raw = `APA YANG TERJADI
Siswa **menyakiti** teman.

---

YANG SUDAH DILAKUKAN
 Guru menasihati.`;
    const sections = parseSummarySections(raw);
    expect(sections.terjadi).toBe('Siswa menyakiti teman.');
    expect(sections.terjadi).not.toContain('---');
    expect(sections.sudah_dilakukan).toBe('Guru menasihati.');
  });

  it('mengembalikan string kosong saat model tidak memakai marker', () => {
    const sections = parseSummarySections('Ringkasan bebas tanpa judul bagian.');
    expect(Object.values(sections).every((v) => v === '')).toBe(true);
  });

  it('menghasilkan kunci untuk seluruh bagian yang diminta', () => {
    expect(SUMMARY_SECTIONS.map((s) => s.key)).toEqual([
      'terjadi',
      'sudah_dilakukan',
      'komunikasi',
      'posisi',
      'saran',
    ]);
  });
});

describe('sanitizeAiText', () => {
  it('membuang huruf non-Latin yang menyelip di tengah kata', () => {
    expect(sanitizeAiText('kasus berjalan tanpa ter记录 penanganan')).toBe(
      'kasus berjalan tanpa ter penanganan',
    );
  });

  it('membuang huruf Mandarin, Cyrillic, dan Arab', () => {
    expect(sanitizeAiText('记录 guru 记录 ครู Привет عربي')).toBe('guru');
  });

  it('merapikan spasi ganda dan spasi sebelum tanda baca', () => {
    expect(sanitizeAiText('Siswa  ribut , lalu  guru  menasihati.')).toBe(
      'Siswa ribut, lalu guru menasihati.',
    );
  });

  it('tidak merusak Bahasa Indonesia dengan tanda baca & angka', () => {
    const asli = 'Rasio 1:2, risiko tinggi — 3 insiden (2 selesai), 94 hari.';
    expect(sanitizeAiText(asli)).toBe(asli);
  });
});

describe('mapPhaseToLevelId', () => {
  it('memetakan kelas SMP ke jenjang SMP-SMA', () => {
    expect(mapPhaseToLevelId('Grade 8')).toBe(3);
    expect(mapPhaseToLevelId('Kelas 7')).toBe(3);
  });

  it('memetakan kelas SD ke jenjang SD', () => {
    expect(mapPhaseToLevelId('Grade 3')).toBe(2);
  });

  it('memetakan TK ke jenjang KB-TK', () => {
    expect(mapPhaseToLevelId('TK')).toBe(1);
  });

  it('mengembalikan null untuk data yang tidak dikenali', () => {
    expect(mapPhaseToLevelId(null)).toBeNull();
    expect(mapPhaseToLevelId('')).toBeNull();
  });
});

describe('mapRiskToCategoryId', () => {
  it('memetakan tingkat risiko ke tingkat pelanggaran Buku Pedoman Disiplin', () => {
    expect(mapRiskToCategoryId('CRITICAL')).toBe(4);
    expect(mapRiskToCategoryId('HIGH')).toBe(3);
    expect(mapRiskToCategoryId('MEDIUM')).toBe(2);
    expect(mapRiskToCategoryId('LOW')).toBe(1);
    expect(mapRiskToCategoryId(undefined)).toBe(1);
  });
});