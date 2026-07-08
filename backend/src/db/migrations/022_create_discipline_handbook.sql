-- ============================================================================
-- SWIMS Database Schema — 022: Discipline Handbook (Buku Pedoman Disiplin)
-- Database-driven discipline handbook replacing static file uploads
-- ============================================================================

-- 1. Master Kategori (categories)
-- Menyimpan 4 tingkatan utama pelanggaran
CREATE TABLE discipline_categories (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(50) NOT NULL,
  general_description   TEXT,
  impact_victim         TEXT,
  impact_perpetrator    TEXT,
  impact_school        TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_categories IS '4 tingkat pelanggaran: Sangat Berat, Berat, Sedang, Ringan';
COMMENT ON COLUMN discipline_categories.impact_victim IS 'Dampak bagi korban pelanggaran';
COMMENT ON COLUMN discipline_categories.impact_perpetrator IS 'Dampak bagi pelaku pelanggaran';
COMMENT ON COLUMN discipline_categories.impact_school IS 'Dampak bagi lingkungan sekolah';

-- 2. Master Jenjang (education_levels)
-- Daftar jenjang sekolah
CREATE TABLE discipline_education_levels (
  id      SERIAL PRIMARY KEY,
  code    VARCHAR(10) NOT NULL UNIQUE,
  name    VARCHAR(50) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_education_levels IS 'Jenjang: TK, SD, SMP, SMA';
COMMENT ON COLUMN discipline_education_levels.code IS 'Kode singkat: TK, SD, SMP, SMA';
COMMENT ON COLUMN discipline_education_levels.name IS 'Nama lengkap: Taman Kanak-Kanak, Sekolah Dasar, dst';
COMMENT ON COLUMN discipline_education_levels.sort_order IS 'Urutan tampilan';

-- 3. Kelompok Perilaku (behavior_groups)
-- Mengelompokkan pelanggaran agar mudah dibaca per bab
CREATE TABLE discipline_behavior_groups (
  id              SERIAL PRIMARY KEY,
  category_id     INT NOT NULL REFERENCES discipline_categories(id) ON DELETE CASCADE,
  group_name      VARCHAR(100) NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_behavior_groups IS 'Pengelompokan pelanggaran per bab';
COMMENT ON COLUMN discipline_behavior_groups.category_id IS 'FK ke discipline_categories.id';

-- 4. Detail Perilaku Spesifik (behavior_details)
-- Teks butir pelanggaran konkret
CREATE TABLE discipline_behavior_details (
  id              SERIAL PRIMARY KEY,
  group_id        INT NOT NULL REFERENCES discipline_behavior_groups(id) ON DELETE CASCADE,
  behavior_text   TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_behavior_details IS 'Butir-butir pelanggaran spesifik';
COMMENT ON COLUMN discipline_behavior_details.behavior_text IS 'Contoh: "Mencekik leher seseorang dengan sengaja."';

-- 5. Jembatan Perilaku & Jenjang (behavior_level_pivot)
-- Mengatur perilaku mana berlaku untuk jenjang apa
CREATE TABLE discipline_behavior_levels (
  behavior_id  INT NOT NULL REFERENCES discipline_behavior_details(id) ON DELETE CASCADE,
  level_id     INT NOT NULL REFERENCES discipline_education_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (behavior_id, level_id)
);

COMMENT ON TABLE discipline_behavior_levels IS 'Pivot perilaku-jenjang: perilaku mana berlaku untuk jenjang mana';

-- 6. Panduan Tindak Lanjut / SOP (handling_guidelines)
-- SOP penanganan kasus per jenjang
CREATE TABLE discipline_handling_guidelines (
  id                SERIAL PRIMARY KEY,
  category_id       INT NOT NULL REFERENCES discipline_categories(id) ON DELETE CASCADE,
  level_id          INT NOT NULL REFERENCES discipline_education_levels(id) ON DELETE CASCADE,
  target_type       VARCHAR(50) NOT NULL CHECK (target_type IN ('Identifikasi Awal', 'Penanganan Pelaku', 'Penanganan Korban', 'Kolaborasi Orang Tua', 'Koordinasi')),
  step_number       INT NOT NULL,
  guideline_text     TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_handling_guidelines IS 'SOP penanganan per kategori dan jenjang';
COMMENT ON COLUMN discipline_handling_guidelines.target_type IS 'Tahap penanganan: Identifikasi, Pelaku, Korban, Orang Tua, Koordinasi';
COMMENT ON COLUMN discipline_handling_guidelines.step_number IS 'Urutan langkah (1, 2, 3, dst)';

-- 7. Panduan Konsekuensi (consequence_guidelines)
-- Sanksi/tugas pemulihan karakter per jenjang
CREATE TABLE discipline_consequence_guidelines (
  id                 SERIAL PRIMARY KEY,
  category_id        INT NOT NULL REFERENCES discipline_categories(id) ON DELETE CASCADE,
  level_id           INT NOT NULL REFERENCES discipline_education_levels(id) ON DELETE CASCADE,
  consequence_type   VARCHAR(100) NOT NULL,
  consequence_text   TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_consequence_guidelines IS 'Bentuk sanksi per kategori dan jenjang';
COMMENT ON COLUMN discipline_consequence_guidelines.consequence_type IS 'Contoh: Tugas Reflektif, Pembatasan Sementara, Konferensi Keluarga';
COMMENT ON COLUMN discipline_consequence_guidelines.consequence_text IS 'Detail sanksi spesifik per jenjang';

-- 8. Master Dokumen Administrasi (required_documents)
-- Berkas/template yang harus disiapkan guru
CREATE TABLE discipline_required_documents (
  id              SERIAL PRIMARY KEY,
  category_id     INT NOT NULL REFERENCES discipline_categories(id) ON DELETE CASCADE,
  level_id        INT NOT NULL REFERENCES discipline_education_levels(id) ON DELETE CASCADE,
  document_name   VARCHAR(100) NOT NULL,
  template_url    VARCHAR(255),
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE discipline_required_documents IS 'Daftar berkas administrasi per kategori dan jenjang';
COMMENT ON COLUMN discipline_required_documents.template_url IS 'Link unduh file Word/PDF';

-- Indexes untuk pencarian cepat
CREATE INDEX idx_behavior_groups_category ON discipline_behavior_groups(category_id);
CREATE INDEX idx_behavior_details_group ON discipline_behavior_details(group_id);
CREATE INDEX idx_behavior_details_search ON discipline_behavior_details USING gin(to_tsvector('indonesian', behavior_text));
CREATE INDEX idx_handling_guidelines_category_level ON discipline_handling_guidelines(category_id, level_id);
CREATE INDEX idx_consequence_guidelines_category_level ON discipline_consequence_guidelines(category_id, level_id);
CREATE INDEX idx_required_documents_category_level ON discipline_required_documents(category_id, level_id);

-- Full-text search support untuk bahasa Indonesia
ALTER TABLE discipline_behavior_details ADD COLUMN search_vector tsvector 
  GENERATED ALWAYS AS (to_tsvector('indonesian', behavior_text)) STORED;
CREATE INDEX idx_behavior_details_search_gin ON discipline_behavior_details USING gin(search_vector);