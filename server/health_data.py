"""Read-only, public health snapshot. No account data is returned."""
import sqlite3,time,threading,re,urllib.request
from flask import jsonify,send_from_directory

def install_health(app,data_dir,server_dir):
    lock=threading.Lock();cache={}
    def inspect_apis():
        labels={'/api/status':'登录状态','/api/access':'访问口令验证','/api/register':'账号注册','/api/login':'账号登录','/api/logout':'退出登录','/api/profile':'学校资料保存','/api/state':'学习数据','/api/admin/data':'教师数据统计','/api/usage':'维护使用统计','/api/health':'服务健康检查'}
        rows=[]
        for rule in sorted(app.url_map.iter_rules(),key=lambda r:r.rule):
            if not rule.rule.startswith('/api/'):continue
            for method in sorted(rule.methods-{'HEAD','OPTIONS'}):
                name=labels.get(rule.rule,'业务接口')
                if rule.rule=='/api/state':name+='读取' if method=='GET' else '保存'
                if rule.rule=='/api/health':
                    rows.append(dict(name=name,state='ok',note='当前健康接口已响应',ms=None));continue
                started=time.monotonic()
                try:
                    # No cookies, valid origin, credentials or after-request hooks:
                    # exercise each route's anonymous guard without writes or metrics pollution.
                    with app.test_request_context(rule.rule,method=method,json={} if method!='GET' else None):
                        if rule.rule=='/api/status':
                            response=app.make_response(app.dispatch_request());ok=response.status_code==200
                            note='匿名登录状态读取正常'
                        else:
                            guarded=app.preprocess_request()
                            ok=guarded is not None and app.make_response(guarded).status_code in (401,403)
                            note='访问保护正常；未执行登录后业务' if ok else '访问保护检查异常'
                    rows.append(dict(name=name,state='ok' if ok else 'error',note=note,ms=round((time.monotonic()-started)*1000,1)))
                except Exception:
                    rows.append(dict(name=name,state='error',note='检查未完成',ms=None))
        return rows

    @app.get('/health')
    def health_page():return send_from_directory(server_dir,'health.html')
    @app.get('/api/health')
    def health_snapshot():
        with lock:
            if cache and time.monotonic()-cache['at']<3:
                return jsonify(cache['data']),cache['status']
            started=time.monotonic();database=False
            try:
                with sqlite3.connect('file:'+str(data_dir/'accounts.sqlite3')+'?mode=ro',uri=True,timeout=.2) as con:
                    con.execute('SELECT 1 FROM users LIMIT 1').fetchone()
                database=True
            except sqlite3.Error:pass
            db_ms=round((time.monotonic()-started)*1000,1)
            connections=None
            try:
                with urllib.request.urlopen('http://127.0.0.1:4181/nginx_status',timeout=.5) as response:
                    raw=response.read(2048).decode('ascii')
                active=re.search(r'Active connections:\s*(\d+)',raw)
                states=re.search(r'Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)',raw)
                if active and states:connections=dict(active=int(active[1]),reading=int(states[1]),writing=int(states[2]),waiting=int(states[3]))
            except (OSError,ValueError):pass
            checks=inspect_apis()
            result=dict(checks=checks,api='ok',database='ok' if database else 'unavailable',databaseMs=db_ms,
                        connections=connections,checkedAt=time.time(),ok=database and connections is not None and all(row['state']=='ok' for row in checks))
            status=200 if result['ok'] else 503
            cache.update(at=time.monotonic(),data=result,status=status)
            return jsonify(result),status
