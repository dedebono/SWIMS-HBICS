-- ============================================================================
-- SWIMS — 052: In-app notifications (bel notifikasi per user)
--
-- Satu baris = satu notifikasi untuk SATU penerima (user_id). Fan-out ke
-- beberapa penerima dilakukan di aplikasi (notifyRoles / notifyCaseWatchers),
-- bukan lewat tabel recipient terpisah — volume per tenant (satu sekolah)
-- kecil, jadi duplikasi baris jauh lebih murah daripada join banyak-ke-banyak.
--
-- Siklus hidup:
--   aktif     : deleted_at IS NULL AND dismissed_at IS NULL  → tampil di inbox
--   ditutup   : dismissed_at IS NOT NULL (X pada baris)      → bagian "Ditutup",
--               masih bisa dibuka lagi (undismiss) atau dihapus permanen
--   dihapus   : deleted_at IS NOT NULL                       → hilang selamanya
--   dibaca    : is_read/read_at — hanya mengubah highlight & badge
-- ============================================================================

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- CASE_NEW | CASE_SHARED | CASE_PROGRESS | CHAT_NEW | COUNSELING_REQUEST |
  -- SCHEDULE_NEW | SCHEDULE_UPDATE | APPOINTMENT_REQUEST | SYSTEM_ERROR
  type            VARCHAR(64) NOT NULL,

  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  -- Path frontend tujuan saat notifikasi diklik, mis. /dashboard/cases/<id>
  link            VARCHAR(512),

  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Satu-satunya query panas: inbox per user, terbaru dulu. Partial index agar
-- baris yang sudah dihapus tidak pernah disentuh saat scan.
CREATE INDEX idx_notifications_inbox
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE deleted_at IS NULL;
