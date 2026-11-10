"""Teacher-published IELTS writing tasks and grading.

Times are Asia/Shanghai. Tasks target grades and classes the same way
published exams do, so teacher tooling and student visibility stay aligned.
"""
from datetime import datetime
import base64
import json
import math
import re
import secrets
import sqlite3
from pathlib import Path

from exam_publish import (
    TZ, GRADES, CLASSES, OPEN_GRADES, audience_includes, parse_when, clock,
    student_visible, closing,
)
from writing_ai import grammar_marks

KINDS = {'task1': 150, 'task2': 250}
MAX_IMAGE = 12 * 1024 * 1024
MAX_TEXT = 24000
BANDS = [float(index) for index in range(0, 10)]

SCHEMA = (
    'CREATE TABLE IF NOT EXISTS writing_tasks ('
    'id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL, '
    'image_id TEXT, minutes INTEGER NOT NULL, grades TEXT NOT NULL, classes TEXT NOT NULL, '
    'start_at TEXT NOT NULL, end_at TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, '
    'cancelled INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS writing_files ('
    'id TEXT PRIMARY KEY, mime TEXT NOT NULL, body BLOB NOT NULL)',
    'CREATE TABLE IF NOT EXISTS writing_attempts ('
    'id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL DEFAULT "", '
    'word_count INTEGER NOT NULL DEFAULT 0, duration INTEGER NOT NULL DEFAULT 0, '
    'started_at TEXT, submitted_at TEXT, UNIQUE(task_id, user_id))',
    'CREATE TABLE IF NOT EXISTS writing_feedback ('
    'attempt_id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, overall REAL, ta REAL, cc REAL, lr REAL, gra REAL, '
    'comment TEXT NOT NULL DEFAULT "", annotations TEXT NOT NULL DEFAULT "[]", '
    'published INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS writing_attempts_task ON writing_attempts(task_id)',
    'CREATE INDEX IF NOT EXISTS writing_attempts_user ON writing_attempts(user_id)',
)


def connect(path):
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA busy_timeout=10000')
    for statement in SCHEMA:
        con.execute(statement)
    columns = {item[1] for item in con.execute('PRAGMA table_info(writing_tasks)')}
    if 'students' not in columns:
        con.execute("ALTER TABLE writing_tasks ADD COLUMN students TEXT NOT NULL DEFAULT '[]'")
        con.commit()
    return con


def count_words(text):
    return len(re.findall(r"[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*|[\u4e00-\u9fff]", str(text or '')))


def overall_band(ta, cc, lr, gra):
    if None in (ta, cc, lr, gra):
        return None
    mean = (float(ta) + float(cc) + float(lr) + float(gra)) / 4
    whole = math.floor(mean + 1e-9)
    rest = mean - whole
    if rest < 0.25 - 1e-9:
        value = float(whole)
    elif rest < 0.75 - 1e-9:
        value = float(whole) + 0.5
    else:
        value = float(whole) + 1
    return min(9.0, value)


def band(value):
    if value is None or value == '':
        return None
    try:
        raw = float(value)
    except (TypeError, ValueError):
        raise ValueError('分数无效')
    if abs(raw - round(raw)) > 1e-9:
        raise ValueError('小分需为 0 到 9 的整数')
    number = float(round(raw))
    if number not in BANDS:
        raise ValueError('小分需为 0 到 9 的整数')
    return number
    return number


def decode_image(raw):
    text = str(raw or '').strip()
    match = re.fullmatch(r'data:(image/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)', text, re.I)
    if not match:
        raise ValueError('请上传 JPG、PNG、WebP 或 GIF 图片')
    mime = match.group(1).lower().replace('image/jpg', 'image/jpeg')
    try:
        body = base64.b64decode(re.sub(r'\s+', '', match.group(2)), validate=True)
    except (ValueError, TypeError):
        raise ValueError('图片无法读取')
    if not body:
        raise ValueError('图片无法读取')
    if len(body) > MAX_IMAGE:
        raise ValueError('图片需小于 12 MB')
    return mime, body


def task_row(row):
    return dict(
        id=row['id'], title=row['title'], kind=row['kind'], prompt=row['prompt'],
        imageId=row['image_id'] or '', minutes=int(row['minutes']),
        grades=json.loads(row['grades']), classes=json.loads(row['classes']),
        students=json.loads(row['students'] or '[]'),
        startAt=row['start_at'], endAt=row['end_at'], cancelled=int(row['cancelled'] or 0),
        minWords=KINDS[row['kind']],
    )


def attempt_row(row, include_text=False):
    item = dict(
        id=row['id'], taskId=row['task_id'], userId=row['user_id'],
        wordCount=int(row['word_count'] or 0), duration=int(row['duration'] or 0),
        startedAt=row['started_at'], submittedAt=row['submitted_at'],
        submitted=bool(row['submitted_at']),
    )
    if include_text:
        item['text'] = row['text'] or ''
    return item


def feedback_row(row, include_draft=False):
    if not row:
        return None
    if not include_draft and not int(row['published'] or 0):
        return None
    return dict(
        overall=row['overall'], ta=row['ta'], cc=row['cc'], lr=row['lr'], gra=row['gra'],
        comment=row['comment'] or '', annotations=json.loads(row['annotations'] or '[]'),
        published=bool(int(row['published'] or 0)), updatedAt=row['updated_at'],
    )


def validate_task(body):
    if not isinstance(body, dict):
        raise ValueError('请求格式无效')
    kind = body.get('kind')
    if kind not in KINDS:
        raise ValueError('请选择小作文或大作文')
    title = str(body.get('title') or '').strip()[:80] or ('小作文 Task 1' if kind == 'task1' else '大作文 Task 2')
    prompt = str(body.get('prompt') or '').strip()
    if not 8 <= len(prompt) <= 8000:
        raise ValueError('题目需为 8～8000 字')
    try:
        minutes = int(body.get('minutes') or 0)
    except (TypeError, ValueError):
        raise ValueError('作答时间无效')
    if minutes < 5 or minutes > 120:
        raise ValueError('作答时间需为 5～120 分钟')
    grades = [item for item in body.get('grades') or [] if item in GRADES]
    students = [str(item) for item in body.get('students') or []
                if re.fullmatch(r'[0-9A-Za-z_.:-]{2,64}', str(item))][:600]
    if not grades and not students:
        raise ValueError('请选择年级或指定学生')
    classes = [str(item) for item in body.get('classes') or [] if str(item) in CLASSES]
    if any(grade in OPEN_GRADES for grade in grades):
        classes = []
    start, end = parse_when(body.get('start')), parse_when(body.get('end'))
    if end <= start:
        raise ValueError('结束时间必须晚于开始时间')
    return dict(
        title=title, kind=kind, prompt=prompt, minutes=minutes, grades=grades, classes=classes,
        students=students,
        start_at=clock(body.get('start')), end_at=clock(body.get('end')), image=body.get('image') or '',
    )


def validate_feedback(body):
    if not isinstance(body, dict):
        raise ValueError('请求格式无效')
    scores = {key: band(body.get(key)) for key in ('ta', 'cc', 'lr', 'gra')}
    scores['overall'] = overall_band(scores['ta'], scores['cc'], scores['lr'], scores['gra'])
    published = 1 if body.get('published') else 0
    if published and any(scores[key] is None for key in ('ta', 'cc', 'lr', 'gra')):
        raise ValueError('发给学生前请给齐 TA、CC、LR、GRA')
    comment = str(body.get('comment') or '').strip()
    if len(comment) > 8000:
        raise ValueError('评语过长')
    raw = body.get('annotations')
    annotations = []
    if raw is not None:
        if not isinstance(raw, list) or len(raw) > 300:
            raise ValueError('批注无效')
        for item in raw:
            if not isinstance(item, dict):
                continue
            kind = item.get('kind')
            if kind not in ('comment', 'replace', 'delete'):
                continue
            try:
                start, end = int(item.get('from')), int(item.get('to'))
            except (TypeError, ValueError):
                continue
            if start < 0 or end <= start:
                continue
            annotations.append(dict(
                kind=kind, **{'from': start, 'to': end},
                note=str(item.get('note') or '')[:500],
                replacement=str(item.get('replacement') or '')[:2000],
            ))
    return dict(scores=scores, comment=comment, annotations=annotations, published=published)


def install_writing(app, is_admin, user, data_dir):
    from flask import current_app, jsonify, request, Response

    path = Path(data_dir) / 'writing.sqlite3'

    def store():
        return closing(connect(path))

    def save_image(raw):
        if not raw:
            return ''
        mime, body = decode_image(raw)
        file_id = secrets.token_hex(8)
        with store() as con:
            con.execute('INSERT INTO writing_files VALUES(?,?,?)', (file_id, mime, body))
        return file_id

    def student_scope(task, current):
        chosen = task.get('students') or []
        if chosen:
            return str(current.get('id') or '') in chosen
        return audience_includes(task, current.get('grade') or '', current.get('class_name') or '')

    def task_for_student(con, task_id, current, include_cancelled=False):
        query = 'SELECT * FROM writing_tasks WHERE id=?'
        if not include_cancelled:
            query += ' AND cancelled=0'
        row = con.execute(query, (task_id,)).fetchone()
        if not row:
            return None, None
        task = task_row(row)
        if not student_scope(task, current):
            return None, None
        return row, task

    @app.get('/api/admin/writing')
    def writing_admin_list():
        if not is_admin():
            return jsonify(error='仅管理员可以查看'), 403
        with store() as con:
            rows = con.execute('SELECT * FROM writing_tasks ORDER BY start_at DESC').fetchall()
            submitted = {
                item['task_id']: int(item['n'])
                for item in con.execute(
                    'SELECT task_id, count(*) AS n FROM writing_attempts '
                    'WHERE submitted_at IS NOT NULL GROUP BY task_id'
                )
            }
            graded = {
                item['task_id']: int(item['n'])
                for item in con.execute(
                    'SELECT a.task_id, count(*) AS n FROM writing_attempts a '
                    'JOIN writing_feedback f ON f.attempt_id=a.id '
                    'WHERE a.submitted_at IS NOT NULL AND f.published=1 GROUP BY a.task_id'
                )
            }
        return jsonify(tasks=[
            dict(task_row(row), submitted=submitted.get(row['id'], 0), graded=graded.get(row['id'], 0))
            for row in rows
        ])

    @app.post('/api/admin/writing')
    def writing_admin_create():
        if not is_admin():
            return jsonify(error='仅管理员可以发布'), 403
        try:
            record = validate_task(request.get_json(silent=True) or {})
            image_id = save_image(record.pop('image'))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        task_id = secrets.token_hex(8)
        now = datetime.now(TZ).isoformat()
        with store() as con:
            con.execute(
                'INSERT INTO writing_tasks(id,title,kind,prompt,image_id,minutes,grades,classes,students,'
                'start_at,end_at,created_by,created_at,cancelled) '
                'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)',
                (task_id, record['title'], record['kind'], record['prompt'], image_id or None,
                 record['minutes'], json.dumps(record['grades'], ensure_ascii=False),
                 json.dumps(record['classes'], ensure_ascii=False),
                 json.dumps(record['students'], ensure_ascii=False),
                 record['start_at'], record['end_at'], user()['id'], now)
            )
        return jsonify(ok=True, id=task_id)

    @app.get('/api/admin/writing/students')
    def writing_admin_students():
        if not is_admin():
            return jsonify(error='仅管理员可以查看'), 403
        opener = current_app.config.get('EXAM_ACCOUNT_DB')
        items = []
        if opener:
            with opener() as accounts:
                for item in accounts.execute(
                    'SELECT u.id,u.name,p.grade,p.class_name FROM users u '
                    'LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.name_key'
                ):
                    items.append(dict(id=item['id'], name=item['name'] or item['id'],
                                      grade=item['grade'] or '', className=item['class_name'] or ''))
        return jsonify(students=items)

    @app.post('/api/admin/writing/cancel')
    def writing_admin_cancel():
        if not is_admin():
            return jsonify(error='仅管理员可以撤回'), 403
        task_id = str((request.get_json(silent=True) or {}).get('id') or '')
        with store() as con:
            changed = con.execute(
                'UPDATE writing_tasks SET cancelled=1 WHERE id=? AND cancelled=0', (task_id,)
            ).rowcount
        if not changed:
            return jsonify(error='任务不存在或已经撤回'), 404
        return jsonify(ok=True)

    @app.post('/api/admin/writing/delete')
    def writing_admin_delete():
        if not is_admin():
            return jsonify(error='仅管理员可以删除'), 403
        task_id = str((request.get_json(silent=True) or {}).get('id') or '')
        if not re.fullmatch(r'[0-9a-fA-F]{8,64}', task_id):
            return jsonify(error='任务不存在'), 404
        with store() as con:
            row = con.execute('SELECT image_id FROM writing_tasks WHERE id=?', (task_id,)).fetchone()
            changed = con.execute('DELETE FROM writing_tasks WHERE id=?', (task_id,)).rowcount
            if changed:
                con.execute(
                    'DELETE FROM writing_feedback WHERE attempt_id IN '
                    '(SELECT id FROM writing_attempts WHERE task_id=?)', (task_id,)
                )
                con.execute('DELETE FROM writing_attempts WHERE task_id=?', (task_id,))
                if row and row['image_id']:
                    con.execute('DELETE FROM writing_files WHERE id=?', (row['image_id'],))
        if not changed:
            return jsonify(error='任务不存在'), 404
        return jsonify(ok=True)

    @app.get('/api/admin/writing/attempts')
    def writing_admin_attempts():
        if not is_admin():
            return jsonify(error='仅管理员可以查看'), 403
        task_id = request.args.get('id') or ''
        with store() as con:
            task = con.execute('SELECT * FROM writing_tasks WHERE id=?', (task_id,)).fetchone()
            if not task:
                return jsonify(error='任务不存在'), 404
            rows = con.execute(
                'SELECT a.*, f.published AS f_published, f.overall AS f_overall '
                'FROM writing_attempts a LEFT JOIN writing_feedback f ON f.attempt_id=a.id '
                'WHERE a.task_id=? ORDER BY a.submitted_at IS NULL, a.submitted_at',
                (task_id,)
            ).fetchall()
        names = {}
        opener = current_app.config.get('EXAM_ACCOUNT_DB')
        ids = [row['user_id'] for row in rows]
        if opener and ids:
            marks = ','.join('?' for _ in ids)
            with opener() as accounts:
                for item in accounts.execute(
                    'SELECT u.id, u.name, p.grade, p.class_name FROM users u '
                    'LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id IN (%s)' % marks, ids
                ):
                    names[item['id']] = dict(name=item['name'], grade=item['grade'] or '', className=item['class_name'] or '')
        items = []
        for row in rows:
            item = attempt_row(row)
            person = names.get(row['user_id']) or {}
            item['name'] = person.get('name') or row['user_id']
            item['grade'] = person.get('grade') or ''
            item['className'] = person.get('className') or ''
            item['graded'] = bool(row['f_published'])
            item['overall'] = row['f_overall']
            items.append(item)
        return jsonify(task=task_row(task), attempts=items)

    @app.get('/api/admin/writing/attempt')
    def writing_admin_attempt():
        if not is_admin():
            return jsonify(error='仅管理员可以查看'), 403
        attempt_id = request.args.get('id') or ''
        with store() as con:
            row = con.execute('SELECT * FROM writing_attempts WHERE id=?', (attempt_id,)).fetchone()
            if not row:
                return jsonify(error='作答不存在'), 404
            task = con.execute('SELECT * FROM writing_tasks WHERE id=?', (row['task_id'],)).fetchone()
            mark = con.execute('SELECT * FROM writing_feedback WHERE attempt_id=?', (attempt_id,)).fetchone()
        return jsonify(task=task_row(task), attempt=attempt_row(row, True),
                       feedback=feedback_row(mark, True))

    @app.post('/api/admin/writing/feedback')
    def writing_admin_feedback():
        if not is_admin():
            return jsonify(error='仅管理员可以批改'), 403
        body = request.get_json(silent=True) or {}
        attempt_id = str(body.get('id') or '')
        try:
            payload = validate_feedback(body)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        now = datetime.now(TZ).isoformat()
        scores = payload['scores']
        with store() as con:
            row = con.execute(
                'SELECT id FROM writing_attempts WHERE id=? AND submitted_at IS NOT NULL', (attempt_id,)
            ).fetchone()
            if not row:
                return jsonify(error='作答不存在或尚未提交'), 404
            con.execute(
                'INSERT INTO writing_feedback(attempt_id,teacher_id,overall,ta,cc,lr,gra,comment,annotations,published,updated_at) '
                'VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(attempt_id) DO UPDATE SET '
                'teacher_id=excluded.teacher_id, overall=excluded.overall, ta=excluded.ta, cc=excluded.cc, '
                'lr=excluded.lr, gra=excluded.gra, comment=excluded.comment, annotations=excluded.annotations, '
                'published=excluded.published, updated_at=excluded.updated_at',
                (attempt_id, user()['id'], scores['overall'], scores['ta'], scores['cc'], scores['lr'],
                 scores['gra'], payload['comment'], json.dumps(payload['annotations'], ensure_ascii=False),
                 payload['published'], now)
            )
        return jsonify(ok=True, overall=scores['overall'])

    @app.post('/api/admin/writing/ai-grammar')
    def writing_admin_ai_grammar():
        if not is_admin():
            return jsonify(error='仅管理员可以使用'), 403
        body = request.get_json(silent=True) or {}
        attempt_id = str(body.get('id') or '')
        text = str(body.get('text') or '')
        if attempt_id:
            with store() as con:
                row = con.execute('SELECT text FROM writing_attempts WHERE id=?', (attempt_id,)).fetchone()
            if not row:
                return jsonify(error='作答不存在'), 404
            text = row['text'] or ''
        try:
            marks = grammar_marks(text)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except Exception:
            return jsonify(error='AI 批改暂时不可用，请稍后再试'), 500
        return jsonify(ok=True, annotations=marks, count=len(marks))

    @app.get('/api/writing/mine')
    def writing_mine():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        now = datetime.now(TZ)
        with store() as con:
            rows = con.execute('SELECT * FROM writing_tasks WHERE cancelled=0 ORDER BY start_at').fetchall()
            tasks = []
            for row in rows:
                task = task_row(row)
                if not student_scope(task, current) or not student_visible(task, now):
                    continue
                attempt = con.execute(
                    'SELECT * FROM writing_attempts WHERE task_id=? AND user_id=?',
                    (task['id'], current['id'])
                ).fetchone()
                mark = None
                if attempt:
                    mark = con.execute(
                        'SELECT * FROM writing_feedback WHERE attempt_id=?', (attempt['id'],)
                    ).fetchone()
                task['mine'] = dict(
                    submitted=bool(attempt and attempt['submitted_at']),
                    started=bool(attempt and attempt['started_at']),
                )
                task['feedback'] = feedback_row(mark)
                tasks.append(task)
        return jsonify(tasks=tasks, serverNow=now.isoformat())

    @app.get('/api/writing/history')
    def writing_history():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        with store() as con:
            rows = con.execute(
                'SELECT a.*, t.title, t.kind FROM writing_attempts a '
                'JOIN writing_tasks t ON t.id=a.task_id '
                'WHERE a.user_id=? AND a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC',
                (current['id'],)
            ).fetchall()
            items = []
            for row in rows:
                mark = con.execute(
                    'SELECT * FROM writing_feedback WHERE attempt_id=?', (row['id'],)
                ).fetchone()
                item = attempt_row(row)
                item['title'] = row['title']
                item['kind'] = row['kind']
                item['feedback'] = feedback_row(mark)
                items.append(item)
        return jsonify(items=items)

    @app.get('/api/writing/task')
    def writing_task():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        task_id = request.args.get('id') or ''
        review = request.args.get('review') == '1'
        now = datetime.now(TZ)
        with store() as con:
            row, task = task_for_student(con, task_id, current, include_cancelled=review)
            if not row:
                return jsonify(error='任务不存在或不在发布范围'), 404
            attempt = con.execute(
                'SELECT * FROM writing_attempts WHERE task_id=? AND user_id=?',
                (task_id, current['id'])
            ).fetchone()
            mark = None
            if attempt:
                mark = con.execute(
                    'SELECT * FROM writing_feedback WHERE attempt_id=?', (attempt['id'],)
                ).fetchone()
        if not review and parse_when(task['endAt']) < now and not (attempt and attempt['submitted_at']):
            return jsonify(error='任务已结束'), 403
        payload = dict(task)
        payload['mine'] = dict(
            submitted=bool(attempt and attempt['submitted_at']),
            started=bool(attempt and attempt['started_at']),
        )
        payload['feedback'] = feedback_row(mark)
        if attempt:
            payload['text'] = attempt['text'] or ''
            payload['wordCount'] = int(attempt['word_count'] or 0)
        return jsonify(task=payload, name=current.get('name') or '')

    @app.post('/api/writing/start')
    def writing_start():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        task_id = str((request.get_json(silent=True) or {}).get('id') or '')
        now = datetime.now(TZ)
        with store() as con:
            row, task = task_for_student(con, task_id, current)
            if not row:
                return jsonify(error='任务不存在或不在发布范围'), 404
            if parse_when(task['startAt']) > now:
                return jsonify(error='尚未开始'), 403
            if parse_when(task['endAt']) < now:
                return jsonify(error='任务已结束'), 403
            existing = con.execute(
                'SELECT * FROM writing_attempts WHERE task_id=? AND user_id=?',
                (task_id, current['id'])
            ).fetchone()
            if existing and existing['submitted_at']:
                return jsonify(error='已经提交'), 409
            if existing:
                return jsonify(ok=True, startedAt=existing['started_at'])
            started = now.isoformat()
            con.execute(
                'INSERT INTO writing_attempts(id,task_id,user_id,started_at) VALUES(?,?,?,?)',
                (secrets.token_hex(8), task_id, current['id'], started)
            )
        return jsonify(ok=True, startedAt=started)

    @app.post('/api/writing/save')
    def writing_save():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        body = request.get_json(silent=True) or {}
        task_id = str(body.get('id') or '')
        text = str(body.get('text') or '')
        if len(text) > MAX_TEXT:
            return jsonify(error='作文字数过多'), 400
        now = datetime.now(TZ)
        with store() as con:
            row, task = task_for_student(con, task_id, current)
            if not row:
                return jsonify(error='任务不存在或不在发布范围'), 404
            if not parse_when(task['startAt']) <= now <= parse_when(task['endAt']):
                return jsonify(error='现在不能保存'), 403
            existing = con.execute(
                'SELECT * FROM writing_attempts WHERE task_id=? AND user_id=?',
                (task_id, current['id'])
            ).fetchone()
            if existing and existing['submitted_at']:
                return jsonify(error='已经提交'), 409
            count = count_words(text)
            if existing:
                con.execute(
                    'UPDATE writing_attempts SET text=?, word_count=? WHERE id=?',
                    (text, count, existing['id'])
                )
            else:
                con.execute(
                    'INSERT INTO writing_attempts(id,task_id,user_id,text,word_count,started_at) '
                    'VALUES(?,?,?,?,?,?)',
                    (secrets.token_hex(8), task_id, current['id'], text, count, now.isoformat())
                )
        return jsonify(ok=True, wordCount=count)

    @app.post('/api/writing/submit')
    def writing_submit():
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        body = request.get_json(silent=True) or {}
        task_id = str(body.get('id') or '')
        text = str(body.get('text') or '')
        if len(text) > MAX_TEXT:
            return jsonify(error='作文字数过多'), 400
        now = datetime.now(TZ)
        with store() as con:
            row, task = task_for_student(con, task_id, current)
            if not row:
                return jsonify(error='任务不存在或不在发布范围'), 404
            if parse_when(task['startAt']) > now:
                return jsonify(error='尚未开始'), 403
            if parse_when(task['endAt']) < now:
                return jsonify(error='任务已结束'), 403
            existing = con.execute(
                'SELECT * FROM writing_attempts WHERE task_id=? AND user_id=?',
                (task_id, current['id'])
            ).fetchone()
            if existing and existing['submitted_at']:
                return jsonify(error='已经提交'), 409
            started = parse_when(existing['started_at']) if existing and existing['started_at'] else now
            duration = max(0, int((now - started).total_seconds()))
            count = count_words(text)
            if count <= 100:
                return jsonify(error='100 词以内不能提交'), 400
            if existing:
                con.execute(
                    'UPDATE writing_attempts SET text=?, word_count=?, duration=?, submitted_at=? WHERE id=?',
                    (text, count, duration, now.isoformat(), existing['id'])
                )
            else:
                con.execute(
                    'INSERT INTO writing_attempts(id,task_id,user_id,text,word_count,duration,started_at,submitted_at) '
                    'VALUES(?,?,?,?,?,?,?,?)',
                    (secrets.token_hex(8), task_id, current['id'], text, count, duration,
                     started.isoformat(), now.isoformat())
                )
        return jsonify(ok=True, wordCount=count)

    @app.get('/writing-image/<image_id>')
    def writing_image(image_id):
        current = user()
        if not current:
            return jsonify(error='请先登录'), 401
        if not re.fullmatch(r'[0-9a-fA-F]{8,32}', image_id):
            return jsonify(error='图片不存在'), 404
        with store() as con:
            row = con.execute('SELECT mime, body FROM writing_files WHERE id=?', (image_id,)).fetchone()
        if not row:
            return jsonify(error='图片不存在'), 404
        return Response(row['body'], mimetype=row['mime'],
                        headers={'Cache-Control': 'private, max-age=86400'})
