"""Account-scoped notes attached to a selected passage in intensive reading or listening."""

import secrets
from flask import jsonify, request


def register_selection_notes(app, db, user):
    with db() as con:
        con.execute('''CREATE TABLE IF NOT EXISTS selection_notes (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL,
            source TEXT NOT NULL, title TEXT NOT NULL, quote TEXT NOT NULL,
            note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        con.execute('CREATE INDEX IF NOT EXISTS selection_notes_owner ON selection_notes(user_id, subject, source)')

    @app.route('/api/selection-notes', methods=['GET', 'POST'])
    def selection_notes():
        uid = user()['id']
        body = request.get_json(silent=True) if request.method == 'POST' else {}
        subject = str((body or {}).get('subject') or request.args.get('subject') or '')
        source = str((body or {}).get('source') or request.args.get('source') or '').strip()
        if subject not in ('reading', 'listening'):
            return jsonify(error='请选择精读或精听'), 400
        if request.method == 'POST':
            action = body.get('action')
            with db() as con:
                if action == 'add':
                    quote = str(body.get('quote') or '').strip()
                    note = str(body.get('note') or '').strip()
                    title = str(body.get('title') or '').strip()[:160]
                    if not 1 <= len(quote) <= 4000 or not 1 <= len(note) <= 500:
                        return jsonify(error='请先划词，笔记不超过 500 字'), 400
                    if subject == 'reading':
                        if not source.startswith('reading:') or len(source) > 160:
                            return jsonify(error='这篇阅读无法保存笔记'), 400
                    elif not source.startswith('/ListeningPractice/') or len(source) > 512:
                        return jsonify(error='这篇听力无法保存笔记'), 400
                    count = con.execute('SELECT count(*) FROM selection_notes WHERE user_id=?', (uid,)).fetchone()[0]
                    if count >= 500:
                        return jsonify(error='笔记已满 500 条，请先删除一些'), 400
                    note_id = secrets.token_hex(8)
                    con.execute('''INSERT INTO selection_notes
                        (id, user_id, subject, source, title, quote, note)
                        VALUES (?, ?, ?, ?, ?, ?, ?)''',
                        (note_id, uid, subject, source, title, quote, note))
                elif action == 'remove':
                    note_id = str(body.get('id') or '')
                    if len(note_id) != 16:
                        return jsonify(error='笔记不存在'), 404
                    changed = con.execute('DELETE FROM selection_notes WHERE id=? AND user_id=?', (note_id, uid)).rowcount
                    if not changed:
                        return jsonify(error='笔记不存在'), 404
                else:
                    return jsonify(error='操作无效'), 400
        with db() as con:
            if source:
                rows = con.execute('''SELECT id, subject, source, title, quote, note, created_at
                    FROM selection_notes WHERE user_id=? AND subject=? AND source=?
                    ORDER BY created_at DESC LIMIT 200''', (uid, subject, source)).fetchall()
            else:
                rows = con.execute('''SELECT id, subject, source, title, quote, note, created_at
                    FROM selection_notes WHERE user_id=? AND subject=?
                    ORDER BY created_at DESC LIMIT 200''', (uid, subject)).fetchall()
        return jsonify(notes=[dict(row) for row in rows])
