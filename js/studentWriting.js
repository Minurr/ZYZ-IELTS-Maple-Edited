(function () {
    'use strict';

    const overview = document.getElementById('overview-view');
    if (!overview) return;

    /* ---------- hosts ---------------------------------------------------- */
    let assigned = document.getElementById('assigned-work');
    if (!assigned) {
        assigned = document.createElement('div');
        assigned.id = 'assigned-work';
        overview.parentNode.insertBefore(assigned, overview);
    }
    const syncAssigned = () => { assigned.hidden = !overview.classList.contains('active'); };
    new MutationObserver(syncAssigned).observe(overview, { attributes: true, attributeFilter: ['class'] });
    syncAssigned();

    const tasksHost = document.createElement('section');
    tasksHost.id = 'published-writing';
    tasksHost.hidden = true;
    assigned.insertBefore(tasksHost, assigned.firstChild);

    const style = document.createElement('style');
    style.textContent = `
#assigned-work{display:grid;gap:16px;margin:0 0 22px}
#assigned-work[hidden]{display:none!important}
#published-writing{position:relative;padding:18px 20px 10px;border-radius:26px;border:1px solid rgba(255,255,255,.58);background:rgba(255,255,255,.24);box-shadow:0 24px 54px rgba(15,23,42,.12);backdrop-filter:blur(24px) saturate(145%);-webkit-backdrop-filter:blur(24px) saturate(145%)}
#published-writing[hidden]{display:none}
#published-writing h2{margin:0 0 10px;font-size:18px;color:#1f3d33}
.wr-task-row{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;margin:0 0 12px;padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.46)}
.wr-task-row h3{margin:0 0 4px;font-size:16px;color:#17332b}
.wr-task-row p{margin:0;font-size:inherit;line-height:1.6;color:#111}
#writing-hub{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:flex-start;justify-content:center;padding:min(6vh,56px) 16px;background:rgba(15,23,42,.28);backdrop-filter:blur(10px) saturate(130%);-webkit-backdrop-filter:blur(10px) saturate(130%)}
#writing-hub[hidden]{display:none}
.wr-hub-card{width:min(1000px,100%);max-height:86vh;overflow:auto;padding:26px 28px 32px;border-radius:26px;border:1px solid rgba(255,255,255,.72);background:linear-gradient(150deg,rgba(255,255,255,.8),rgba(250,253,251,.58));box-shadow:0 40px 100px rgba(15,23,42,.3);backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px) saturate(160%)}
.wr-hub-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 16px}
.wr-hub-head h2{margin:0;font-size:22px;color:#17332b}
.wr-hub-close{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(255,255,255,.85);background:rgba(255,255,255,.5);color:#17332b;font-size:20px;line-height:1;cursor:pointer}
.wr-hub-close:hover{background:rgba(255,255,255,.92)}
.wr-tabs{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}
.wr-tab{border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:8px 18px;background:rgba(255,255,255,.32);color:#0f172a;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 8px 20px rgba(15,23,42,.08);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);transition:background-color .2s ease,box-shadow .2s ease}
.wr-tab:hover{background:rgba(255,255,255,.5)}
.wr-tab.active{background:rgba(255,255,255,.68);border-color:rgba(255,255,255,.88);color:#0f172a;box-shadow:0 10px 26px rgba(15,23,42,.12),inset 0 1px 1px rgba(255,255,255,.95),inset 0 -1px 1px rgba(255,255,255,.4)}
.wr-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:14px 16px;margin:0 0 10px;border-radius:16px;border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.5)}
.wr-row:last-child{margin-bottom:0}
.wr-row h3{margin:0 0 4px;font-size:16px;color:#17332b}
.wr-row p{margin:0;font-size:13px;line-height:1.65;color:#4b6359}
.wr-empty{margin:12px 2px;color:#5b7168;font-size:14px}
.wr-pill{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;font-size:12px;background:#eef4f0;color:#476257;vertical-align:2px}
.wr-pill.live{background:#e6f4ee;color:#087e66}
.wr-pill.wait{background:#fff4df;color:#9a6b00}
.wr-pill.done,.wr-pill.off{background:#f2f2f2;color:#666}
#writing-sitting{position:fixed;inset:0;z-index:2147483000;background:#fff}
#writing-sitting iframe{width:100%;height:100%;border:0;background:#fff}
#overview-writing .category-icon{display:flex;align-items:center;justify-content:center;margin-right:var(--space-lg);color:#33473f;font-size:0;opacity:.8}
#overview-writing .category-icon svg{width:36px;height:36px}
#overview-writing .category-actions .btn{background-image:none!important;background:rgba(255,255,255,.35);border:1px solid rgba(255,255,255,.55);color:#0f172a!important;box-shadow:0 18px 35px rgba(15,23,42,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:var(--shui-radius-sm);padding:10px 18px;font-weight:600;letter-spacing:.02em}
#overview-writing .category-actions .btn:hover:not(:disabled),#overview-writing .category-actions .btn:focus-visible{background:rgba(255,255,255,.5);transform:translateY(-1px);box-shadow:0 22px 45px rgba(15,23,42,.18)}
#overview-writing .category-actions .btn.btn-secondary{background:rgba(255,255,255,.35);border-color:rgba(255,255,255,.55);color:#0f172a!important}
.wr-btn{background-image:none;border:1px solid rgba(255,255,255,.55);border-radius:var(--shui-radius-sm);padding:9px 18px;background:rgba(255,255,255,.35);color:#0f172a;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.02em;box-shadow:0 10px 24px rgba(15,23,42,.08);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);transition:background-color .2s ease,box-shadow .2s ease,transform .2s ease}
.wr-btn:hover:not(:disabled){background:rgba(255,255,255,.52);transform:translateY(-1px);box-shadow:0 16px 30px rgba(15,23,42,.14)}
.wr-btn[disabled]{background:rgba(255,255,255,.16);color:rgba(15,23,42,.42);border-color:rgba(255,255,255,.34);box-shadow:none;cursor:default;backdrop-filter:none;-webkit-backdrop-filter:none}
.wr-task-row .wr-btn{background:rgba(255,255,255,.44);border-color:rgba(255,255,255,.66);color:#0f172a}
`;
    document.head.append(style);

    /* ---------- state ---------------------------------------------------- */
    const headers = () => ({ 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' });
    let tasks = [];
    let history = [];
    let hubTab = 'tasks';
    let hubFilter = '';

    function node(tag, text, cls) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (cls) el.className = cls;
        return el;
    }
    const ICONS = {
        pen: '<path d="M4 20h4l9.5-9.5a2.83 2.83 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>',
        chart: '<path d="M4 20h16"/><path d="M7.5 20v-6"/><path d="M12 20V7.5"/><path d="M16.5 20v-9"/>',
        book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v17H6.5a2 2 0 0 0-2 2v-17Z"/><path d="M8 8h7"/><path d="M8 12h7"/>'
    };
    function icon(name) {
        const el = node('div', null, 'category-icon');
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + (ICONS[name] || ICONS.pen) + '</svg>';
        return el;
    }
    function when(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        });
    }
    const kindName = kind => kind === 'task1' ? '小作文 Task 1' : '大作文 Task 2';
    function phase(task) {
        if (task.cancelled) return ['已撤回', 'off'];
        const now = Date.now();
        if (now < new Date(task.startAt).getTime()) return ['未开始', 'wait'];
        if (now > new Date(task.endAt).getTime()) return ['已结束', 'done'];
        return ['进行中', 'live'];
    }

    /* ---------- assignment strip (outside the overview panel) ------------ */
    function paintTasks() {
        tasksHost.replaceChildren();
        if (!tasks.length) { tasksHost.hidden = true; return; }
        tasksHost.hidden = false;
        const head = node('h2', '写作任务');
        tasksHost.append(head);
        for (const task of tasks) {
            const [label, status] = phase(task);
            const row = node('article', null, 'wr-task-row');
            const copy = node('div');
            const title = node('h3', task.title);
            title.append(node('span', label, 'wr-pill ' + status));
            copy.append(title);
            const done = task.mine?.submitted;
            const result = task.feedback && task.feedback.published
                ? '已批改 · 总分 ' + (task.feedback.overall ?? '-')
                : done ? '已提交，等老师批改' : '';
            copy.append(node('p', kindName(task.kind) + ' · ' + task.minutes + ' 分钟 · 至少 ' + task.minWords + ' 词 · ' + when(task.startAt) + ' – ' + when(task.endAt)));
            if (result) copy.append(node('p', result));
            const action = node('button', done ? (task.feedback ? '查看反馈' : '查看作文') : label === '未开始' ? '未开始' : label === '已结束' ? '已结束' : '开始写作', 'wr-btn');
            action.type = 'button';
            const blocked = !done && (label === '未开始' || label === '已结束');
            action.disabled = blocked;
            if (!blocked) action.onclick = () => openPaper(task.id, done);
            row.append(copy, action);
            tasksHost.append(row);
        }
    }

    /* ---------- writing module inside the overview grid ------------------ */
    function ensureSection() {
        const grid = document.getElementById('category-overview');
        if (!grid) return null;
        let section = document.getElementById('overview-writing');
        if (!section) {
            section = document.createElement('div');
            section.id = 'overview-writing';
            section.style.display = 'contents';
        }
        if (section.parentNode !== grid) grid.append(section);
        return section;
    }

    function paintModule() {
        const section = ensureSection();
        if (!section) return;
        section.replaceChildren();
        const title = node('h3', null, 'overview-section-title');
        title.append(node('span', '写作', 'overview-section-label'));
        section.append(title);
        const counts = {
            task1: history.filter(item => item.kind === 'task1').length,
            task2: history.filter(item => item.kind === 'task2').length
        };
        const known = {
            task1: tasks.filter(item => item.kind === 'task1' && !item.cancelled),
            task2: tasks.filter(item => item.kind === 'task2' && !item.cancelled)
        };
        [['task1', '小作文 Task 1'], ['task2', '大作文 Task 2']].forEach(([kind, name]) => {
            const card = node('div', null, 'category-card');
            const header = node('div', null, 'category-header');
            header.append(icon(kind === 'task1' ? 'chart' : 'pen'));
            const copy = node('div');
            const pending = known[kind].filter(item => !item.mine?.submitted).length;
            copy.append(node('div', name, 'category-title'));
            copy.append(node('div', counts[kind] + ' 篇 · 目标 ' + (kind === 'task1' ? '150' : '250') + ' 词' + (pending ? ' · ' + pending + ' 个进行中' : ''), 'category-meta'));
            header.append(copy);
            const actions = node('div', null, 'category-actions');
            actions.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:nowrap';
            const open = node('button', '查看记录', 'btn btn-secondary');
            open.type = 'button';
            open.onclick = () => openHub('history', kind);
            const start = node('button', '写作任务', 'btn');
            start.type = 'button';
            start.onclick = () => openHub('tasks', '');
            actions.append(open, start);
            card.append(header, actions);
            section.append(card);
        });
    }

    /* ---------- hub ------------------------------------------------------ */
    let hub = null;
    function openHub(tab, filter) {
        hubTab = tab || 'tasks';
        hubFilter = filter || '';
        if (!hub) {
            hub = node('div');
            hub.id = 'writing-hub';
            const card = node('div', null, 'wr-hub-card');
            const head = node('div', null, 'wr-hub-head');
            const close = node('button', '×', 'wr-hub-close');
            close.type = 'button';
            close.setAttribute('aria-label', '关闭');
            close.onclick = () => { hub.hidden = true; };
            head.append(node('h2', '写作'), close);
            const tabs = node('div', null, 'wr-tabs');
            tabs.id = 'wr-tabs';
            const body = node('div');
            body.id = 'wr-hub-body';
            card.append(head, tabs, body);
            hub.append(card);
            hub.addEventListener('click', event => { if (event.target === hub) hub.hidden = true; });
            document.body.append(hub);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && hub && !hub.hidden) hub.hidden = true;
            });
        }
        hub.hidden = false;
        paintHub();
    }

    function paintHub() {
        if (!hub) return;
        const tabs = hub.querySelector('#wr-tabs');
        const body = hub.querySelector('#wr-hub-body');
        tabs.replaceChildren();
        [['tasks', '写作任务'], ['history', '写作记录']].forEach(([value, label]) => {
            const tab = node('button', label, 'wr-tab' + (hubTab === value ? ' active' : ''));
            tab.type = 'button';
            tab.onclick = () => { hubTab = value; paintHub(); };
            tabs.append(tab);
        });
        body.replaceChildren();

        if (hubTab === 'tasks') {
            if (!tasks.length) { body.append(node('p', '目前没有写作任务。', 'wr-empty')); return; }
            for (const task of tasks) {
                const [label, status] = phase(task);
                const row = node('div', null, 'wr-row');
                const copy = node('div');
                const title = node('h3', task.title);
                title.append(node('span', label, 'wr-pill ' + status));
                copy.append(title, node('p', kindName(task.kind) + ' · ' + task.minutes + ' 分钟 · 至少 ' + task.minWords + ' 词 · ' + when(task.startAt) + ' – ' + when(task.endAt)));
                const done = task.mine?.submitted;
                if (done) copy.append(node('p', task.feedback ? '已批改 · 总分 ' + (task.feedback.overall ?? '-') : '已提交，等老师批改'));
                const action = node('button', done ? (task.feedback ? '查看反馈' : '查看作文') : label === '未开始' ? '未开始' : label === '已结束' ? '已结束' : '开始写作', 'wr-btn');
                action.type = 'button';
                const blocked = !done && (label === '未开始' || label === '已结束');
                action.disabled = blocked;
                if (!blocked) action.onclick = () => openPaper(task.id, done);
                row.append(copy, action);
                body.append(row);
            }
            return;
        }

        const chips = node('div', null, 'wr-tabs');
        [['', '全部'], ['task1', '小作文'], ['task2', '大作文']].forEach(([value, label]) => {
            const chip = node('button', label, 'wr-tab' + (hubFilter === value ? ' active' : ''));
            chip.type = 'button';
            chip.onclick = () => { hubFilter = value; paintHub(); };
            chips.append(chip);
        });
        body.append(chips);
        const rows = hubFilter ? history.filter(item => item.kind === hubFilter) : history;
        if (!rows.length) { body.append(node('p', '还没有提交过的作文。', 'wr-empty')); return; }
        for (const item of rows) {
            const row = node('div', null, 'wr-row');
            const copy = node('div');
            copy.append(node('h3', item.title || kindName(item.kind)));
            const score = item.feedback
                ? (item.feedback.overall != null ? '总分 ' + item.feedback.overall : '已批改')
                : '待批改';
            copy.append(node('p', kindName(item.kind) + ' · ' + item.wordCount + ' 词 · ' + when(item.submittedAt) + ' · ' + score));
            const open = node('button', item.feedback ? '查看反馈' : '查看作文', 'wr-btn');
            open.type = 'button';
            open.onclick = () => openPaper(item.taskId, true);
            row.append(copy, open);
            body.append(row);
        }
    }

    /* ---------- paper ---------------------------------------------------- */
    function openPaper(taskId, review) {
        if (review) {
            location.href = '/assets/generated/writing/writing-review.html?task=' + encodeURIComponent(taskId);
            return;
        }
        document.getElementById('writing-sitting')?.remove();
        const overlay = node('div');
        overlay.id = 'writing-sitting';
        const frame = document.createElement('iframe');
        const params = new URLSearchParams({ task: taskId, v: '20261108-submit-view' });
        frame.src = '/assets/generated/writing/writing-practice.html?' + params.toString();
        overlay.append(frame);
        document.body.append(overlay);
        overlay.requestFullscreen?.().catch(() => {});
        const onMessage = event => {
            if (event.source !== frame.contentWindow) return;
            if (event.data?.type === 'WRITING_DONE' || event.data?.type === 'WRITING_EXIT') {
                removeEventListener('message', onMessage);
                overlay.remove();
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                refresh();
            }
        };
        addEventListener('message', onMessage);
    }

    /* ---------- data ----------------------------------------------------- */
    async function refresh() {
        try {
            const [mineResponse, historyResponse] = await Promise.all([
                fetch('/api/writing/mine', { headers: headers(), cache: 'no-store' }),
                fetch('/api/writing/history', { headers: headers(), cache: 'no-store' })
            ]);
            if (!mineResponse.ok || !historyResponse.ok) throw new Error('unavailable');
            const mine = await mineResponse.json();
            const past = await historyResponse.json();
            tasks = mine.tasks || [];
            history = past.items || [];
            paintTasks();
            paintModule();
            if (hub && !hub.hidden) paintHub();
        } catch (_) {
            tasksHost.hidden = true;
        }
    }

    refresh();
    setInterval(refresh, 60000);

    const grid = document.getElementById('category-overview');
    if (grid) {
        new MutationObserver(() => {
            if (!document.getElementById('overview-writing')) paintModule();
        }).observe(grid, { childList: true });
    }
})();
