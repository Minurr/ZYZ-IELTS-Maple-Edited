"""Teacher-published exams. Times are stored and compared in Asia/Shanghai."""
from datetime import datetime, timezone, timedelta
import json, re, sqlite3
from pathlib import Path
from teacher_data import detail_index, load_listening_type_map, _qkey

TZ = timezone(timedelta(hours=8))
GRADES = ('Pre', 'G10', 'G11', 'G12', 'English Dept.')
OPEN_GRADES = {'Pre', 'English Dept.'}
CLASSES = tuple(str(i) for i in range(1, 10))
READING_BAND = [(39, 9), (37, 8.5), (35, 8), (33, 7.5), (30, 7), (27, 6.5), (23, 6), (19, 5.5), (15, 5), (13, 4.5), (10, 4), (8, 3.5), (6, 3), (4, 2.5)]
LISTENING_BAND = [(39, 9), (37, 8.5), (35, 8), (32, 7.5), (30, 7), (26, 6.5), (23, 6), (18, 5.5), (16, 5), (13, 4.5), (10, 4), (8, 3.5), (6, 3), (4, 2.5)]

def connect(path):
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('CREATE TABLE IF NOT EXISTS published_exams (id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, mode TEXT NOT NULL, papers TEXT NOT NULL, grades TEXT NOT NULL, classes TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0)')
    return con

class closing:
    def __init__(self, con): self.con = con
    def __enter__(self): return self.con
    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type: self.con.rollback()
            else: self.con.commit()
        finally: self.con.close()

def papers_from_manifest(text, subject):
    found, seen = [], set()
    for match in re.finditer(r'"examId"\s*:\s*"([^"]+)"', text or ''):
        exam_id = match.group(1)
        if exam_id in seen: continue
        chunk = text[match.end():match.end() + 1500]
        title = re.search(r'"title"\s*:\s*"((?:\\.|[^"\\])*)"', chunk)
        category = re.search(r'"category"\s*:\s*"([^"]*)"', chunk)
        frequency = re.search(r'"frequency"\s*:\s*"([^"]*)"', chunk)
        difficulty = re.search(r'"difficultyScore"\s*:\s*([0-9]+(?:\.[0-9]+)?)', chunk)
        if not title: continue
        seen.add(exam_id)
        found.append(dict(id=exam_id, title=json.loads('"%s"' % title.group(1)), category=category.group(1) if category else '', frequency=frequency.group(1) if frequency else '', difficulty=float(difficulty.group(1)) if difficulty else None, subject=subject))
    return found

def load_catalog(root):
    root = Path(root)
    cached = getattr(load_catalog, '_cache', None)
    reading = root / 'assets' / 'generated' / 'reading-exams' / 'manifest.js'
    listening = root / 'assets' / 'generated' / 'listening-exams' / 'manifest.js'
    stamps = tuple(path.stat().st_mtime if path.exists() else 0 for path in (reading, listening))
    if cached and cached[0] == stamps: return cached[1]
    papers = []
    for path, subject in ((reading, 'reading'), (listening, 'listening')):
        try: text = path.read_text(encoding='utf-8')
        except OSError: text = ''
        papers.extend(papers_from_manifest(text, subject))
    load_catalog._cache = (stamps, papers)
    return papers

def parse_when(value):
    text = str(value or '').strip()
    if text.endswith('Z'): text = text[:-1] + '+00:00'
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', text):
        moment = datetime.fromisoformat(text).replace(tzinfo=TZ)
    else:
        moment = datetime.fromisoformat(text)
        if moment.tzinfo is None: moment = moment.replace(tzinfo=TZ)
    return moment.astimezone(TZ)

def clock(value):
    return parse_when(value).isoformat()

def band_for(subject, correct, total):
    if int(total) != 40: return dict(value=None, label='未满 40 题，不换算')
    table = LISTENING_BAND if subject == 'listening' else READING_BAND
    row = next((item for item in table if int(correct) >= item[0]), None)
    if not row: return dict(value=None, label='低于 2.5')
    return dict(value=row[1], label=('%.1f' % row[1]))

def student_visible(exam, now):
    start, end = parse_when(exam['startAt']), parse_when(exam['endAt'])
    return end >= now - timedelta(hours=4) and start <= now + timedelta(days=14)

def audience_includes(exam, grade, class_name):
    if grade not in exam['grades']: return False
    if grade in OPEN_GRADES: return True
    return not exam['classes'] or str(class_name or '') in exam['classes']

def part_number(category):
    match = re.search(r'P(\d+)', str(category or ''), re.I)
    return int(match.group(1)) if match else 0

def suite_parts(subject):
    return [1, 2, 3] if subject == 'reading' else [1, 2, 3, 4]

def full_suite(exam):
    count = len(exam.get('papers') or [])
    if exam.get('mode') != 'suite': return False
    return count == 3 if exam.get('subject') == 'reading' else count == 4

def validate_exam(body, known):
    if not isinstance(body, dict): raise ValueError('请求格式无效')
    subject = body.get('subject')
    mode = body.get('mode')
    if subject not in ('reading', 'listening'): raise ValueError('请选择阅读或听力')
    if mode not in ('passage', 'suite'): raise ValueError('请选择散篇或套题')
    raw = body.get('papers')
    if not isinstance(raw, list) or not raw: raise ValueError('请选择篇目')
    if mode == 'passage' and len(raw) != 1: raise ValueError('散篇只能选择一篇')
    papers, seen = [], set()
    for item in raw:
        exam_id = item.get('id') if isinstance(item, dict) else item
        exam_id = str(exam_id or '').strip()
        if exam_id not in known or exam_id in seen: raise ValueError('篇目无效')
        seen.add(exam_id)
        source = known[exam_id]
        if source['subject'] != subject: raise ValueError('一套考试只能是阅读或听力')
        papers.append(dict(id=exam_id, title=source['title'], part=part_number(source.get('category'))))
    if mode == 'suite':
        papers.sort(key=lambda item: item['part'])
        if [item['part'] for item in papers] != suite_parts(subject):
            raise ValueError('阅读套题要 Part 1、Part 2、Part 3 各选一篇' if subject == 'reading' else '听力套题要 Part 1 到 Part 4 各选一篇')
    grades = body.get('grades')
    if not isinstance(grades, list) or not grades or any(grade not in GRADES for grade in grades):
        raise ValueError('请选择年级')
    grades = list(dict.fromkeys(grades))
    classes = body.get('classes') if isinstance(body.get('classes'), list) else []
    classes = [str(item) for item in classes if str(item) in CLASSES]
    classes = list(dict.fromkeys(classes))
    if grades and set(grades) <= OPEN_GRADES: classes = []
    start, end = parse_when(body.get('start')), parse_when(body.get('end'))
    if end <= start: raise ValueError('结束时间要晚于开始时间')
    if end <= datetime.now(TZ): raise ValueError('结束时间要晚于现在')
    if end - start > timedelta(days=14): raise ValueError('一场考试最长 14 天')
    title = re.sub(r'\s+', ' ', str(body.get('title') or '')).strip()
    if not title: title = '、'.join(item['title'] for item in papers)
    title = title[:40]
    return dict(title=title, subject=subject, mode=mode, papers=papers, grades=grades, classes=classes, start_at=start.isoformat(), end_at=end.isoformat())

def row_exam(row):
    exam = dict(id=row['id'], title=row['title'], subject=row['subject'], mode=row['mode'], papers=json.loads(row['papers']), grades=json.loads(row['grades']), classes=json.loads(row['classes']), startAt=row['start_at'], endAt=row['end_at'], createdBy=row['created_by'], createdAt=row['created_at'], cancelled=bool(row['cancelled']))
    return exam

def record_moment(record):
    if not isinstance(record, dict): return None
    for key in ('completedAt', 'endTime', 'timestamp', 'date'):
        value = record.get(key)
        if not value: continue
        try:
            if isinstance(value, (int, float)):
                moment = datetime.fromtimestamp(value / 1000 if value > 100000000000 else value, TZ)
            else:
                moment = parse_when(value)
            return moment
        except (ValueError, TypeError, OverflowError, OSError):
            continue
    return None

def summary_records(raw):
    try: items = json.loads(raw or '[]')
    except (TypeError, json.JSONDecodeError): return []
    records = []
    for item in items if isinstance(items, list) else []:
        data = item.get('data') if isinstance(item, dict) and isinstance(item.get('data'), dict) else item
        if isinstance(data, dict): records.append(data)
    return records

def publication_of(record):
    meta = record.get('metadata') if isinstance(record.get('metadata'), dict) else {}
    return str(record.get('publishedExamId') or meta.get('publishedExamId') or '')

def latest_attempts(records, papers, start, end, listening_types=None, publication_id=None):
    wanted = {item['id'] for item in papers}
    publication_id = str(publication_id or '')
    grouped = {}
    for record in records:
        exam_id = str(record.get('examId') or '')
        if exam_id not in wanted: continue
        marked = publication_of(record)
        if publication_id and marked and marked != publication_id: continue
        moment = record_moment(record)
        if not moment or moment < start or moment > end: continue
        total = record.get('totalQuestions')
        correct = record.get('correctAnswers')
        try:
            total, correct = int(total), int(correct)
        except (TypeError, ValueError):
            continue
        if total <= 0 or correct < 0 or correct > total: continue
        grouped.setdefault(exam_id, []).append((moment, record, marked, correct, total))
    found = {}
    for exam_id, rows in grouped.items():
        if publication_id and any(row[2] == publication_id for row in rows):
            rows = [row for row in rows if row[2] == publication_id]
        moment, record, marked, correct, total = max(rows, key=lambda row: row[0])
        analytics = record.get('readingAnalytics') if isinstance(record.get('readingAnalytics'), dict) else {}
        typed = analytics.get('questionTypes') if isinstance(analytics.get('questionTypes'), dict) else {}
        if not typed and listening_types:
            question_map = listening_types.get(exam_id) or {}
            buckets = {}
            for qid, flag in (record.get('_answerFlags') or {}).items():
                name = question_map.get(_qkey(qid)) or '未标注题型'
                slot = buckets.setdefault(name, [0, 0])
                slot[1] += 1
                if isinstance(flag, dict) and flag.get('ok') is True: slot[0] += 1
            typed = {name: dict(earned=values[0], possible=values[1]) for name, values in buckets.items()}
        found[exam_id] = dict(at=moment, correct=correct, total=total, questionTypes=typed)
    return found

def student_result(exam, attempts):
    papers = exam['papers']
    done = [attempts[item['id']] for item in papers if item['id'] in attempts]
    status = [dict(id=item['id'], title=item['title'], part=item.get('part') or 0, submitted=item['id'] in attempts, correct=attempts.get(item['id'], {}).get('correct', 0), total=attempts.get(item['id'], {}).get('total', 0), questionTypes=attempts.get(item['id'], {}).get('questionTypes', {})) for item in papers]
    if not done: return dict(submitted=0, papers=len(papers), correct=0, total=0, accuracy=None, band=None, paperStatus=status)
    correct = sum(item['correct'] for item in done)
    total = sum(item['total'] for item in done)
    if exam.get('mode') == 'suite':
        band = band_for(exam['subject'], min(correct, 40), 40)
        accuracy = None
    else:
        band = None
        accuracy = round(correct * 100 / total, 1) if total else None
    return dict(submitted=len(done), papers=len(papers), correct=correct, total=total, accuracy=accuracy, band=band, paperStatus=status)

def class_targets(exam):
    targets = []
    for grade in exam['grades']:
        if grade in OPEN_GRADES: targets.append((grade, ''))
        else:
            classes = exam['classes'] or list(CLASSES)
            targets.extend((grade, name) for name in classes)
    return targets

def class_results(exam, people, listening_types=None):
    start, end = parse_when(exam['startAt']), parse_when(exam['endAt'])
    grouped = {key: [] for key in class_targets(exam)}
    for person in people:
        key = (person['grade'], '' if person['grade'] in OPEN_GRADES else str(person['className'] or ''))
        if key not in grouped: continue
        attempts = latest_attempts(person.get('records') or [], exam['papers'], start, end, listening_types, exam.get('id'))
        result = student_result(exam, attempts)
        grouped[key].append(dict(name=person['name'], **result))
    cards = []
    for grade, class_name in class_targets(exam):
        members = grouped[(grade, class_name)]
        submitted = [item for item in members if item['submitted']]
        correct = sum(item['correct'] for item in submitted)
        total = sum(item['total'] for item in submitted)
        bands = [item['band']['value'] for item in members if item.get('band') and item['band']['value'] is not None]
        label = grade if grade in OPEN_GRADES or not class_name else '%s · %s 班' % (grade, class_name)
        part_stats=[]
        for paper in exam['papers']:
            matching=[status for member in members for status in member['paperStatus'] if status['id']==paper['id'] and status['submitted']]
            typed={}
            for status in matching:
                for name,metrics in status['questionTypes'].items():
                    if not isinstance(metrics,dict): continue
                    try: earned=float(metrics.get('earned') or 0); possible=float(metrics.get('possible') or 0)
                    except (TypeError,ValueError): continue
                    if possible<=0: continue
                    bucket=typed.setdefault(str(name),[0,0]);bucket[0]+=max(0,min(earned,possible));bucket[1]+=possible
            earned=sum(status['correct'] for status in matching); possible=sum(status['total'] for status in matching)
            part_stats.append(dict(id=paper['id'],part=paper.get('part') or 0,title=paper['title'],submitted=len(matching),correct=earned,total=possible,accuracy=round(earned*100/possible,1) if possible else None,questionTypes=[dict(name=name,correct=values[0],total=values[1],accuracy=round(values[0]*100/values[1],1)) for name,values in sorted(typed.items())]))
        cards.append(dict(grade=grade, className=class_name, label=label, students=len(members), submitted=len(submitted), correct=correct, total=total, accuracy=round(correct * 100 / total, 1) if total else None, band=round(sum(bands) / len(bands), 1) if bands else None, banded=len(bands), partStats=part_stats, roster=sorted(members, key=lambda item: (item['submitted'] == 0, item['name']))))
    return cards

def install_exams(app, is_admin, user, data_dir, root, account_db):
    from flask import jsonify, request
    path = Path(data_dir) / 'exams.sqlite3'
    app.config['EXAM_ACCOUNT_DB'] = account_db
    def known():
        return {item['id']: item for item in load_catalog(root)}
    def public(exam, mine=None):
        return dict(id=exam['id'], title=exam['title'], subject=exam['subject'], mode=exam['mode'], papers=exam['papers'], grades=exam['grades'], classes=exam['classes'], startAt=exam['startAt'], endAt=exam['endAt'], cancelled=exam['cancelled'], mine=mine)
    @app.get('/api/admin/exams/catalog')
    def exam_catalog():
        if not is_admin(): return jsonify(error='仅管理员可以查看'), 403
        return jsonify(papers=load_catalog(root))
    @app.get('/api/admin/exams')
    def exam_list():
        if not is_admin(): return jsonify(error='仅管理员可以查看'), 403
        with closing(connect(path)) as con:
            rows = con.execute('SELECT * FROM published_exams ORDER BY start_at DESC').fetchall()
        return jsonify(exams=[public(row_exam(row)) for row in rows])
    @app.post('/api/admin/exams')
    def exam_create():
        if not is_admin(): return jsonify(error='仅管理员可以发布'), 403
        try: record = validate_exam(request.get_json(silent=True) or {}, known())
        except ValueError as error: return jsonify(error=str(error)), 400
        import secrets
        exam_id = secrets.token_hex(8)
        now = datetime.now(TZ).isoformat()
        with closing(connect(path)) as con:
            con.execute('INSERT INTO published_exams VALUES(?,?,?,?,?,?,?,?,?,?,?,0)', (exam_id, record['title'], record['subject'], record['mode'], json.dumps(record['papers'], ensure_ascii=False), json.dumps(record['grades'], ensure_ascii=False), json.dumps(record['classes'], ensure_ascii=False), record['start_at'], record['end_at'], user()['id'], now))
        return jsonify(ok=True, id=exam_id)
    @app.post('/api/admin/exams/cancel')
    def exam_cancel():
        if not is_admin(): return jsonify(error='仅管理员可以撤回'), 403
        exam_id = str((request.get_json(silent=True) or {}).get('id') or '')
        with closing(connect(path)) as con:
            changed = con.execute('UPDATE published_exams SET cancelled=1 WHERE id=? AND cancelled=0', (exam_id,)).rowcount
        if not changed: return jsonify(error='考试不存在或已经撤回'), 404
        return jsonify(ok=True)
    @app.post('/api/admin/exams/delete')
    def exam_delete():
        if not is_admin(): return jsonify(error='仅管理员可以删除'), 403
        exam_id = str((request.get_json(silent=True) or {}).get('id') or '')
        if not re.fullmatch(r'[0-9a-fA-F]{8,64}', exam_id): return jsonify(error='考试不存在'), 404
        with closing(connect(path)) as con:
            changed = con.execute('DELETE FROM published_exams WHERE id=?', (exam_id,)).rowcount
        if not changed: return jsonify(error='考试不存在'), 404
        return jsonify(ok=True)
    @app.get('/api/admin/exams/results')
    def exam_results():
        if not is_admin(): return jsonify(error='仅管理员可以查看'), 403
        exam_id = request.args.get('id') or ''
        with closing(connect(path)) as con:
            row = con.execute('SELECT * FROM published_exams WHERE id=?', (exam_id,)).fetchone()
        if not row: return jsonify(error='考试不存在'), 404
        exam = row_exam(row)
        marks = ','.join('?' for _ in exam['grades'])
        accounts = app.config.get('EXAM_ACCOUNT_DB')
        if accounts is None: return jsonify(error='成绩数据暂不可用'), 500
        with accounts() as con:
            rows = con.execute('SELECT u.id,u.name,p.grade,p.class_name,s.data AS state FROM profiles p JOIN users u ON u.id=p.user_id LEFT JOIN states s ON s.user_id=p.user_id WHERE p.school=? AND p.grade IN (%s)' % marks, ('sample_school', *exam['grades'])).fetchall()
        people = []
        for item in rows:
            if not audience_includes(exam, item['grade'], item['class_name']): continue
            try: state=json.loads(item['state'] or '{}')
            except (TypeError, json.JSONDecodeError): state={}
            records=summary_records(json.dumps(state.get('practiceSummaries') or []))
            if exam['subject']=='listening':
                flags=detail_index(state)
                for record in records:
                    record['_answerFlags']=flags.get(str(record.get('id') or ''), {})
            people.append(dict(name=item['name'], grade=item['grade'], className=item['class_name'] or '', records=records))
        types=load_listening_type_map(root) if exam['subject']=='listening' else None
        return jsonify(exam=public(exam), classes=class_results(exam, people, types))
    @app.get('/api/exams/mine')
    def exams_mine():
        current = user()
        if not current: return jsonify(error='请先登录'), 401
        grade, class_name = current.get('grade') or '', current.get('class_name') or ''
        with closing(connect(path)) as con:
            rows = [row_exam(row) for row in con.execute('SELECT * FROM published_exams WHERE cancelled=0 ORDER BY start_at').fetchall()]
        visible = [exam for exam in rows if audience_includes(exam, grade, class_name)]
        now = datetime.now(TZ)
        visible = [exam for exam in visible if student_visible(exam, now)]
        accounts = app.config.get('EXAM_ACCOUNT_DB')
        records = []
        if accounts is not None and visible:
            with accounts() as con:
                raw = con.execute('SELECT json_extract(data, \'$.practiceSummaries\') FROM states WHERE user_id=?', (current['id'],)).fetchone()
            records = summary_records(raw[0] if raw else None)
        items = []
        for exam in visible:
            attempts = latest_attempts(records, exam['papers'], parse_when(exam['startAt']), parse_when(exam['endAt']), publication_id=exam['id'])
            items.append(public(exam, student_result(exam, attempts)))
        return jsonify(exams=items, serverNow=now.isoformat())
