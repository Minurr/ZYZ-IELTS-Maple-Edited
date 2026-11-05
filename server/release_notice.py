from flask import jsonify, request

NOTICE_ID = 'safari-submit-fix-20261027'


def install_release_notice(app, db, user):
    # Keep acknowledgement outside practice data and its versioned writes.
    with db() as con:
        con.execute('CREATE TABLE IF NOT EXISTS release_notice_receipts '
                    '(user_id TEXT NOT NULL, notice_id TEXT NOT NULL, '
                    'received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, '
                    'PRIMARY KEY(user_id, notice_id))')

    @app.route('/api/release-notice', methods=['GET', 'POST'])
    def release_notice():
        uid = user()['id']
        with db() as con:
            if request.method == 'POST':
                if request.json.get('noticeId') != NOTICE_ID:
                    return jsonify(error='通知已更新，请刷新页面'), 400
                con.execute('INSERT OR IGNORE INTO release_notice_receipts(user_id,notice_id) VALUES(?,?)',
                            (uid, NOTICE_ID))
        # Retired for every account. Older pages still ask, and must not open the dialog.
        return jsonify(noticeId=NOTICE_ID, received=True)
