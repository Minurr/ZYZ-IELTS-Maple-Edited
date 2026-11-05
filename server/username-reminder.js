(() => {
    'use strict';
    if (window !== window.top || !['/', '/index.html'].includes(location.pathname)) return;
    const account = window.IELTS_ACCOUNT;
    if (!account || !account.id) return;
    const headers = {'Content-Type': 'application/json', 'X-IELTS-User': account.id};

    function openRename() {
        const nav = document.querySelector('[data-view="settings"]');
        if (nav) nav.click();
        else if (typeof window.showView === 'function') window.showView('settings', false);
        const form = document.getElementById('rename-account-form');
        const button = document.getElementById('rename-account-entry-btn');
        if (form && form.hidden && button) button.click();
        const input = form && form.querySelector('input[name="username"]');
        if (input) input.focus();
    }

    async function showReminder() {
        try {
            const response = await fetch('/api/username-reminder', {headers, cache: 'no-store'});
            if (!response.ok) return;
            const reminder = await response.json();
            if (!reminder.pending || document.getElementById('username-reminder')) return;
            const style = document.createElement('style');
            style.textContent = '#username-reminder{position:fixed;inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;width:min(460px,calc(100vw - 32px));height:auto;max-height:calc(100dvh - 32px);overflow:auto;padding:0;border:0;background:transparent;color:#0f172a}' +
                '#username-reminder::backdrop{background:rgba(15,23,42,.28);backdrop-filter:blur(8px)}' +
                '#username-reminder .glass{padding:22px;border-radius:22px;border:1px solid rgba(255,255,255,.62);' +
                'background:linear-gradient(145deg,rgba(255,255,255,.72),rgba(255,255,255,.34)),rgba(248,250,252,.46);' +
                'box-shadow:0 22px 48px rgba(15,23,42,.16),inset 0 1px 0 rgba(255,255,255,.9);' +
                'backdrop-filter:blur(22px) saturate(160%);-webkit-backdrop-filter:blur(22px) saturate(160%)}' +
                '#username-reminder h2{margin:0 0 8px;font-size:20px}#username-reminder p{margin:0;line-height:1.65;color:#334155}' +
                '#username-reminder .actions{display:flex;gap:8px;margin-top:18px}#username-reminder button{flex:1;border-radius:999px;padding:10px 12px;cursor:pointer;font:inherit}' +
                '#username-reminder [data-rename]{border:1px solid rgba(147,197,253,.7);background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(255,255,255,.5));color:#1e3a8a}' +
                '#username-reminder [data-ignore]{border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.28);color:#334155}';
            document.head.appendChild(style);
            const dialog = document.createElement('dialog');
            dialog.id = 'username-reminder';
            dialog.setAttribute('aria-labelledby', 'username-reminder-title');
            dialog.innerHTML = '<div class="glass"><h2 id="username-reminder-title">用户名提醒</h2>' +
                '<p>系统自动检测到当前用户名可能不是本人姓名。建议改为本人姓名或英文名，方便教师查阅练习记录。如果当前用户名无误，请点击忽略。</p>' +
                '<p data-error role="status" style="color:#ad3838;margin-top:8px" hidden></p>' +
                '<div class="actions"><button type="button" data-rename>去修改用户名</button><button type="button" data-ignore>忽略</button></div></div>';
            const error = dialog.querySelector('[data-error]');
            dialog.addEventListener('cancel', event => event.preventDefault());
            dialog.querySelector('[data-rename]').onclick = () => { dialog.close(); dialog.remove(); openRename(); };
            dialog.querySelector('[data-ignore]').onclick = async () => {
                const button = dialog.querySelector('[data-ignore]');
                button.disabled = true; button.textContent = '正在保存…'; error.hidden = true;
                try {
                    const result = await fetch('/api/username-reminder', {method: 'POST', headers,
                        body: JSON.stringify({action: 'dismiss'})});
                    if (!result.ok || (await result.json()).pending) throw Error('not_saved');
                    dialog.close(); dialog.remove();
                } catch (_) {
                    error.textContent = '忽略暂未保存，请重试。'; error.hidden = false;
                    button.disabled = false; button.textContent = '忽略';
                }
            };
            document.body.appendChild(dialog);
            dialog.showModal();
        } catch (_) { /* A reminder must never prevent the site from loading. */ }
    }

    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', showReminder, {once: true});
    else showReminder();
})();
