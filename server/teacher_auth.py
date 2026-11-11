import os
from flask import g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash


def install_teacher_auth(app, db, user, is_admin, limited, directory):
    with db() as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS teacher_grants(user_id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS teacher_audit(
                id INTEGER PRIMARY KEY, stamp TEXT DEFAULT CURRENT_TIMESTAMP,
                actor TEXT NOT NULL, name TEXT NOT NULL, action TEXT NOT NULL,
                target TEXT NOT NULL, status INTEGER);
        """)

    allowed_ids = {value.strip() for value in os.environ.get('IELTS_TEACHER_AUTH_IDS', '').split(',') if value.strip()}

    def permitted():
        current = user()
        if not current:
            return False
        return current['id'] in allowed_ids

    def can_teach():
        if is_admin():
            return True
        current = user()
        if not current:
            return False
        with db() as con:
            return bool(con.execute("""SELECT 1 FROM teacher_grants t JOIN profiles p USING(user_id)
                WHERE user_id=? AND grade='English Dept.' AND school='sample_school'""",(current['id'],)).fetchone())

    @app.get('/admin/auth')
    def teacher_auth_page():
        if not permitted():
            return '无权访问教师授权页',403
        return send_from_directory(directory,'teacher_auth.html')

    @app.route('/api/admin/teacher-auth',methods=['GET','POST'])
    def teacher_authorize():
        if not permitted():
            return jsonify(error='无权授予教师权限'),403
        if request.method=='GET':
            with db() as con:
                rows=con.execute("""SELECT u.id,u.name FROM users u JOIN profiles p ON u.id=p.user_id
                    WHERE p.grade='English Dept.' AND p.school='sample_school'
                    AND u.id NOT IN (SELECT user_id FROM teacher_grants)
                    AND u.id NOT IN (SELECT user_id FROM admin_grants)
                    ORDER BY u.name_key""").fetchall()
            return jsonify(users=[dict(row) for row in rows if row["id"] not in allowed_ids])
        body=request.get_json()
        ids=body.get('ids')
        password=body.get('password')
        if not isinstance(ids,list) or not 1<=len(ids)<=500 or not all(isinstance(i,str) and 1<=len(i)<=100 for i in ids):
            return jsonify(error='请选择 1 至 500 位教师'),400
        if not isinstance(password,str) or not 1<=len(password)<=128:
            return jsonify(error='请输入当前账号密码'),400
        if limited():
            return jsonify(error='尝试过多，请稍后再试'),429
        ids=list(dict.fromkeys(ids))
        actor=user()['id']
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            row=con.execute('SELECT password FROM users WHERE id=?',(actor,)).fetchone()
            if not row or not check_password_hash(row[0],password):
                limited(con,record=True)
                return jsonify(error='当前账号密码错误'),403
            placeholders=','.join('?' for _ in ids)
            rows=con.execute(f"""SELECT u.id,u.name FROM users u JOIN profiles p ON p.user_id=u.id
                WHERE u.id IN ({placeholders}) AND p.grade='English Dept.' AND p.school='sample_school'""",ids).fetchall()
            if len(rows)!=len(ids):
                return jsonify(error='所选账号已变化或不属于英语部，请刷新'),409
            con.executemany('INSERT OR IGNORE INTO teacher_grants VALUES(?)',[(i,) for i in ids])
            g.audit_target=', '.join(row['name'] for row in rows)
        return jsonify(ok=True)

    actions={'/api/admin/exams':'发布考试','/api/admin/exams/cancel':'撤回考试','/api/admin/exams/delete':'删除考试',
             '/api/admin/writing':'发布写作','/api/admin/writing/cancel':'撤回写作','/api/admin/writing/delete':'删除写作',
             '/api/admin/writing/feedback':'批改作文','/api/admin/feedback/delete':'删除反馈',
             '/api/admin/teacher-auth':'批量授予教师权限','/api/usage/username-reminders':'发送用户名提醒',
             '/api/admin/accounts':'编辑账号'}

    @app.before_request
    def audit_start():
        if request.method not in ('POST','PUT','PATCH','DELETE') or request.path not in actions:
            return
        actor=user()
        if not actor:
            return
        body=request.get_json(silent=True) or {}
        action=actions[request.path]
        if request.path=='/api/admin/accounts' and body.get('action')=='delete':
            action='删除账号'
        if request.path.endswith('/writing/feedback'):
            action='发布作文批改' if body.get('published') else '保存批改草稿'
        target=body.get('id') or body.get('title') or body.get('ids') or body.get('userIds') or ''
        with db() as con:
            g.audit_id=con.execute('INSERT INTO teacher_audit(actor,name,action,target) VALUES(?,?,?,?)',
                (actor['id'],actor['name'],action,str(target)[:16000])).lastrowid

    @app.after_request
    def audit_finish(response):
        if getattr(g,'audit_id',None):
            data=response.get_json(silent=True) or {}
            target=getattr(g,'audit_target',None) or data.get('id')
            with db() as con:
                con.execute('UPDATE teacher_audit SET status=?,target=COALESCE(?,target) WHERE id=?',
                    (response.status_code,target,g.audit_id))
        return response

    @app.get('/api/usage/teacher-audit')
    def audit_list():
        if not is_admin():
            return jsonify(error='仅维护人员可查看'),403
        before=request.args.get('before',type=int) or 9223372036854775807
        with db() as con:
            rows=con.execute('SELECT * FROM teacher_audit WHERE id<? ORDER BY id DESC LIMIT 50',(before,)).fetchall()
        return jsonify(rows=[dict(row) for row in rows])
    return can_teach
