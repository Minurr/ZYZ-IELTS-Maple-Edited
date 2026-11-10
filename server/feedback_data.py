"""Logged-in problem reports. Stored apart from practice state."""
import time
from flask import jsonify, request, send_from_directory

MODULES = ("阅读", "听力", "套题", "精读", "账号与登录", "其他")


def install_feedback(app, db, user, is_admin, server_dir):
    with db() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS feedback("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, created INTEGER NOT NULL, "
            "module TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL)"
        )

    @app.post("/api/feedback")
    def submit_feedback():
        body = request.json or {}
        module, title, detail = body.get("module", ""), body.get("title", ""), body.get("detail", "")
        if module not in MODULES or not isinstance(title, str) or not isinstance(detail, str):
            return jsonify(error="请选择模块并填写问题"), 400
        title, detail = title.strip(), detail.strip()
        if not 1 <= len(title) <= 80 or not 1 <= len(detail) <= 2000:
            return jsonify(error="标题需为 1～80 字，描述需为 1～2000 字"), 400
        current = user()
        now = int(time.time())
        with db() as con:
            recent = con.execute(
                "SELECT count(*) FROM feedback WHERE user_id=? AND created>?",
                (current["id"], now - 3600),
            ).fetchone()[0]
            if recent >= 10:
                return jsonify(error="提交过于频繁，请一小时后再试"), 429
            con.execute(
                "INSERT INTO feedback(user_id,created,module,title,detail) VALUES(?,?,?,?,?)",
                (current["id"], now, module, title, detail),
            )
        return jsonify(ok=True)

    @app.get("/admin/feedback")
    def admin_feedback_page():
        if not is_admin():
            return "仅授权教师可以访问此页面。", 403
        return send_from_directory(server_dir, "admin_feedback.html")

    @app.get("/api/admin/feedback")
    def admin_feedback():
        if not is_admin():
            return jsonify(error="仅管理员可以查看"), 403
        with db() as con:
            rows = con.execute(
                "SELECT f.id,f.created,f.module,f.title,f.detail,u.name "
                "FROM feedback f JOIN users u ON u.id=f.user_id ORDER BY f.id DESC LIMIT 200"
            ).fetchall()
        return jsonify(items=[
            dict(id=row["id"], created=row["created"], module=row["module"], title=row["title"],
                 detail=row["detail"], name=row["name"])
            for row in rows
        ])

    @app.post("/api/admin/feedback/delete")
    def delete_admin_feedback():
        if not is_admin():
            return jsonify(error="仅管理员可以删除反馈"), 403
        body = request.get_json(silent=True) or {}
        feedback_id = body.get("id")
        if type(feedback_id) is not int or feedback_id < 1:
            return jsonify(error="反馈编号无效"), 400
        with db() as con:
            deleted = con.execute("DELETE FROM feedback WHERE id=?", (feedback_id,)).rowcount
        if not deleted:
            return jsonify(error="反馈已被删除或不存在"), 404
        return jsonify(ok=True)
