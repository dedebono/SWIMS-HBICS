-- Separate the two counseling domains: student counseling vs personal/staff
-- counseling. Fixes mis-tagged question lists that leaked a STAFF questionnaire
-- into the teacher's student flow.
--
-- Background (2026-10-22): the teacher "Janji Temu" tab returned
-- 400 "Lengkapi 1 pertanyaan wajib sebelum mengirim kuesioner" on a fully
-- completed form. Two causes, both fixed here and in code:
--
--  1. The list named "Staff" (id 3efff5ba, question "Apa yang anda alami?") was
--     tagged `["appointment_case"]` — a STUDENT target. Student validation ran
--     over every question row in the tenant, so this staff question was required
--     but never rendered on the teacher's form: impossible to answer.
--  2. The list "Pertamaan saja" (typo of "Pertanyaan saja", targets ["staff"],
--     ZERO questions) was the most recently updated staff-tagged list. Under the
--     old `ORDER BY updated_at DESC LIMIT 1` it resolved the whole STAFF domain
--     to an empty questionnaire.
--
-- Fix 1: retag the "Staff" list to the staff domain.
UPDATE quisioner_question_lists
SET targets = '["staff"]'::jsonb,
    updated_at = now()
WHERE deleted_at IS NULL
  AND name = 'Staff'
  AND targets ?| ARRAY['appointment_student', 'appointment_case']
  AND NOT (targets ?| ARRAY['staff']);

-- Fix 2: retire the empty scratch list so it can never win the staff domain
-- again. Soft delete (not hard) keeps its id resolvable for old submissions.
UPDATE quisioner_question_lists
SET is_active = false,
    updated_at = now()
WHERE deleted_at IS NULL
  AND is_active
  AND NOT EXISTS (
    SELECT 1 FROM quisioner_questions q
    WHERE q.question_list_id = quisioner_question_lists.question_list_id
      AND q.deleted_at IS NULL
  )
  AND targets ?| ARRAY['staff', 'appointment_student', 'appointment_case'];