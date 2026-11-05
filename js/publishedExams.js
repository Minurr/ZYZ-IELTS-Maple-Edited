(function () {
    'use strict';
    const host = document.createElement('section');
    host.id = 'published-exams';
    host.hidden = true;
    const overview = document.getElementById('overview-view');
    if (!overview) return;
    overview.prepend(host);
    const style = document.createElement('style');
    style.textContent = `
#published-exams[hidden]{display:none}
#published-exams{margin:0 0 18px;padding:18px 18px 8px;border:1px solid rgba(255,255,255,.58);border-radius:28px;background:rgba(255,255,255,.22);box-shadow:0 24px 54px rgba(15,23,42,.12);backdrop-filter:blur(24px) saturate(145%);-webkit-backdrop-filter:blur(24px) saturate(145%)}
#published-exams h2{margin:0 0 8px;font-size:18px}
#published-exams article{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin:0 0 10px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.42);border:1px solid rgba(255,255,255,.55)}
#published-exams h3{margin:0 0 4px;font-size:16px}
#published-exams p{margin:0;color:#3e5850}
#published-exams button{border:0;border-radius:999px;padding:10px 16px;background:rgba(8,126,102,.92);color:#fff;cursor:pointer}
#published-exams button[disabled]{background:rgba(154,171,180,.85);cursor:default}
#exam-sitting{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#e7f1ec}
#exam-sitting header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:rgba(255,255,255,.55);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%)}
#exam-sitting iframe{flex:1;width:100%;min-height:0;border:0;background:#fff}
#exam-sitting .sheet{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:24px}
#exam-sitting .glass{width:min(720px,100%);margin:0 auto 24px;padding:28px;border-radius:28px;border:1px solid rgba(255,255,255,.62);background:rgba(255,255,255,.38);box-shadow:0 24px 54px rgba(15,23,42,.12);backdrop-filter:blur(24px) saturate(145%);-webkit-backdrop-filter:blur(24px) saturate(145%)}
#exam-sitting .score{font-size:42px;margin:8px 0;font-variant-numeric:tabular-nums}
#exam-sitting table{width:100%;border-collapse:collapse;font-size:14px}
#exam-sitting td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.55)}
#exam-sitting tr.miss td{color:#9a3412}
#exam-sitting .actions{display:flex;gap:8px;margin-top:16px}
#exam-sitting button{border:0;border-radius:999px;padding:8px 14px;background:rgba(8,126,102,.92);color:#fff;cursor:pointer}
`;
    document.head.append(style);
    const READING_BAND = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
    const LISTENING_BAND = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
    let exams = [], clockOffset = 0, openedFullscreen = false, sitting = null;
    const headers = () => ({ 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' });
    function node(tag, text, cls) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; }
    function when(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
    function stateOf(exam, now) { if (now < new Date(exam.startAt)) return 'waiting'; if (now > new Date(exam.endAt)) return 'closed'; return 'open'; }
    function heldSuite(exam) { return exam.mode === 'suite' && (exam.papers || []).length >= 2; }
    function fullLength(exam) { return exam.subject === 'listening' ? 4 : 3; }
    function bandLabel(subject, correct) {
        const table = subject === 'listening' ? LISTENING_BAND : READING_BAND;
        const score = Math.max(0, Math.min(40, Number(correct) || 0));
        for (const [minimum, value] of table) if (score >= minimum) return value.toFixed(1);
        return '低于 2.5';
    }
    function reviewKey(id) { return 'ielts-exam-review:' + id; }
    function saveReview(id, papers) {
        try { localStorage.setItem(reviewKey(id), JSON.stringify(papers)); } catch (_) {}
    }
    function loadReview(id) {
        try { return JSON.parse(localStorage.getItem(reviewKey(id)) || 'null'); } catch (_) { return null; }
    }
    function resultLine(exam, mine) {
        if (!mine.submitted) return '';
        if (exam.mode === 'suite' && mine.band?.label) return ' · 雅思 ' + mine.band.label;
        if (exam.mode !== 'suite' && mine.accuracy != null) return ' · 正确率 ' + mine.accuracy + '%';
        return '';
    }
    function paint() {
        const now = new Date(Date.now() + clockOffset);
        host.replaceChildren(node('h2', '考试'));
        for (const exam of exams) {
            const state = stateOf(exam, now);
            const mine = exam.mine || {};
            const article = document.createElement('article');
            const copy = node('div');
            copy.append(node('h3', exam.title));
            const kind = (exam.subject === 'reading' ? '阅读' : '听力') + ' · ' + (exam.mode === 'suite' ? '套题 ' + (exam.papers || []).length + ' 篇' : '散篇');
            let progress = '';
            if (exam.mode === 'suite' && mine.submitted && mine.submitted < mine.papers) progress = ' · 已交 ' + mine.submitted + '/' + mine.papers;
            copy.append(node('p', kind + ' · ' + when(exam.startAt) + ' – ' + when(exam.endAt) + progress + resultLine(exam, mine)));
            article.append(copy);
            const done = mine.submitted && mine.submitted === mine.papers;
            const status = mine.paperStatus || (exam.papers || []).map(paper => ({ ...paper, submitted: false }));
            const next = status.find(paper => !paper.submitted) || status[0];
            const action = node('button', state === 'waiting' ? '未开始' : state === 'closed' && !done ? '已结束' : done ? (heldSuite(exam) ? '查看成绩' : '已完成') : mine.submitted ? '继续' : '开始考试');
            action.disabled = state === 'waiting' || (state === 'closed' && !done) || (done && !heldSuite(exam));
            if (!action.disabled) action.onclick = () => done ? showStoredScore(exam) : beginSitting(exam, status);
            article.append(action);
            host.append(article);
        }
        host.hidden = exams.length === 0;
    }
    async function ensureOpener() {
        if (!window.app?.openExam) {
            try { await window.AppLazyLoader?.ensureGroup?.('browse-runtime'); } catch (_) {}
        }
        return window.app;
    }
    async function begin(exam, paper) {
        const opener = await ensureOpener();
        if (!opener?.openExam || !paper) { alert('练习页面还在加载，请稍后再开始'); return; }
        if (timeLeft(exam) <= 0) { alert('考试时间已到'); return; }
        const root = document.documentElement;
        try {
            const request = root.requestFullscreen?.() || root.webkitRequestFullscreen?.();
            if (request) { await request; openedFullscreen = true; }
        } catch (_) {}
        setExamFloaters(true);
        try { await opener.openExam(paper.id, { forceEmbeddedPractice: true }); }
        catch (error) { setExamFloaters(false); alert(error?.message || '暂时无法打开考试'); return; }
        armDeadline(exam, () => document.querySelector('#embedded-practice-overlay iframe'));
    }
    function readingUrl(id, publicationId) {
        const params = new URLSearchParams({ examId: id, dataKey: id, independentPractice: '1', publishedHold: '1', publishedExam: publicationId || '' });
        if (window.IELTS_ASSET_VERSION) params.set('v', window.IELTS_ASSET_VERSION);
        return '/assets/generated/reading-exams/reading-practice-unified.html?' + params.toString();
    }
    function closeSitting() {
        if (sitting?.deadline) clearInterval(sitting.deadline);
        sitting?.overlay.remove();
        sitting = null;
        setExamFloaters(false);
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        refresh();
    }
    function setExamFloaters(hidden) {
        const feedback = document.getElementById('feedback-entry-btn');
        if (feedback) feedback.hidden = hidden;
        document.querySelectorAll('body > div').forEach(el => {
            if (el.id !== 'exam-sitting' && el.textContent.includes('退出登录')) el.hidden = hidden;
        });
    }
    function timeLeft(exam) { return new Date(exam.endAt).getTime() - (Date.now() + clockOffset); }
    function clickSubmit(frame) {
        const doc = frame?.contentDocument;
        if (!doc) return false;
        const button = doc.getElementById('submit-btn') || doc.getElementById('ls-submit') || doc.getElementById('finish-btn');
        if (button) { button.click(); return true; }
        const inner = doc.querySelector('iframe')?.contentDocument;
        const nested = inner?.getElementById('finish-btn') || inner?.getElementById('submit-btn');
        if (nested) { nested.click(); return true; }
        return false;
    }
    function armDeadline(exam, frameOf) {
        let attemptedAt = 0;
        const locked = new WeakSet();
        const tick = () => {
            const frame = frameOf();
            if (!frame || !frame.isConnected || sitting?.scored) { clearInterval(timer); return; }
            const remaining = timeLeft(exam);
            if (remaining > 0) {
                const clock = sitting?.bar.querySelector('[data-exam-clock]');
                if (clock) clock.textContent = '剩余 ' + Math.ceil(remaining / 60000) + ' 分钟';
                return;
            }
            if (sitting) {
                sitting.expired = true;
                if (sitting.bar?.firstChild) sitting.bar.firstChild.textContent = '时间已到，正在保存作答，请保留此页面';
            }
            const lock = doc => {
                if (!doc || locked.has(doc)) return;
                locked.add(doc);
                for (const name of ['beforeinput','keydown','pointerdown','touchstart','drop','paste','click']) {
                    doc.addEventListener(name, event => {
                        if (!event.isTrusted) return;
                        if (name === 'keydown' && ['Tab','PageUp','PageDown','ArrowUp','ArrowDown'].includes(event.key)) return;
                        event.preventDefault(); event.stopImmediatePropagation();
                    }, {capture:true,passive:false});
                }
                doc.querySelectorAll('audio,video').forEach(media => media.pause());
            };
            try {
                lock(frame.contentDocument);
                lock(frame.contentDocument?.querySelector('iframe')?.contentDocument);
                if (Date.now() - attemptedAt < 5000) return;
                const submit = frame.contentWindow?.submitPublishedDeadline;
                if (typeof submit !== 'function') return; // A loading page is retried once ready.
                attemptedAt = Date.now();
                Promise.resolve(submit(new Date(exam.endAt).getTime())).catch(() => {});
            } catch (_) {} // Navigation can temporarily replace the frame document.
        };
        const timer = setInterval(tick, 1000);
        return timer;
    }
    function answerTable(papers) {
        const wrap = node('div');
        papers.forEach((paper, index) => {
            wrap.append(node('h3', '第 ' + (index + 1) + ' 篇 · ' + (paper.title || '')));
            const table = document.createElement('table');
            for (const row of paper.rows || []) {
                const line = document.createElement('tr');
                if (!row.ok) line.className = 'miss';
                line.append(node('td', row.label), node('td', row.user || '未作答'), node('td', row.answer || ''));
                table.append(line);
            }
            wrap.append(table);
        });
        return wrap;
    }
    function showScore(exam, papers) {
        if (!sitting || sitting.scored) return;
        sitting.scored = true;
        if (sitting.deadline) clearInterval(sitting.deadline);
        const sessionCorrect = papers.reduce((sum, paper) => sum + (Number(paper.correct) || 0), 0);
        const answered = papers.reduce((sum, paper) => sum + (Number(paper.total) || 0), 0);
        const prior = new Map();
        for (const paper of exam.mine?.paperStatus || []) {
            if (paper.submitted) prior.set(String(paper.id), Number(paper.correct) || 0);
        }
        for (const paper of papers) if (paper.id) prior.set(String(paper.id), Number(paper.correct) || 0);
        const suiteCorrect = prior.size ? [...prior.values()].reduce((sum, value) => sum + value, 0) : sessionCorrect;
        const suite = exam.mode === 'suite';
        const band = suite ? bandLabel(exam.subject, suiteCorrect) : '';
        const glass = node('div', null, 'glass');
        glass.append(node('p', exam.title));
        glass.append(node('p', suite ? '雅思分数' : '正确率'));
        glass.append(node('div', suite ? band : (answered ? Math.round(sessionCorrect / answered * 100) + '%' : '—'), 'score'));
        glass.append(node('p', suite ? '按 40 题计算，答对 ' + suiteCorrect + ' 题，没做的算错' : '答对 ' + sessionCorrect + ' / ' + answered));
        const actions = node('div', null, 'actions');
        const view = node('button', '查看答案');
        view.onclick = () => { glass.append(answerTable(papers)); view.disabled = true; };
        const finish = node('button', '完成');
        finish.onclick = closeSitting;
        actions.append(view, finish);
        glass.append(actions);
        const sheet = node('div', null, 'sheet');
        sheet.append(glass);
        sitting.frame.remove();
        sitting.overlay.append(sheet);
        sitting.bar.textContent = '考试结束';
    }
    function showStoredScore(exam) {
        const papers = loadReview(exam.id);
        if (!papers) { alert('这场考试的答案记录在交卷时使用的浏览器里。'); return; }
        const overlay = node('div'); overlay.id = 'exam-sitting';
        const bar = node('header');
        const leave = node('button', '关闭');
        sitting = { overlay, frame: node('div'), bar, exam, papers, index: 3 };
        leave.onclick = closeSitting;
        bar.append(node('strong', exam.title), leave);
        overlay.append(bar);
        document.body.append(overlay);
        showScore(exam, papers);
    }
    async function beginSitting(exam, status) {
        const pending = status.slice().sort((a, b) => (Number(a.part) || 99) - (Number(b.part) || 99)).filter(paper => !paper.submitted);
        if (!pending.length) { showStoredScore(exam); return; }
        if (timeLeft(exam) <= 0) { alert('考试时间已到'); return; }
        const overlay = node('div'); overlay.id = 'exam-sitting';
        const bar = node('header');
        const leave = node('button', '离开');
        const frame = document.createElement('iframe');
        sitting = { overlay, frame, bar, exam, papers: [], index: 0, queue: pending };
        sitting.deadline = armDeadline(exam, () => frame);
        leave.onclick = () => {
            if (sitting.expired && !sitting.scored) { alert('正在保存考试作答，请等待保存成功后再离开。'); return; }
            if (sitting.papers.length < sitting.queue.length && !confirm('现在离开不会显示答案。已经交上的篇目会保留。')) return;
            closeSitting();
        };
        const clock = node('span'); clock.dataset.examClock = ''; clock.setAttribute('aria-live','off');
        bar.append(node('strong', ''), clock, leave);
        overlay.append(bar, frame);
        document.body.append(overlay);
        setExamFloaters(true);
        try { await overlay.requestFullscreen?.(); } catch (_) {}
        loadPassage();
    }
    function listeningManifest() {
        if (window.__LISTENING_EXAM_MANIFEST__) return Promise.resolve(window.__LISTENING_EXAM_MANIFEST__);
        if (!listeningManifest.promise) {
            listeningManifest.promise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/assets/generated/listening-exams/manifest.js';
                script.onload = () => resolve(window.__LISTENING_EXAM_MANIFEST__ || {});
                script.onerror = () => reject(new Error('听力题库没有加载'));
                document.head.append(script);
            });
        }
        return listeningManifest.promise;
    }
    async function loadPassage() {
        const paper = sitting.queue[sitting.index];
        sitting.advanced = false;
        sitting.bar.firstChild.textContent = '第 ' + (sitting.index + 1) + ' / ' + sitting.queue.length + ' 篇 · 全部完成后才显示分数和答案';
        if (sitting.exam.subject === 'listening') {
            const entry = (await listeningManifest())[paper.id];
            if (!entry) { alert('这篇听力没有找到'); return; }
            const source = new URL('ListeningPractice/' + String(entry.path || '').replace(/^\/+/, '') + entry.filename, location.origin).href;
            const params = new URLSearchParams({ examId: paper.id, sourceUrl: source, publishedHold: '1', publishedExam: sitting.exam.id || '' });
            sitting.frame.src = '/assets/generated/listening-exams/listening-practice-unified.html?' + params.toString();
            return;
        }
        sitting.frame.src = readingUrl(paper.id, sitting.exam.id);
    }
    async function refresh() {
        if (!window.IELTS_ACCOUNT?.id) return;
        try {
            const response = await fetch('/api/exams/mine', { headers: headers(), cache: 'no-store' });
            if (!response.ok) { host.hidden = true; return; }
            const data = await response.json();
            exams = data.exams || [];
            clockOffset = new Date(data.serverNow || Date.now()).getTime() - Date.now();
            paint();
        } catch (_) { host.hidden = true; }
    }
    addEventListener('message', event => {
        if (event.origin !== location.origin) return;
        const data = event.data || {};
        if (data.type === 'PRACTICE_DIRECT_COMMITTED' && !sitting) setTimeout(refresh, 800);
        if (data.type !== 'PUBLISHED_PASSAGE_DONE' || !sitting || sitting.advanced || event.source !== sitting.frame.contentWindow) return;
        const paper = sitting.queue[sitting.index];
        if (!paper || String(data.examId) !== String(paper.id)) return;
        sitting.advanced = true;
        sitting.papers.push({ id: paper.id, title: paper.title, correct: data.correct, total: data.total, rows: data.rows || [] });
        sitting.index += 1;
        if (!sitting.expired && sitting.index < sitting.queue.length && timeLeft(sitting.exam) > 0) loadPassage();
        else { saveReview(sitting.exam.id, sitting.papers); showScore(sitting.exam, sitting.papers); }
    });
    const observer = new MutationObserver(() => {
        if (document.getElementById('exam-sitting') || document.getElementById('embedded-practice-overlay')) return;
        setExamFloaters(false);
        if (openedFullscreen && document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
            openedFullscreen = false;
            refresh();
        }
    });
    observer.observe(document.body, { childList: true });
    refresh();
    setInterval(() => { if (!host.hidden && !sitting) paint(); }, 15000);
    setInterval(() => { if (!document.hidden && !sitting) refresh(); }, 30000);
})();
