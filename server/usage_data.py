"""Optional maintenance metrics. No answers, passwords, IPs or cookies are collected."""
import atexit
import json
import os
import queue
import shutil
import sqlite3
import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import g, jsonify, request, send_from_directory
from teacher_data import day as practice_day, number

TZ = timezone(timedelta(hours=8))


class UsageCollector:
    def __init__(self, path):
        self.path = Path(path)
        self.queue = queue.Queue(maxsize=8192)
        self.lock = threading.Lock()
        self.thread = None
        self.pid = None
        self.dropped = 0
        self.failed = 0
        self.last_flush = 0
        self.enabled = True
        try:
            with self.connect(timeout=5) as con:
                con.executescript('''
                    PRAGMA journal_mode=WAL;
                    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
                    CREATE TABLE IF NOT EXISTS visitors(user_id TEXT PRIMARY KEY,first_seen REAL,last_seen REAL,registered_at REAL);
                    CREATE TABLE IF NOT EXISTS active_day(day TEXT,user_id TEXT,requests INTEGER DEFAULT 0,
                        PRIMARY KEY(day,user_id));
                    CREATE TABLE IF NOT EXISTS traffic(day TEXT,endpoint TEXT,requests INTEGER,errors INTEGER,
                        rejected INTEGER,latency_ms REAL,max_ms REAL,PRIMARY KEY(day,endpoint));
                    CREATE INDEX IF NOT EXISTS visitors_seen ON visitors(last_seen);
                ''')
                con.execute('INSERT OR IGNORE INTO meta VALUES(?,?)', ('started', str(time.time())))
        except Exception:
            self.enabled = False
        atexit.register(self.flush)

    @contextmanager
    def connect(self, timeout=0.2):
        con = sqlite3.connect(self.path, timeout=timeout)
        try:
            with con:
                yield con
        finally:
            con.close()

    def record(self, event):
        if not self.enabled:
            return
        try:
            with self.lock:
                if self.pid != os.getpid() or self.thread is None or not self.thread.is_alive():
                    self.pid = os.getpid()
                    self.thread = threading.Thread(target=self.run, daemon=True, name='usage-metrics')
                    self.thread.start()
            self.queue.put_nowait(event)
        except Exception:
            self.dropped += 1

    def run(self):
        while True:
            time.sleep(2)
            self.flush()

    def flush(self):
        events = []
        for _ in range(8192):
            try:
                events.append(self.queue.get_nowait())
            except queue.Empty:
                break
        if not events:
            return
        active = defaultdict(int)
        traffic = defaultdict(lambda: [0, 0, 0, 0., 0.])
        visitors = {}
        try:
            for stamp, uid, endpoint, status, latency, registered in events:
                date = datetime.fromtimestamp(stamp, TZ).date().isoformat()
                row = traffic[date, endpoint]
                row[0] += 1
                row[1] += status >= 500
                row[2] += 400 <= status < 500
                row[3] += latency
                row[4] = max(row[4], latency)
                if uid and status < 400:
                    active[date, uid] += 1
                    previous = visitors.get(uid)
                    visitors[uid] = (min(stamp, previous[0]) if previous else stamp,
                                     max(stamp, previous[1]) if previous else stamp,
                                     (previous[2] if previous else None) or (stamp if registered else None))
            with self.connect() as con:
                for uid, values in visitors.items():
                    con.execute('''INSERT INTO visitors VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
                        first_seen=min(first_seen,excluded.first_seen),last_seen=max(last_seen,excluded.last_seen),
                        registered_at=coalesce(registered_at,excluded.registered_at)''', (uid, *values))
                for (date, uid), count in active.items():
                    con.execute('''INSERT INTO active_day VALUES(?,?,?) ON CONFLICT(day,user_id)
                        DO UPDATE SET requests=requests+excluded.requests''', (date, uid, count))
                for (date, endpoint), values in traffic.items():
                    con.execute('''INSERT INTO traffic VALUES(?,?,?,?,?,?,?) ON CONFLICT(day,endpoint) DO UPDATE SET
                        requests=requests+excluded.requests,errors=errors+excluded.errors,
                        rejected=rejected+excluded.rejected,latency_ms=latency_ms+excluded.latency_ms,
                        max_ms=max(max_ms,excluded.max_ms)''', (date, endpoint, *values))
            self.last_flush = time.time()
        except Exception:
            # Metrics must never block or fail a business operation.
            self.failed += len(events)

    def snapshot(self, accounts, days=30):
        now = time.time()
        today = datetime.fromtimestamp(now, TZ).date()
        since = today - timedelta(days=days - 1)
        users = {row['id']: row['name'] for row in accounts}
        daily = { (since + timedelta(days=i)).isoformat(): dict(date=(since + timedelta(days=i)).isoformat(),
                  active=None, requests=None, errors=None, practice=0, learners=0) for i in range(days) }
        with self.connect() as con:
            started = float(con.execute("SELECT value FROM meta WHERE key='started'").fetchone()[0])
            started_day = datetime.fromtimestamp(started, TZ).date().isoformat()
            for date, row in daily.items():
                if date >= started_day:
                    row.update(active=0, requests=0, errors=0)
            activity = con.execute('SELECT day,user_id,requests FROM active_day WHERE day>=?', (since.isoformat(),)).fetchall()
            for date, uid, _ in activity:
                if uid in users and date in daily:
                    daily[date]['active'] = (daily[date]['active'] or 0) + 1
            rows = con.execute('SELECT * FROM traffic WHERE day>=?', (since.isoformat(),)).fetchall()
            endpoints = defaultdict(lambda: dict(requests=0, errors=0, rejected=0, latency=0, maximum=0))
            for date, endpoint, count, errors, rejected, latency, maximum in rows:
                if date in daily:
                    daily[date]['requests'] = (daily[date]['requests'] or 0) + count
                    daily[date]['errors'] = (daily[date]['errors'] or 0) + errors
                if date == today.isoformat():
                    item = endpoints[endpoint]
                    item['requests'] += count; item['errors'] += errors; item['rejected'] += rejected
                    item['latency'] += latency; item['maximum'] = max(item['maximum'], maximum)
            visitors = [r for r in con.execute('SELECT * FROM visitors') if r[0] in users]
            distinct = {n: len({uid for date, uid in con.execute('SELECT day,user_id FROM active_day WHERE day>=?',
                        ((today - timedelta(days=n-1)).isoformat(),)) if uid in users}) for n in (1, 7, 30)}
        learners = defaultdict(set)
        practice_by_user = {}
        total_practice = 0
        today_seconds = 0
        questions = correct = seconds = 0
        popular = defaultdict(int)
        for account in accounts:
            try:
                summaries = json.loads(account['summaries'] or '[]')
            except (TypeError, ValueError):
                summaries = []
            records = [entry.get('data') for entry in summaries if isinstance(entry, dict) and isinstance(entry.get('data'), dict)]
            practice_by_user[account['id']] = len(records)
            total_practice += len(records)
            for record in records:
                q = number(record.get('totalQuestions'))
                questions += q
                correct += min(q, number(record.get('correctAnswers')))
                seconds += number(record.get('duration'))
                title = str(record.get('title') or record.get('examId') or '未命名练习')[:200]
                popular[title] += 1
                date = practice_day(record)
                if date in daily:
                    daily[date]['practice'] += 1
                    learners[date].add(account['id'])
                if date == today.isoformat(): today_seconds += number(record.get('duration'))
        for date, ids in learners.items(): daily[date]['learners'] = len(ids)
        midnight = datetime.combine(today, datetime.min.time(), TZ).timestamp()
        today_requests = {uid: count for date, uid, count in activity if date == today.isoformat()}
        totals = dict(users=len(users), dau=distinct[1], wau=distinct[7], mau=distinct[30],
                      online=sum(r[2] >= now-300 for r in visitors),
                      newUsers=sum(bool(r[3] and r[3] >= midnight) for r in visitors),
                      practice=total_practice, todayPractice=daily[today.isoformat()]['practice'],
                      todayLearners=daily[today.isoformat()]['learners'], todayHours=round(today_seconds/3600, 2),
                      requests=sum(r['requests'] for r in endpoints.values()),
                      errors=sum(r['errors'] for r in endpoints.values()),
                      rejected=sum(r['rejected'] for r in endpoints.values()))
        totals.update(practicedUsers=sum(v>0 for v in practice_by_user.values()),
                      questions=questions, correct=correct, studyHours=round(seconds/3600,2),
                      accuracy=round(correct/questions*100,1) if questions else None)
        latency = sum(r['latency'] for r in endpoints.values())
        totals['averageMs'] = round(latency/totals['requests'], 1) if totals['requests'] else 0
        last_seen = {row[0]: row[2] for row in visitors}
        roster = [dict(id=row['id'], name=row['name'], lastSeen=last_seen.get(row['id']),
                       practice=practice_by_user.get(row['id'], 0))
                  for row in sorted(accounts, key=lambda row: str(row['name']).casefold())]
        recent = [dict(id=uid, name=users[uid], lastSeen=last, todayRequests=today_requests.get(uid, 0),
                       practice=practice_by_user.get(uid, 0)) for uid, first, last, registered in sorted(visitors, key=lambda r:r[2], reverse=True)[:100]]
        endpoint_rows = [dict(name=name, requests=r['requests'], errors=r['errors'], rejected=r['rejected'],
                             averageMs=round(r['latency']/r['requests'], 1), maxMs=round(r['maximum'], 1))
                         for name,r in sorted(endpoints.items(), key=lambda pair:pair[1]['requests'], reverse=True)]
        return dict(generatedAt=now, startedAt=started, timezone='Asia/Shanghai', days=days, totals=totals,
                    popular=[dict(title=k,count=v) for k,v in sorted(popular.items(),key=lambda x:x[1],reverse=True)[:10]],
                    daily=list(daily.values()), users=recent, accounts=roster, endpoints=endpoint_rows, server=server_stats(),
                    collector=dict(enabled=self.enabled, pending=self.queue.qsize(), dropped=self.dropped,
                                   failed=self.failed, lastFlush=self.last_flush))


def server_stats():
    result = dict(cpuCount=os.cpu_count())
    try:
        result['load'] = list(os.getloadavg())
        mem = {line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if len(line.split())>=2 and line.split()[1].isdigit()}
        result.update(memoryTotal=mem['MemTotal'], memoryUsed=mem['MemTotal']-mem['MemAvailable'],
                      uptime=float(Path('/proc/uptime').read_text().split()[0]))
    except (OSError, AttributeError, KeyError, ValueError): pass
    try:
        disk=shutil.disk_usage(Path(__file__).parent)
        result.update(diskTotal=disk.total, diskUsed=disk.used)
    except OSError: pass
    return result


def ensure_username_reminders(con):
    con.execute('''CREATE TABLE IF NOT EXISTS username_reminders (
        user_id TEXT PRIMARY KEY, pending INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')


def install_usage(app, db, is_admin, data_dir, server_dir, user):
    with db() as con:
        ensure_username_reminders(con)
    collector = UsageCollector(Path(data_dir) / 'usage.sqlite3')
    app.extensions['usage_collector'] = collector
    cache = {}
    cache_lock = threading.Lock()

    @app.before_request
    def usage_clock():
        g.usage_started = time.monotonic()

    @app.after_request
    def observe_usage(response):
        try:
            path = request.path
            if path in ('/usedata', '/api/usage', '/api/status') or path.startswith('/api/admin/'):
                return response
            endpoint = path if path in ('/api/state', '/api/login', '/api/register', '/api/logout', '/api/access') else (
                'page' if path == '/' or path.endswith('.html') else None)
            if endpoint:
                current = getattr(g, 'current_user', None)
                uid = getattr(g, 'usage_user_id', None) or (current['id'] if current else None)
                started = getattr(g, 'usage_started', time.monotonic())
                collector.record((time.time(), uid, endpoint, response.status_code,
                                  max(0, (time.monotonic()-started)*1000), getattr(g, 'usage_registered', False)))
        except Exception:
            pass
        return response

    @app.get('/usedata')
    def usage_page():
        if not is_admin(): return '仅管理员可以访问维护统计。', 403
        return send_from_directory(server_dir, 'usedata.html')

    @app.get('/api/usage')
    def usage_api():
        if not is_admin(): return jsonify(error='仅管理员可以查看维护统计'), 403
        days = request.args.get('days', '30')
        if days not in ('7', '30', '90'): return jsonify(error='统计范围须为 7、30 或 90 天'), 400
        if not collector.enabled: return jsonify(error='统计模块暂不可用，练习功能不受影响'), 503
        try:
            with cache_lock:
                cached = cache.get(days)
                if cached and time.monotonic()-cached[0] < 10: return jsonify(cached[1])
                with db() as con:
                    ensure_username_reminders(con)
                    accounts = con.execute("SELECT u.id,u.name,json_extract(s.data,'$.practiceSummaries') AS summaries FROM users u LEFT JOIN states s ON s.user_id=u.id").fetchall()
                    pending = {row[0] for row in con.execute('SELECT user_id FROM username_reminders WHERE pending=1')}
                result = collector.snapshot(accounts, int(days))
                for item in (*result['users'], *result.get('accounts', [])):
                    item['reminder'] = item['id'] in pending
                cache[days] = (time.monotonic(), result)
            return jsonify(result)
        except Exception:
            app.logger.exception('Usage dashboard read failed')
            return jsonify(error='统计暂时读取失败，请稍后刷新'), 503

    @app.get('/api/admin/online')
    def teacher_online():
        if not is_admin(): return jsonify(error='仅管理员可以查看'), 403
        if not collector.enabled: return jsonify(error='在线统计暂不可用'), 503
        try:
            now = time.time()
            with collector.connect() as con:
                ids = [row[0] for row in con.execute(
                    'SELECT user_id FROM visitors WHERE last_seen>=?', (now - 300,))]
            response = jsonify(userIds=ids, windowSeconds=300, generatedAt=now)
            response.headers['Cache-Control'] = 'no-store'
            return response
        except sqlite3.Error:
            return jsonify(error='在线统计暂不可用'), 503

    @app.post('/api/usage/username-reminders')
    def remind_usernames():
        if not is_admin():
            return jsonify(error='仅管理员可以发送用户名提醒'), 403
        ids = request.json.get('userIds')
        if not isinstance(ids, list) or not 1 <= len(ids) <= 500 or any(not isinstance(item, str) or len(item) != 32 for item in ids):
            return jsonify(error='请先选择要提醒的账号'), 400
        with db() as con:
            ensure_username_reminders(con)
            found = [row[0] for row in con.execute(
                f"SELECT id FROM users WHERE id IN ({','.join('?' * len(ids))})", ids)]
            if not found:
                return jsonify(error='没有找到所选账号'), 400
            con.executemany('''INSERT INTO username_reminders(user_id,pending) VALUES(?,1)
                ON CONFLICT(user_id) DO UPDATE SET pending=1, updated_at=CURRENT_TIMESTAMP''',
                [(uid,) for uid in found])
        with cache_lock:
            cache.clear()
        return jsonify(ok=True, reminded=len(found))

    @app.route('/api/username-reminder', methods=['GET', 'POST'])
    def username_reminder():
        uid = user()['id']
        with db() as con:
            ensure_username_reminders(con)
            if request.method == 'POST' and request.json.get('action') == 'dismiss':
                con.execute('''INSERT INTO username_reminders(user_id,pending) VALUES(?,0)
                    ON CONFLICT(user_id) DO UPDATE SET pending=0, updated_at=CURRENT_TIMESTAMP''', (uid,))
            pending = con.execute('SELECT pending FROM username_reminders WHERE user_id=?', (uid,)).fetchone()
        if request.method == 'POST':
            with cache_lock:
                cache.clear()
        return jsonify(pending=bool(pending and pending[0]))
