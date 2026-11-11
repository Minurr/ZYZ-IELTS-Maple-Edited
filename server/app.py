import re

import hashlib

import gzip

import hmac

import json

import os

import secrets

import sqlite3

import time

from contextlib import contextmanager

from datetime import datetime, timedelta, timezone

from teacher_data import aggregate, day

from name_policy import blocked_display_text

from pathlib import Path



from flask import g, has_request_context, Flask, request, jsonify, make_response, send_from_directory, redirect

from itsdangerous import URLSafeTimedSerializer, BadSignature

from werkzeug.security import generate_password_hash, check_password_hash



ROOT = Path(__file__).resolve().parent.parent

DATA = Path(os.environ.get("IELTS_DATA", "/var/lib/ielts"))

DATA.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024

signer = URLSafeTimedSerializer(os.environ["IELTS_SECRET"])

SECURE = os.environ.get("IELTS_SECURE", "true") == "true"





@contextmanager

def db():

    con = sqlite3.connect(DATA / "accounts.sqlite3", timeout=20)

    con.row_factory = sqlite3.Row

    con.execute("PRAGMA busy_timeout=20000")

    con.execute("PRAGMA synchronous=NORMAL")

    try:

        with con:

            yield con

    finally:

        con.close()





with db() as con:

    con.executescript("""

    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL,

      name_key TEXT UNIQUE NOT NULL, password TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY, school TEXT NOT NULL,

      school_name TEXT NOT NULL, grade TEXT NOT NULL, class_name TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS states(user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS attempts(ip TEXT NOT NULL, stamp INTEGER NOT NULL);

    CREATE INDEX IF NOT EXISTS attempts_ip_stamp ON attempts(ip,stamp);

    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);

    """)





def school_profile(body):

    school = body.get('school')

    if school == 'sample_school':

        grade, classroom = body.get('grade'), body.get('className')

        if grade in ('Pre', 'English Dept.'): return school, '示例学校（sample_school）', grade, ''

        if grade not in ('Pre', 'G10', 'G11', 'G12', 'English Dept.') or not isinstance(classroom, str) or classroom not in tuple(str(i) for i in range(1, 10)):

            raise ValueError('请选择年级和班级（1～9 班）')

        return school, '示例学校（sample_school）', grade, classroom

    if school == 'other':
        raise ValueError('自定义学校已关闭，请选择示例学校')

    raise ValueError('请选择学校')





@app.get('/complete-profile')

def profile_page():

    if user().get('school'): return redirect('/')

    return send_from_directory(ROOT / 'server', 'profile.html')





@app.post('/api/profile')

def save_profile():

    try: profile = school_profile(request.json)

    except ValueError as error: return jsonify(error=str(error)), 400

    with db() as con:

        con.execute('INSERT INTO profiles VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET school=excluded.school,school_name=excluded.school_name,grade=excluded.grade,class_name=excluded.class_name', (user()['id'], *profile))

    return jsonify(ok=True)





def gate_ok():

    try:

        return signer.loads(request.cookies.get("ielts_gate", ""), max_age=315360000) == "admitted"

    except BadSignature:

        return False





def user():

    if has_request_context() and hasattr(g, "current_user"):

        return g.current_user

    token = hashlib.sha256(request.cookies.get("ielts_session", "").encode()).hexdigest()

    with db() as con:

        row = con.execute("SELECT u.id,u.name,p.school,p.school_name,p.grade,p.class_name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=u.id "

                          "WHERE s.token=? AND s.expires>?", (token, time.time())).fetchone()

    result = dict(row) if row else None

    if has_request_context(): g.current_user = result

    return result





def limited(con=None, record=False):

    ip = request.headers.get("X-Real-IP", request.remote_addr)

    now = int(time.time())

    def note(active):

        active.execute("DELETE FROM attempts WHERE stamp<?", (now - 600,))

        count = active.execute("SELECT count(*) FROM attempts WHERE ip=?", (ip,)).fetchone()[0]

        if count >= 400:

            return True

        if record:

            active.execute("INSERT INTO attempts VALUES(?,?)", (ip, now))

        return False

    if con is not None:

        return note(con)

    with db() as owned:

        return note(owned)





@app.errorhandler(sqlite3.OperationalError)

def database_busy(error):

    if 'locked' in str(error).lower() or 'busy' in str(error).lower():

        response = jsonify(error="服务器繁忙，正在重试，请稍等")

        response.status_code = 503

        response.headers['Retry-After'] = '1'

        return response

    app.logger.error('Database operation failed', exc_info=True)

    return jsonify(error="数据服务暂时不可用，请稍后重试"), 503





@app.before_request

def protect():

    if request.method in ("POST", "PUT", "DELETE"):

        origin = request.headers.get("Origin")

        expected = os.environ.get("IELTS_ORIGIN", "")

        if origin != expected or not request.is_json:

            return jsonify(error="请求来源无效，请刷新页面"), 403

        if not isinstance(request.get_json(silent=True), dict):

            return jsonify(error="请求格式无效"), 400

    if request.path in ("/health", "/api/health", "/login", "/resetpw", "/api/access", "/api/status", "/api/register", "/api/login", "/api/resetpw", "/api/resetpw/auth"):

        return None

    if not gate_ok():

        return (jsonify(error="请先输入访问密码"), 403) if request.path.startswith("/api/") else redirect("/login")

    current = user()

    if not current:

        return (jsonify(error="请先登录"), 401) if request.path.startswith("/api/") else redirect("/login")

    if request.method == 'GET' and request.path in ('/', '/index.html', '/adminset', '/admindata', '/usedata') and not current.get('school'):

        return redirect('/complete-profile')

    if request.path.startswith("/api/") and request.headers.get("X-IELTS-User") != current["id"]:

        return jsonify(error="账号已切换，请刷新此页面"), 409





@app.after_request

def headers(response):

    response.headers["Cache-Control"] = "no-store"

    if request.path.startswith(("/js/", "/css/", "/assets/")) and not request.path.endswith(".html") and response.status_code in (200, 304):

        response.headers["Cache-Control"] = "private, max-age=604800"

    response.headers["X-Content-Type-Options"] = "nosniff"

    response.headers["Referrer-Policy"] = "same-origin"

    response.headers["X-Frame-Options"] = "SAMEORIGIN"

    if request.path.startswith("/api/") and "gzip" in request.headers.get("Accept-Encoding", ""):

        raw = response.get_data()

        if len(raw) > 1024:

            response.set_data(gzip.compress(raw, compresslevel=5))

            response.headers["Content-Encoding"] = "gzip"

            response.headers["Vary"] = "Accept-Encoding"

    return response





@app.get("/login")

def login_page():

    return send_from_directory(ROOT / "server", "login.html")



RESET_USER = os.environ.get('IELTS_RESET_USER', '')
RESET_PASSWORD = os.environ.get('IELTS_RESET_PASSWORD', '').encode()


def reset_ok():
    try:
        return signer.loads(request.cookies.get("ielts_reset", ""), max_age=1800) == "reset"
    except BadSignature:
        return False


@app.get("/resetpw")
def reset_page():
    return send_from_directory(ROOT / "server", "resetpw.html")


@app.post("/api/resetpw/auth")
def reset_auth():
    if limited():
        return jsonify(error="尝试次数过多，请 10 分钟后再试"), 429
    body = request.json or {}
    name, password = body.get("username", ""), body.get("password", "")
    if not isinstance(name, str) or not isinstance(password, str):
        return jsonify(error="账号或密码格式错误"), 400
    name_ok = hmac.compare_digest(name.strip().casefold().encode(), RESET_USER.encode())
    password_ok = hmac.compare_digest(password.encode(), RESET_PASSWORD)
    if not RESET_USER or not RESET_PASSWORD or not name_ok or not password_ok:
        limited(record=True)
        return jsonify(error="账号或密码不正确"), 401
    response = jsonify(ok=True)
    response.set_cookie("ielts_reset", signer.dumps("reset"), max_age=1800,
                        httponly=True, secure=SECURE, samesite="Lax")
    return response


@app.post("/api/resetpw")
def reset_password():
    if not reset_ok():
        return jsonify(error="请先验证维护账号"), 403
    body = request.json or {}
    name, password, confirm = body.get("username", ""), body.get("password", ""), body.get("confirmPassword", "")
    if not isinstance(name, str) or not isinstance(password, str) or not isinstance(confirm, str):
        return jsonify(error="账号或密码格式错误"), 400
    name = name.strip()
    if not 1 <= len(name) <= 80 or not 6 <= len(password) <= 128:
        return jsonify(error="账号需为 1–80 字，新密码需为 6–128 字"), 400
    if password != confirm:
        return jsonify(error="两次输入的密码不一致"), 400
    with db() as con:
        row = con.execute("SELECT id, name FROM users WHERE name_key=?", (name.casefold(),)).fetchone()
        if not row:
            return jsonify(error="没有这个账号"), 404
        con.execute("UPDATE users SET password=? WHERE id=?", (generate_password_hash(password), row["id"]))
        con.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
    return jsonify(ok=True, name=row["name"])





@app.get("/api/status")

def status():

    return jsonify(access=gate_ok(), user=user() if gate_ok() else None)





def passage_kind(data):

    raw = " ".join(str(data.get(key) or "") for key in ("type", "examType", "practiceType", "pageType")).lower()

    meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}

    raw += " " + str(meta.get("type") or meta.get("examType") or "").lower()

    exam = str(data.get("examId") or "").lower()

    if "listen" in raw or "听力" in raw or exam.startswith("listening"):

        return "listening"

    if "read" in raw or "阅读" in raw or exam.startswith("p") or "reading" in exam:

        return "reading"

    return ""





def in_this_week(data):

    stamped = day(data)

    if not stamped:

        return False

    now = datetime.now(timezone(timedelta(hours=8)))

    start = (now - timedelta(days=now.weekday())).date()

    end = start + timedelta(days=7)

    try:

        current = datetime.fromisoformat(stamped).date()

    except ValueError:

        return False

    return start <= current < end





def counted_correct(data, total):

    raw = data.get("correctAnswers")

    if raw is None:

        raw = data.get("correctAnswersCount")

    try:

        correct = int(raw) if raw is not None else None

    except (TypeError, ValueError):

        correct = None

    if correct is None:

        try:

            accuracy = float(data.get("accuracy"))

        except (TypeError, ValueError):

            return 0

        if accuracy > 1:

            accuracy /= 100

        correct = int(round(accuracy * total))

    return max(0, min(total, correct))





@app.get("/api/sample_school-ranking")

def sample_school_ranking():

    if not user():

        return jsonify(error="请先登录"), 401

    with db() as con:

        rows = con.execute(

            "SELECT u.name, p.grade, p.class_name, json_extract(s.data, '$.practiceSummaries') AS summaries "

            "FROM users u JOIN profiles p ON p.user_id=u.id LEFT JOIN states s ON s.user_id=u.id "

            "WHERE p.school=?",

            ("sample_school",),

        ).fetchall()

    board = []

    for row in rows:

        try:

            items = json.loads(row["summaries"] or "[]")

        except (TypeError, json.JSONDecodeError):

            continue

        reading = listening = correct_total = question_total = 0

        for item in items if isinstance(items, list) else []:

            data = item.get("data") if isinstance(item, dict) and isinstance(item.get("data"), dict) else item

            if not isinstance(data, dict):

                continue

            kind = passage_kind(data)

            if not kind:

                continue

            try:

                total = int(data.get("totalQuestions") or 0)

            except (TypeError, ValueError):

                total = 0

            if total <= 0 or not in_this_week(data):

                continue

            if kind == "listening":

                listening += 1

            else:

                reading += 1

            correct_total += counted_correct(data, total)

            question_total += total

        count = reading + listening

        if count and str(row["name"] or "").strip().casefold() != "allen":

            accuracy = round(100 * correct_total / question_total) if question_total else None

            board.append(dict(name=row["name"], grade=row["grade"] or "", className=row["class_name"] or "", reading=reading, listening=listening, count=count, accuracy=accuracy))

    board.sort(key=lambda item: (-item["count"], item["name"]))

    top = board[:3]

    for index, item in enumerate(top, 1):

        item["rank"] = index

    return jsonify(rows=top)





@app.post("/api/access")

def access():

    if limited():

        return jsonify(error="尝试次数过多，请 10 分钟后再试"), 429

    if not hmac.compare_digest(str((request.json or {}).get("password", "")).encode(), os.environ["IELTS_ACCESS_PASSWORD"].encode()):

        limited(record=True)

        return jsonify(error="访问密码不正确"), 403

    response = jsonify(ok=True)

    response.set_cookie("ielts_gate", signer.dumps("admitted"), max_age=315360000,

                        httponly=True, secure=SECURE, samesite="Lax")

    return response





@app.post("/api/register")

@app.post("/api/login")

def authenticate():

    if not gate_ok():

        return jsonify(error="请先输入访问密码"), 403

    if limited():

        return jsonify(error="尝试次数过多，请 10 分钟后再试"), 429

    body = request.json or {}

    name, password = body.get("username", ""), body.get("password", "")

    if not isinstance(name, str) or not isinstance(password, str):

        return jsonify(error="账号或密码格式错误"), 400

    name = name.strip()

    if not 1 <= len(name) <= 80 or not 1 <= len(password) <= 128:

        return jsonify(error="账号需为 1–80 字，密码需为 1–128 字"), 400

    if request.path == "/api/register" and blocked_display_text(name):

        return jsonify(error="用户名包含不当用语，请修改"), 400

    with db() as con:

        if request.path == "/api/register":

            if password != body.get("confirmPassword"):

                return jsonify(error="两次输入的密码不一致"), 400

            if len(password) < 6:

                return jsonify(error="密码至少需要 6 位"), 400

            try: profile = school_profile(body)

            except ValueError as error: return jsonify(error=str(error)), 400

            uid = secrets.token_hex(16)

            try:

                con.execute("INSERT INTO users VALUES(?,?,?,?)",

                            (uid, name, name.casefold(), generate_password_hash(password)))

            except sqlite3.IntegrityError:

                return jsonify(error="这个账号名已被注册"), 409

            con.execute('INSERT INTO profiles VALUES(?,?,?,?,?)', (uid, *profile))

        else:

            row = con.execute("SELECT * FROM users WHERE name_key=?", (name.casefold(),)).fetchone()

            if not row or not check_password_hash(row["password"], password):

                limited(con, record=True)

                return jsonify(error="账号或密码不正确"), 401

            uid = row["id"]

        token = secrets.token_urlsafe(48)

        con.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))

        con.execute("INSERT INTO sessions VALUES(?,?,?)",

                    (hashlib.sha256(token.encode()).hexdigest(), uid, int(time.time()) + 2592000))

    g.usage_user_id = uid

    g.usage_registered = request.path == "/api/register"

    response = jsonify(ok=True)

    response.set_cookie("ielts_session", token, max_age=2592000, httponly=True, secure=SECURE, samesite="Lax")

    return response





@app.post("/api/logout")

def logout():

    with db() as con:

        con.execute("DELETE FROM sessions WHERE token=?",

                    (hashlib.sha256(request.cookies.get("ielts_session", "").encode()).hexdigest(),))

    response = jsonify(ok=True)

    response.delete_cookie("ielts_session", secure=SECURE, httponly=True, samesite="Lax")

    return response





@app.route("/api/state", methods=["GET", "PUT"])

def state():

    uid = user()["id"]

    with db() as con:

        if request.method == "GET":

            stores = request.args.get("stores")

            key = request.args.get("key")

            if stores is not None:

                allowed = {"documents", "system", "practiceSummaries", "practiceDetails", "practiceAnnotations"}

                selected = sorted(set(stores.split(",")) & allowed)

                # SQLite projects the requested stores/rows before returning data to Python.

                # In particular a draft read no longer materializes all history and backups.

                picked = {}

                for item in request.args.getlist("pick")[:40]:

                    store_name, sep, item_key = item.partition("::")

                    if sep and store_name in allowed and item_key:

                        picked.setdefault(store_name, []).append(item_key)

                if picked:

                    selected = sorted(picked)

                values = []; params = []

                for store in selected:

                    path = '$.' + store

                    if store in picked:

                        field = 'logicalKey' if store in ('documents','system') else 'recordId'

                        values.append("(SELECT json_group_array(json(value)) FROM json_each(states.data, ?) WHERE json_extract(value, ?) IN (SELECT value FROM json_each(?)))")

                        params.extend([path, '$.' + field, json.dumps(picked[store], ensure_ascii=False)])

                    elif key is not None:

                        field = 'logicalKey' if store in ('documents','system') else 'recordId'

                        values.append("(SELECT json_group_array(json(value)) FROM json_each(states.data, ?) WHERE json_extract(value, ?) = ?)")

                        params.extend([path, '$.' + field, key])

                    else:

                        values.append("json_extract(data, ?)"); params.append(path)

                row = con.execute("SELECT version" + ("," + ",".join(values) if values else "") +

                                  " FROM states WHERE user_id=?", (*params, uid)).fetchone()

                data = {store: json.loads(row[i+1] or '[]') for i,store in enumerate(selected)} if row else {}

            else:

                row = con.execute("SELECT version,data FROM states WHERE user_id=?", (uid,)).fetchone()

                data = json.loads(row["data"]) if row else {}

            return jsonify(version=row["version"] if row else 0, data=data)

        body = request.json

        data = body.get("data")

        operations = body.get("operations")

        if (not isinstance(data, dict) and not isinstance(operations, list)) or not isinstance(body.get("version"), int):

            return jsonify(error="无效数据"), 400

        allowed = {"documents", "system", "practiceSummaries", "practiceDetails", "practiceAnnotations"}

        if data is not None and (set(data) - allowed or any(not isinstance(rows, list) for rows in data.values())):

            return jsonify(error="无效数据结构"), 400

        if operations is not None and any(

            not isinstance(op, dict) or op.get("store") not in allowed or op.get("type") not in ("put", "delete", "clear")

            or (op["type"] == "put" and (not isinstance(op.get("value"), dict)

                or not isinstance(op["value"].get("logicalKey" if op["store"] in ("documents", "system") else "recordId"), str)))

            or (op["type"] == "delete" and not isinstance(op.get("key"), str))

            for op in operations

        ):

            return jsonify(error="无效数据操作"), 400

        con.execute("BEGIN IMMEDIATE")

        con.execute("INSERT OR IGNORE INTO states VALUES(?,0,'{}')", (uid,))

        current = con.execute("SELECT version,data FROM states WHERE user_id=?", (uid,)).fetchone()

        if current["version"] != body["version"]:

            return jsonify(error="数据已更新，请重试"), 409

        if operations is not None:

            data = json.loads(current["data"])

            for op in operations:

                store = op["store"]

                key_field = "logicalKey" if store in ("documents", "system") else "recordId"

                rows = data.setdefault(store, [])

                if op["type"] == "clear":

                    data[store] = []

                else:

                    key = op["value"][key_field] if op["type"] == "put" else op["key"]

                    data[store] = [item for item in rows if item.get(key_field) != key]

                    if op["type"] == "put":

                        data[store].append(op["value"])

        result = con.execute("UPDATE states SET version=version+1,data=? WHERE user_id=? AND version=?",

                             (json.dumps(data, ensure_ascii=False), uid, body["version"]))

        if not result.rowcount:

            return jsonify(error="数据已更新，请重试"), 409

    return jsonify(ok=True, version=body["version"] + 1)





@app.post("/api/account/username")
def rename_account():
    body = request.json or {}
    password = body.get("password", "")
    name = body.get("username", "")
    if not isinstance(password, str) or not isinstance(name, str):
        return jsonify(error="账号或密码格式错误"), 400
    name = name.strip()
    if not 1 <= len(name) <= 80 or not 1 <= len(password) <= 128:
        return jsonify(error="用户名需为 1～80 个字，密码需为 1～128 个字"), 400
    if blocked_display_text(name):
        return jsonify(error="用户名包含不当用语，请修改"), 400
    if limited():
        return jsonify(error="尝试次数过多，请 10 分钟后再试"), 429
    current = user()
    with db() as con:
        row = con.execute("SELECT password FROM users WHERE id=?", (current["id"],)).fetchone()
        if not row or not check_password_hash(row["password"], password):
            limited(con, record=True)
            return jsonify(error="密码不正确"), 401
        try:
            con.execute("UPDATE users SET name=?, name_key=? WHERE id=?", (name, name.casefold(), current["id"]))
        except sqlite3.IntegrityError:
            return jsonify(error="这个账号名已被注册"), 409
        try:
            con.execute("UPDATE username_reminders SET pending=0, updated_at=CURRENT_TIMESTAMP WHERE user_id=?", (current["id"],))
        except sqlite3.OperationalError:
            pass
    return jsonify(ok=True, name=name)


@app.get("/account-bootstrap.js")

def bootstrap():

    current = user()

    text = "window.IELTS_ACCOUNT=" + json.dumps(current, ensure_ascii=True) + ";\n"

    text += (ROOT / "server" / "activity.js").read_text(encoding="utf-8") + "\n"

    text += (ROOT / "server" / "cloud.js").read_text(encoding="utf-8")

    text += "\n" + (ROOT / "server" / "release-notice.js").read_text(encoding="utf-8")

    text += "\n" + (ROOT / "server" / "username-reminder.js").read_text(encoding="utf-8")

    return app.response_class(text, mimetype="application/javascript")





with db() as con:
    con.execute('CREATE TABLE IF NOT EXISTS admin_grants(user_id TEXT PRIMARY KEY)')

def is_admin():

    current = user()

    admins = {item.strip() for item in os.environ.get("IELTS_ADMIN_IDS", "").split(",") if item.strip()}

    admins.add(os.environ.get("IELTS_ADMIN_ID", ""))

    if not current: return False
    from account_admin import SITE_OWNER_ID
    if current['id'] in admins or current['id']==SITE_OWNER_ID: return True
    with db() as con:
        return con.execute('SELECT 1 FROM admin_grants WHERE user_id=?', (current['id'],)).fetchone() is not None





from teacher_auth import install_teacher_auth
can_teach = install_teacher_auth(app, db, user, is_admin, limited, ROOT / 'server')

@app.get("/adminset")

@app.get("/admindata")

def admin_page():

    if not can_teach():

        return "仅授权教师可以访问此页面。", 403

    return send_from_directory(ROOT / "server", "admin.html")





@app.get("/api/admin/data")

def admin_data():

    if not can_teach():

        return jsonify(error="仅管理员可以查看"), 403

    requested = request.args.get("user")

    # List view reads summaries only, never every student's answers/backups.

    with db() as con:

        rows = con.execute(

            "SELECT u.id,u.name,p.school,p.school_name,p.grade,p.class_name," + ("s.data AS data" if requested else

            "json_extract(s.data, '$.practiceSummaries') AS summaries") +

            " FROM users u LEFT JOIN states s ON s.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id" +

            (" WHERE u.id=?" if requested else " ORDER BY u.name_key"),

            (requested,) if requested else ()).fetchall()

    results = []

    for row in rows:

        data = json.loads(row["data"] or "{}") if requested else {}

        summaries = data.get("practiceSummaries", []) if requested else json.loads(row["summaries"] or "[]")

        records = [dict(item.get("data") or {}, id=(item.get("data") or {}).get("id") or item.get("recordId")) for item in summaries if isinstance(item,dict) and isinstance(item.get("data"),dict)]

        item = dict(id=row['id'], name=row['name'], school=row['school'], schoolName=row['school_name'], grade=row['grade'], className=row['class_name'], **aggregate(records))

        if requested:

            item["practice"] = records

            item["documents"] = {r["logicalKey"]:r.get("envelope", {}).get("data") for r in data.get("documents", [])}

            item["details"] = [dict(r.get("data") or {}, recordId=r.get("recordId")) for r in data.get("practiceDetails", []) if isinstance(r,dict) and isinstance(r.get("data"),dict)]

            item["annotations"] = [dict(r.get("data") or {}, recordId=r.get("recordId")) for r in data.get("practiceAnnotations", []) if isinstance(r,dict) and isinstance(r.get("data"),dict)]

        results.append(item)

    if requested and not results:

        return jsonify(error="用户不存在"), 404

    return jsonify(users=results)







@app.get("/")

@app.get("/<path:filename>")

def static_file(filename="index.html"):

    if filename != "index.html" and filename.split("/")[0] not in {"js", "css", "assets", "templates", "ReadingPractice", "ListeningPractice"}:

        return "Not found", 404

    target = (ROOT / filename).resolve()

    if ROOT not in target.parents or not target.is_file():

        return "Not found", 404

    if target.suffix.lower() == ".html":

        text = target.read_text(encoding="utf-8")

        version = "20261109-author"

        text = re.sub(r'(<script\b[^>]*\bsrc=["\'])([^"\']+\.js)(["\'])',

                      lambda m: m[1] + m[2] + "?v=" + version + m[3]

                      if not m[2].startswith(("http:", "https:", "//")) else m[0], text)

        # Stylesheets need the same cache generation as scripts.
        from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
        def version_stylesheet(match):
            url = match[2]
            parts = urlsplit(url)
            if parts.scheme or parts.netloc:
                return match[0]
            query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "v"]
            query.append(("v", version))
            return match[1] + urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)) + match[3]
        text = re.sub(r'(<link\b[^>]*\bhref=["\'])([^"\']+\.css(?:[?#][^"\']*)?)(["\'])', version_stylesheet, text, flags=re.I)
        text = re.sub(r'<head\b[^>]*>', lambda m: m[0] + '<script>window.IELTS_ASSET_VERSION="' + version + '";</script><script src="/account-bootstrap.js"></script>', text, count=1, flags=re.I)

        if filename == "index.html" and request.args.get("teacherUser"):

            text = text.replace("</body>", '<script src="/js/teacher-review.js?v=20261026-3"></script></body>')

        return app.response_class(text, mimetype="text/html")

    return send_from_directory(ROOT, filename, conditional=True)





# Optional statistics are isolated from practice storage and application startup.

try:

    from usage_data import install_usage

    install_usage(app, db, is_admin, DATA, ROOT / 'server', user)

except Exception:

    app.logger.exception('Usage metrics unavailable; main application remains available')



from health_data import install_health

install_health(app, DATA, ROOT / "server")



from release_notice import install_release_notice

install_release_notice(app, db, user)


from feedback_data import install_feedback

install_feedback(app, db, user, is_admin, ROOT / "server")

from teacher_data import install_class_charts

install_class_charts(app, db, can_teach)

from listening_vocab import register_listening_vocab

register_listening_vocab(app, db, user)

from selection_notes import register_selection_notes

register_selection_notes(app, db, user)

from exam_publish import install_exams

install_exams(app, can_teach, user, DATA, ROOT, db)

from writing_publish import install_writing

install_writing(app, can_teach, user, DATA)

from account_admin import install_account_admin
install_account_admin(app, db, user, is_admin, school_profile, limited)
