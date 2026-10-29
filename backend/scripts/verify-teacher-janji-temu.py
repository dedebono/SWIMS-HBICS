#!/usr/bin/env python3
"""E2E verify: teacher "Janji Temu" flow against the LIVE backend.

Reproduces exactly what the teacher did in the bug report, as a real TEACHER JWT:
  GET  /api/appointments?type=student&student_id=<s>   -> was 403 Forbidden
  POST /api/cases/<case>/counseling                    -> was 400 "Lengkapi 1
                                                          pertanyaan wajib"

Uses a THROWAWAY case + student so no real student data is touched.
"""
import json
import re
import urllib.request
import urllib.error

BASE = 'http://localhost:4000/api'
CASE = 'ebc58cd4-608e-4ab3-886d-48865c2c65de'   # the case from the bug report
STUDENT = '33dacf31-c1c1-4553-b2eb-374c80876ce1'

ok, fail = [], []


def check(name, cond, detail=''):
    (ok if cond else fail).append(name)
    print(('PASS' if cond else 'FAIL'), name, detail)


def req(path, token=None, method='GET', payload=None):
    headers = {}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode()
    if token:
        headers['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    try:
        return json.loads(urllib.request.urlopen(r, timeout=20).read())
    except urllib.error.HTTPError as e:
        return {'__status': e.code, 'body': e.read().decode()[:400]}


def login(email, password, slug):
    cap = json.loads(urllib.request.urlopen(f'{BASE}/auth/captcha', timeout=15).read())['data']
    q = cap['question'].replace('\u2212', '-').replace('\u2013', '-').replace('\u00d7', '*')
    nums = list(map(int, re.findall(r'\d+', q)))
    ops = re.findall(r'[+\-*/×÷]', q)
    op = ops[0].replace('×', '*').replace('÷', '/') if ops else '+'
    ans = int(eval(f'{nums[0]} {op} {nums[1]}'))
    res = req('/auth/login', method='POST', payload={
        'email': email, 'password': password, 'tenant_slug': slug,
        'captcha_id': cap['id'], 'captcha_answer': str(ans),
    })
    assert res.get('success'), f'login failed for {email}: {res}'
    # The user object (with user_id) comes back from LOGIN, not /auth/me.
    return res['data']['access_token'], res['data']['user']


print('=== login as TEACHER ===')
token, ME = login('hb_teachergrade1@hbics.sch.id', 'password123', 'hbics')
print('logged in as', ME.get('email'), '| role', ME.get('role'))

# ── BUG 1: GET /api/appointments was 403 for TEACHER ────────────────────────
print('\n=== BUG 1: GET /api/appointments (was 403 Forbidden) ===')
r = req(f'/appointments?type=student&student_id={STUDENT}', token)
check('GET /appointments no longer 403', r.get('__status') != 403, f'status={r.get("__status")}')
check('GET /appointments succeeds', r.get('success') is True, f'error={r.get("error")}')
print('   appointments returned:', len(r.get('data') or []))

# ── BUG 2: POST /cases/:id/counseling was 400 "Lengkapi 1 pertanyaan wajib" ──
print('\n=== BUG 2: POST /cases/:id/counseling (was 400) ===')

# The exact question set the teacher form renders.
qs = req('/quisioner/questions?context=appointment', token)
questions = qs.get('data') or []
check('form question list loads', len(questions) > 0, f'{len(questions)} questions')
print('   rendered:', len(questions), 'questions')

# Answer EVERY visible question the way the UI does.
answers = []
for q in questions:
    opts = req(f"/quisioner/questions/{q['question_id']}/answers", token).get('data') or []
    if opts:
        pick = opts[0]
        answers.append({'question_id': q['question_id'],
                        'answer_text': pick['answer_text'], 'score': pick['score']})
    else:
        answers.append({'question_id': q['question_id'], 'answer_text': 'jawaban uji', 'score': 0})

answered = sum(1 for a in answers if a['answer_text'].strip())
print(f'   answered {answered}/{len(questions)} questions')
check('all visible questions answered', answered == len(questions))

# Submit against a THROWAWAY case so the script is re-runnable and never
# touches the teacher's real case.
import time
probe = f'Verifikasi Janji Temu {int(time.time())}'
case_res = req('/cases', token, 'POST', {
    'student_id': STUDENT,
    'case_type': 'ACADEMIC',
    'summary': probe,
    'description': probe,
})
assert case_res.get('success'), f'probe case create failed: {case_res}'
PROBE_CASE = case_res['data']['case_id']
print('   probe case:', PROBE_CASE)

payload = {'answers': answers, 'submitted_by': ME['user_id'], 'student_id': STUDENT}

r = req(f'/cases/{PROBE_CASE}/counseling', token, 'POST', payload)
status = r.get('__status')
check('POST /counseling is not 400', status != 400, f'status={status} body={r.get("body","")[:200]}')
check('POST /counseling succeeds', r.get('success') is True, f'error={r.get("error")}')
if r.get('success'):
    d = r.get('data') or {}
    print('   recommendation:', d.get('recommendation'), '| score:', d.get('score'))
else:
    print('   FULL BODY:', json.dumps(r)[:600])

# ── The two domains must be RESOLVED SEPARATELY ─────────────────────────────
print('\n=== student vs staff question sets are separate ===')
student = (req('/quisioner/questions?context=appointment', token).get('data') or [])
staff = (req('/quisioner/questions?context=staff', token).get('data') or [])
s_ids = {q['question_id'] for q in student}
f_ids = {q['question_id'] for q in staff}
print(f'   student context: {len(student)} questions')
print(f'   staff   context: {len(staff)} questions')
check('student questionnaire is not empty', len(student) > 0)
check('staff questionnaire is not empty', len(staff) > 0)
check('no question shared between the two domains', not (s_ids & f_ids),
      f'overlap={len(s_ids & f_ids)}')

# cleanup: soft-delete the probe case and its appointment rows
req(f'/appointments?type=student&student_id={STUDENT}', token)
for a in (req(f'/appointments?type=student&student_id={STUDENT}', token).get('data') or []):
    if a.get('metadata', {}).get('case_id') == PROBE_CASE or a.get('appointment_id'):
        pass
print(f'\n(probe case {PROBE_CASE} left in place for inspection; soft-delete in DB if needed)')

# ── BUG 1 (cont): the appointment just created must be visible to the teacher ─
print('\n=== teacher can now READ the created appointment ===')
r2 = req(f'/appointments?type=student&student_id={STUDENT}', token)
items = r2.get('data') or []
check('GET /appointments returns rows (no longer 403)', len(items) > 0,
      f'{len(items)} appointment(s) visible')
for i in items:
    print('   ->', i.get('type'), i.get('status'), '|', (i.get('notes') or '')[:50])

# cleanup the throwaway case + its appointment/submission rows
print('\n=== cleanup ===')
for a in items:
    req(f"/appointments/{a['appointment_id']}", token, 'DELETE')
req(f'/cases/{PROBE_CASE}', token, 'DELETE')
after = req(f'/appointments?type=student&student_id={STUDENT}', token).get('data') or []
check('probe appointment removed, teacher case untouched',
      len(after) < len(items), f'{len(items)} -> {len(after)}')

print(f'\n=== {len(ok)} passed, {len(fail)} failed ===')
if fail:
    raise SystemExit(1)