import os
from flask import request, jsonify
from werkzeug.security import check_password_hash

SITE_OWNER_ID = os.environ.get('IELTS_SITE_OWNER_ID', '')

def install_account_admin(app, db, user, is_admin, school_profile, limited):
    def protected():
        return {x.strip() for x in (os.environ.get('IELTS_ADMIN_IDS','')+','+os.environ.get('IELTS_ADMIN_ID','')).split(',') if x.strip()} | {SITE_OWNER_ID}
    @app.route('/api/admin/accounts', methods=['GET','POST'])
    def accounts():
        if not is_admin(): return jsonify(error='仅管理员可操作'),403
        if request.method=='GET':
            with db() as con:
                rows=con.execute('SELECT u.id,u.name,p.school,p.school_name,p.grade,p.class_name,a.user_id AS granted FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN admin_grants a ON a.user_id=u.id ORDER BY u.name_key').fetchall()
            return jsonify(users=[dict(id=r['id'],name=r['name'],school=r['school'] or '',schoolName=r['school_name'] or '',grade=r['grade'] or '',className=r['class_name'] or '',admin=bool(r['granted'] or r['id'] in protected()),protected=r['id'] in protected(),owner=r['id']==SITE_OWNER_ID,canDelete=r['id'] not in (user()['id'],SITE_OWNER_ID) and (user()['id']==SITE_OWNER_ID or not (r['granted'] or r['id'] in protected()))) for r in rows])
        body=request.get_json(silent=True) or {};uid=body.get('id');action=body.get('action')
        if not isinstance(uid,str): return jsonify(error='请选择账号'),400
        if action not in ('save','delete'):return jsonify(error='操作无效'),400
        if action=='save':
            try:
                profile=school_profile(body)
            except ValueError as e:
                with db() as con:
                    previous=con.execute('SELECT school,school_name,grade,class_name FROM profiles WHERE user_id=?',(uid,)).fetchone()
                if previous and previous['school']=='other' and body.get('school')=='other' and body.get('schoolName')==previous['school_name']:
                    profile=tuple(previous)
                else:return jsonify(error=str(e)),400
            if not isinstance(body.get('admin'),bool):return jsonify(error='权限格式错误'),400
        if action=='delete':
            if uid==user()['id'] or uid==SITE_OWNER_ID:return jsonify(error='不能删除当前账号或站长账号'),400
            p1,p2=body.get('password'),body.get('passwordAgain')
            if not isinstance(p1,str) or not isinstance(p2,str) or not 1<=len(p1)<=128 or p1!=p2:return jsonify(error='请两次输入相同的管理员密码'),400
            if limited():return jsonify(error='尝试次数过多，请稍后重试'),429
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            if not con.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():return jsonify(error='账号不存在'),404
            if action=='delete':
                target_admin=uid in protected() or con.execute('SELECT 1 FROM admin_grants WHERE user_id=?',(uid,)).fetchone() is not None
                if target_admin and user()['id']!=SITE_OWNER_ID:return jsonify(error='只有站长可以删除管理员'),403
                admin=con.execute('SELECT password FROM users WHERE id=?',(user()['id'],)).fetchone()
                if not admin or not check_password_hash(admin['password'],p1) or not check_password_hash(admin['password'],p2):
                    limited(con,record=True);return jsonify(error='管理员密码不正确'),401
                # Delete account-owned rows atomically; aggregate maintenance metrics remain historical.
                tables=[r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
                for table in tables:
                    safe=table.replace('"','""')
                    columns=[r[1] for r in con.execute('PRAGMA table_info("'+safe+'")')]
                    if 'user_id' in columns:con.execute('DELETE FROM "'+safe+'" WHERE user_id=?',(uid,))
                con.execute('DELETE FROM users WHERE id=?',(uid,))
            else:
                if body['admin'] and uid not in protected() and not con.execute('SELECT 1 FROM admin_grants WHERE user_id=?',(uid,)).fetchone():
                    return jsonify(error='请到教师授权页授予教师权限'),403
                if uid==user()['id'] and not body['admin']:return jsonify(error='不能取消自己的后台权限'),400
                if uid in protected() and not body['admin']:return jsonify(error='系统配置的管理员不能在此取消权限'),400
                con.execute('INSERT INTO profiles VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET school=excluded.school,school_name=excluded.school_name,grade=excluded.grade,class_name=excluded.class_name',(uid,*profile))
                if body['admin']:con.execute('INSERT OR IGNORE INTO admin_grants VALUES(?)',(uid,))
                else:con.execute('DELETE FROM admin_grants WHERE user_id=?',(uid,))
        return jsonify(ok=True)
