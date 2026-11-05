"""Small account-scoped notebook for words selected in listening transcripts."""

from flask import jsonify, request


def register_listening_vocab(app, db, user):
    with db() as con:
        con.execute('''CREATE TABLE IF NOT EXISTS listening_vocabulary (
            user_id TEXT NOT NULL, word_key TEXT NOT NULL, source TEXT NOT NULL,
            word TEXT NOT NULL, title TEXT NOT NULL, context TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, word_key, source)
        )''')

    @app.route('/api/listening-vocabulary', methods=['GET', 'POST'])
    def listening_vocabulary():
        uid = user()['id']
        body = request.get_json(silent=True) if request.method == 'POST' else {}
        with db() as con:
            if request.method == 'POST':
                action = body.get('action')
                word = str(body.get('word', '')).strip()
                source = str(body.get('source', '')).strip()
                if not word or len(word) > 80 or not source.startswith('/ListeningPractice/') or len(source) > 512:
                    return jsonify(error='生词或题目来源无效'), 400
                if action == 'add':
                    title = str(body.get('title', '')).strip()[:160]
                    context = str(body.get('context', '')).strip()[:500]
                    con.execute('''INSERT INTO listening_vocabulary
                        (user_id, word_key, source, word, title, context)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, word_key, source) DO UPDATE SET
                        title=excluded.title, context=excluded.context''',
                        (uid, word.casefold(), source, word, title, context))
                elif action == 'remove':
                    con.execute('DELETE FROM listening_vocabulary WHERE user_id=? AND word_key=? AND source=?',
                                (uid, word.casefold(), source))
                else:
                    return jsonify(error='操作无效'), 400
            rows = con.execute('''SELECT word, source, title, context, created_at
                FROM listening_vocabulary WHERE user_id=?
                ORDER BY created_at DESC, word COLLATE NOCASE LIMIT 2000''', (uid,)).fetchall()
        return jsonify(words=[dict(row) for row in rows])
