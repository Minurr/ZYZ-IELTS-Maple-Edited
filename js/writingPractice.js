(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const taskId = params.get('task') || '';
    const review = params.get('review') === '1';

    const essay = $('essay');
    const view = $('essay-view');
    const timer = $('timer');
    const submit = $('submit-btn');
    const countEl = $('word-count');
    const countLine = $('wordcount-line');
    const draftBox = $('draft-box');

    let task = null;
    let remain = 0;
    let paused = false;
    let sending = false;
    let finished = false;
    let expired = false;
    let tick = null;

    const headers = () => ({ 'Content-Type': 'application/json', 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' });
    const words = text => (String(text || '').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u4e00-\u9fff]/g) || []).length;
    const escape = value => String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    function clock(seconds) {
        const total = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(total / 60);
        const rest = total % 60;
        return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
    }

    function grow() {
        essay.style.height = 'auto';
        const height = Math.max(420, essay.scrollHeight + 2);
        essay.style.height = height + 'px';
    }

    function paintCount() {
        const count = words(essay.value);
        const minimum = task && task.minWords ? task.minWords : 0;
        countEl.textContent = count;
        countLine.classList.toggle('is-short', !finished && count <= 100);
        countLine.classList.toggle('is-low', !finished && count > 100 && minimum && count < minimum);
        const note = $('word-note');
        if (note && !finished) {
            if (count <= 100) note.textContent = '100 词以内不能提交';
            else if (minimum && count < minimum) note.textContent = '建议至少 ' + minimum + ' 词，仍可提交';
            else note.textContent = '';
        }
        if (!finished) submit.disabled = count <= 100;
        grow();
    }

    function showSubmitted(count) {
        finished = true;
        clearInterval(tick);
        submit.hidden = true;
        submit.disabled = true;
        essay.readOnly = true;
        timer.textContent = '已提交';
        timer.classList.remove('is-low', 'paused');
        $('footer-min').textContent = '已提交';
        $('exit-btn').textContent = '返回';
        countLine.classList.remove('is-short', 'is-low');
        const note = $('word-note');
        if (note) note.textContent = '';
        draftBox.hidden = true;
        essay.hidden = true;
        view.hidden = false;
        view.classList.add('is-visible');
        const banner = document.createElement('p');
        banner.className = 'wr-submitted';
        banner.textContent = '已提交 · ' + count + ' 词 · 等待老师批改';
        const body = document.createElement('div');
        body.className = 'wr-submitted-text';
        body.textContent = essay.value;
        view.replaceChildren(banner, body);
    }

    function paintFeedback(mark, text) {
        if (!mark) return;
        $('feedback-box').hidden = false;
        const scores = [['Overall', mark.overall], ['TA/TR', mark.ta], ['CC', mark.cc], ['LR', mark.lr], ['GRA', mark.gra]]
            .filter(item => item[1] != null)
            .map(item => item[0] + ' ' + item[1]);
        $('feedback-scores').textContent = scores.join(' · ') || '已批改';
        $('feedback-comment').textContent = mark.comment || '';

        draftBox.hidden = true;
        countLine.hidden = true;
        essay.hidden = true;
        view.hidden = false;
        view.classList.add('is-visible');
        view.replaceChildren();

        const marks = (mark.annotations || [])
            .filter(item => item && Number.isFinite(Number(item.from)) && Number.isFinite(Number(item.to)) && Number(item.to) > Number(item.from))
            .map(item => ({
                kind: ['replace', 'delete'].includes(item.kind) ? item.kind : 'comment',
                from: Number(item.from), to: Number(item.to),
                note: String(item.note || ''), replacement: String(item.replacement || '')
            }))
            .sort((a, b) => a.from - b.from);
        let cursor = 0;
        const body = document.createDocumentFragment();
        const pushText = value => { if (value) body.append(document.createTextNode(value)); };
        marks.forEach((item, index) => {
            const from = Math.max(cursor, item.from);
            const to = Math.min((text || '').length, item.to);
            if (to <= from) return;
            pushText((text || '').slice(cursor, from));
            const span = document.createElement('span');
            span.className = 'wr-hl ' + (item.kind === 'replace' ? 'wr-rep' : item.kind === 'delete' ? 'wr-del' : 'wr-mark');
            span.dataset.no = String(index + 1);
            span.textContent = (text || '').slice(from, to);
            body.append(span);
            cursor = to;
        });
        pushText((text || '').slice(cursor));
        const banner = document.createElement('p');
        banner.className = 'wr-submitted';
        banner.textContent = '已提交 · ' + words(text) + ' 词' + (mark.overall != null ? ' · 总分 ' + mark.overall : ' · 已批改');
        view.append(banner, body);

        if (!marks.length) return;
        const list = document.createElement('div');
        list.className = 'wr-note-list';
        marks.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'wr-note-card';
            const top = document.createElement('div');
            top.className = 'wr-note-top';
            const no = document.createElement('span');
            no.className = 'wr-note-no';
            no.textContent = String(index + 1);
            top.append(no, document.createTextNode(item.kind === 'replace' ? '替换' : item.kind === 'delete' ? '建议删除' : '批注'));
            const quote = document.createElement('p');
            quote.className = 'wr-note-quote';
            quote.textContent = '“' + (text || '').slice(item.from, Math.min(item.to, item.from + 90)) + ((item.to - item.from) > 90 ? '…' : '') + '”';
            card.append(top, quote);
            if (item.note) {
                const note = document.createElement('p');
                note.textContent = item.note;
                card.append(note);
            }
            if (item.kind === 'replace' && item.replacement) {
                const repl = document.createElement('p');
                repl.textContent = '改为：' + item.replacement;
                card.append(repl);
            }
            list.append(card);
        });
        view.append(list);
    }

    function setSettings(open) {
        const panel = $('settings-panel');
        panel.classList.toggle('is-open', open);
        $('settings-btn').setAttribute('aria-expanded', String(open));
    }

    function leave() {
        if (window.parent !== window) window.parent.postMessage({ type: finished ? 'WRITING_DONE' : 'WRITING_EXIT', taskId }, '*');
    }

    async function saveDraft() {
        if (review || finished) return;
        await fetch('/api/writing/save', {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ id: taskId, text: essay.value })
        }).catch(() => {});
    }

    async function send(manual) {
        if (sending || review || finished) return;
        const count = words(essay.value);
        if (count <= 100) {
            paintCount();
            return;
        }
        if (manual && task && count < task.minWords && !confirm('现在 ' + count + ' 词，建议至少 ' + task.minWords + ' 词。仍要提交吗？')) return;
        sending = true;
        submit.disabled = true;
        try {
            const response = await fetch('/api/writing/submit', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ id: taskId, text: essay.value })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '提交失败');
            showSubmitted(data.wordCount);
        } catch (error) {
            sending = false;
            const note = $('word-note');
            if (note) note.textContent = error.message || '提交失败';
            if (manual) alert(error.message || '提交失败');
            paintCount();
        }
    }

    function windowLeft() {
        if (!task || !task.endAt) return Infinity;
        const end = new Date(task.endAt).getTime();
        if (!Number.isFinite(end)) return Infinity;
        return Math.floor((end - Date.now()) / 1000);
    }

    function expire() {
        if (expired || finished || review) return;
        expired = true;
        timer.textContent = clock(0);
        timer.classList.add('is-low');
        if (words(essay.value) > 100) send(false);
        else {
            const note = $('word-note');
            if (note) note.textContent = windowLeft() <= 0 ? '任务已结束，100 词以内不能提交' : '时间到了，写满 101 词后再提交';
        }
    }

    function arm() {
        clearInterval(tick);
        tick = setInterval(() => {
            if (finished || review || paused) return;
            remain -= 1;
            timer.textContent = clock(remain);
            timer.classList.toggle('is-low', remain <= 60);
            if (remain <= 0 || windowLeft() <= 0) expire();
        }, 1000);
    }

    $('settings-btn').onclick = () => setSettings(!$('settings-panel').classList.contains('is-open'));
    $('options-close-btn').onclick = () => setSettings(false);
    document.querySelectorAll('[data-size]').forEach(button => {
        button.onclick = () => {
            document.documentElement.classList.remove('font-small', 'font-normal', 'font-large');
            document.documentElement.classList.add('font-' + button.dataset.size);
            document.querySelectorAll('[data-size]').forEach(el => el.classList.toggle('active', el === button));
        };
    });
    document.querySelectorAll('[data-mode]').forEach(button => {
        button.onclick = () => {
            document.body.classList.toggle('dark-mode', button.dataset.mode === 'dark');
            document.querySelectorAll('[data-mode]').forEach(el => el.classList.toggle('active', el === button));
        };
    });

    timer.onclick = () => {
        if (review || finished) return;
        paused = !paused;
        timer.classList.toggle('paused', paused);
    };

    $('exit-btn').onclick = async () => {
        if (review || finished) {
            leave();
            return;
        }
        await saveDraft();
        if (!confirm('已保存草稿。退出后仍可在截止时间前继续作答。确定退出？')) return;
        if (window.parent !== window) window.parent.postMessage({ type: 'WRITING_EXIT', taskId }, '*');
    };

    essay.addEventListener('input', paintCount);
    addEventListener('resize', () => { if (!essay.hidden) grow(); });
    submit.onclick = () => send(true);

    const divider = $('divider');
    if (divider) {
        const shell = document.querySelector('.shell');
        const move = event => {
            const rect = shell.getBoundingClientRect();
            const ratio = Math.min(0.8, Math.max(0.2, (event.clientX - rect.left) / rect.width));
            shell.style.setProperty('--reading-left-pane-width', Math.round(ratio * 100) + '%');
            divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
        };
        divider.addEventListener('pointerdown', event => {
            divider.setPointerCapture(event.pointerId);
            divider.classList.add('is-dragging');
            const drag = moveEvent => move(moveEvent);
            const stopDrag = () => {
                divider.classList.remove('is-dragging');
                divider.removeEventListener('pointermove', drag);
                divider.removeEventListener('pointerup', stopDrag);
                divider.removeEventListener('pointercancel', stopDrag);
            };
            divider.addEventListener('pointermove', drag);
            divider.addEventListener('pointerup', stopDrag);
            divider.addEventListener('pointercancel', stopDrag);
        });
    }

    (async function load() {
        const response = await fetch('/api/writing/task?id=' + encodeURIComponent(taskId) + (review ? '&review=1' : ''), {
            headers: { 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' }, cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok) {
            $('task-title').textContent = data.error || '无法打开这篇作文';
            submit.disabled = true;
            return;
        }
        task = data.task;
        $('candidate-id').textContent = data.name || '';
        $('task-title').textContent = task.title;
        $('task-prompt').textContent = task.prompt;
        $('sub-header-part').textContent = task.kind === 'task1' ? 'Task 1' : 'Task 2';
        $('sub-header-instruction').textContent = 'Write at least ' + task.minWords + ' words.';
        $('footer-part').textContent = task.kind === 'task1' ? 'Task 1' : 'Task 2';
        $('footer-min').textContent = '至少 ' + task.minWords + ' 词';
        if (task.imageId) {
            const image = $('task-image');
            image.hidden = true;
            image.onload = () => { image.hidden = false; };
            image.onerror = () => { image.hidden = true; image.removeAttribute('src'); };
            image.src = '/writing-image/' + encodeURIComponent(task.imageId);
        }
        if (task.text) essay.value = task.text;
        paintCount();
        requestAnimationFrame(grow);

        if (review || task.mine?.submitted) {
            showSubmitted(task.wordCount || words(task.text || ''));
            paintFeedback(task.feedback, task.text || '');
            return;
        }

        const start = await fetch('/api/writing/start', {
            method: 'POST', headers: headers(), body: JSON.stringify({ id: taskId })
        });
        const started = await start.json();
        if (!start.ok) {
            alert(started.error || '无法开始');
            submit.disabled = true;
            return;
        }
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(started.startedAt).getTime()) / 1000));
        remain = Math.max(0, task.minutes * 60 - elapsed);
        timer.textContent = clock(remain);
        arm();
        setInterval(saveDraft, 15000);
        if (remain <= 0 || windowLeft() <= 0) expire();
    })().catch(error => {
        $('task-title').textContent = error.message || '加载失败';
    });
})();
