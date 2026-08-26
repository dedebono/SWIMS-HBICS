-- 038: hubungkan pertanyaan & submission ke daftar pertanyaan.

ALTER TABLE quisioner_questions
  ADD COLUMN question_list_id UUID REFERENCES quisioner_question_lists(question_list_id) ON DELETE SET NULL;

ALTER TABLE staff_quisioner_submissions
  ADD COLUMN question_list_id UUID REFERENCES quisioner_question_lists(question_list_id) ON DELETE SET NULL;

-- Backfill pertanyaan yang sudah ada ke daftar default tenant masing-masing
UPDATE quisioner_questions q
SET question_list_id = (
  SELECT question_list_id
  FROM quisioner_question_lists l
  WHERE l.tenant_id = q.tenant_id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE q.question_list_id IS NULL;
