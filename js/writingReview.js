(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const taskId = params.get('task') || '';
    const headers = { 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' };
    const KIND = { replace: '替换', delete: '删除', comment: '批注' };

    function text(tag, value, cls) {
        const el = document.createElement(tag);
        if (value != null) el.textContent = value;
        if (cls) el.className = cls;
        return el;
    }

    function when(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function kindName(kind) {
        return kind === 'task1' ? '小作文 Task 1' : '大作文 Task 2';
    }

    function fail(message) {
        $('rv-loading').hidden = false;
        $('rv-loading').classList.add('is-error');
        $('rv-loading').textContent = message;
        $('rv-main').hidden = true;
    }

    $('rv-back').onclick = () => {
        if (history.length > 1) history.back();
        else location.href = '/';
    };

    /* ---- brand: same pixel-letter cycle as index ---- */
    (function brand() {
        const heading = document.querySelector('.pixel-heading');
        if (!heading) return;
        const letters = Array.from(heading.querySelectorAll('.px'));
        const count = 5;
        const tick = 50;
        const cycle = 340;
        const stagger = 200;
        let ms = 0;
        const paint = () => letters.forEach((letter, index) => {
            const elapsed = Math.max(0, ms - index * stagger);
            letter.dataset.font = String((index + Math.floor(elapsed / cycle)) % count);
        });
        paint();
        setInterval(() => { ms += tick; paint(); }, tick);
        heading.addEventListener('pointerenter', () => { ms = 0; paint(); });
    })();

    /* ---- zoom ---- */
    function zoom(source) {
        const box = $('rv-zoom');
        $('rv-zoom-image').src = source;
        box.hidden = false;
    }
    $('rv-zoom').addEventListener('click', () => { $('rv-zoom').hidden = true; });
    addEventListener('keydown', event => { if (event.key === 'Escape') $('rv-zoom').hidden = true; });

    /* ---- essay ---- */
    function marksOf(feedback) {
        return (feedback?.annotations || [])
            .filter(item => item && Number.isFinite(Number(item.from)) && Number.isFinite(Number(item.to)) && Number(item.to) > Number(item.from))
            .map(item => ({
                kind: ['replace', 'delete'].includes(item.kind) ? item.kind : 'comment',
                from: Number(item.from),
                to: Number(item.to),
                note: String(item.note || ''),
                replacement: String(item.replacement || '')
            }))
            .sort((a, b) => a.from - b.from || a.to - b.to);
    }

    function paintEssay(essay, marks) {
        const host = $('rv-essay');
        host.replaceChildren();
        const body = document.createDocumentFragment();
        const total = essay.length;
        const painted = new Set();
        const items = marks.map((mark, index) => ({
            mark, index,
            from: Math.max(0, Math.min(total, mark.from)),
            to: Math.max(0, Math.min(total, mark.to))
        })).filter(item => item.to > item.from);

        const stops = new Set([0, total]);
        items.forEach(item => { stops.add(item.from); stops.add(item.to); });
        const cuts = [...stops].sort((a, b) => a - b);

        // 被其他标记覆盖的批注：它的每一段都要画同一条底线，才能连成一条。
        const bridged = new Set();
        items.forEach(a => {
            if (a.mark.kind !== 'comment') return;
            if (items.some(b => b !== a && a.from < b.to && a.to > b.from)) bridged.add(a.index);
        });

        function span(item, text, wraps, child) {
            const mark = item.mark;
            const host = document.createElement('span');
            host.className = 'rv-hl kind-' + (mark.kind === 'comment' ? 'note' : mark.kind) + (wraps ? ' has-inner' : '');
            host.dataset.index = String(item.index);
            if (!painted.has(item.index)) {
                painted.add(item.index);
                host.dataset.no = String(item.index + 1);
            }
            if (mark.kind === 'replace' && mark.replacement) host.dataset.replacement = mark.replacement;
            if (child) host.append(child);
            else host.textContent = text;
            return host;
        }

        for (let i = 0; i < cuts.length - 1; i += 1) {
            const from = cuts[i];
            const to = cuts[i + 1];
            if (to <= from) continue;
            const text = essay.slice(from, to);
            const covering = items.filter(item => item.from <= from && item.to >= to);
            if (!covering.length) { body.append(document.createTextNode(text)); continue; }
            const stack = covering.slice().sort((a, b) => {
                const outer = (a.mark.kind === 'comment' ? 0 : 1) - (b.mark.kind === 'comment' ? 0 : 1);
                return outer || (b.to - b.from) - (a.to - a.from);
            });
            let node = null;
            for (let index = stack.length - 1; index >= 0; index -= 1) {
                node = span(stack[index], node ? null : text, Boolean(node), node);
            }
            if (node && bridged.has(stack[0].index)) {
                node.classList.add('is-bridge');
            }
            body.append(node);
        }
        if (!essay.trim()) body.append(document.createTextNode('（这份作答没有内容）'));
        host.append(body);
    }

    function paintSide(feedback, essay, marks) {
        const list = $('rv-list');
        list.replaceChildren();
        const summary = $('rv-summary');
        if (feedback?.comment) {
            summary.hidden = false;
            $('rv-summary-text').textContent = feedback.comment;
        } else {
            summary.hidden = true;
        }

        if (!marks.length) {
            $('rv-empty').hidden = false;
            $('rv-empty').textContent = feedback ? '老师这次没有留下逐句批注。' : '老师还没有发布批改，提交后的作文会显示在这里。';
            return;
        }
        $('rv-empty').hidden = true;

        marks.forEach((mark, index) => {
            const item = text('li', null, 'rv-item');
            item.dataset.index = String(index);
            const top = text('div', null, 'rv-item-top');
            top.append(text('span', String(index + 1), 'rv-item-no'), text('span', KIND[mark.kind], 'rv-item-kind kind-' + mark.kind));
            item.append(top);
            const quote = text('p', '“' + essay.slice(mark.from, Math.min(mark.to, mark.from + 90)) + (mark.to - mark.from > 90 ? '…' : '') + '”', 'rv-item-quote');
            item.append(quote);
            if (mark.note) item.append(text('p', mark.note, 'rv-item-note'));
            if (mark.kind === 'replace' && mark.replacement) item.append(text('p', '改为：' + mark.replacement, 'rv-item-repl'));
            item.addEventListener('click', () => focus(index));
            list.append(item);
        });
    }

    function focus(index) {
        const spans = document.querySelectorAll('.rv-hl[data-index="' + index + '"]');
        const item = document.querySelector('.rv-item[data-index="' + index + '"]');
        spans[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (item && item.getBoundingClientRect().top < 60) item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        spans.forEach(span => span.classList.add('is-focus'));
        item?.classList.add('is-focus');
        setTimeout(() => {
            spans.forEach(span => span.classList.remove('is-focus'));
            item?.classList.remove('is-focus');
        }, 1500);
    }

    $('rv-essay').addEventListener('click', event => {
        const span = event.target.closest?.('.rv-hl');
        if (!span) return;
        const index = Number(span.dataset.index);
        const item = document.querySelector('.rv-item[data-index="' + index + '"]');
        item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        span.classList.add('is-focus');
        item?.classList.add('is-focus');
        setTimeout(() => {
            span.classList.remove('is-focus');
            item?.classList.remove('is-focus');
        }, 1500);
    });

    (async function load() {
        if (!taskId) { fail('链接不完整，请从写作记录重新打开。'); return; }
        try {
            const response = await fetch('/api/writing/task?id=' + encodeURIComponent(taskId) + '&review=1', {
                headers, cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '无法打开这篇作文');

            const task = data.task || {};
            const feedback = task.feedback || null;
            const essay = task.text || '';
            const marks = marksOf(feedback);
            const wordCount = task.wordCount ?? (essay.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u4e00-\u9fff]/g) || []).length;

            $('rv-heading').textContent = task.title || kindName(task.kind);
            document.title = (task.title || '写作反馈') + ' · IELTS';

            const promptText = $('rv-prompt-text');
            if (task.prompt) promptText.textContent = task.prompt;
            else promptText.hidden = true;

            if (task.imageId) {
                const image = $('rv-image');
                const figure = $('rv-figure');
                image.onload = () => { figure.hidden = false; };
                image.onerror = () => { figure.hidden = true; image.removeAttribute('src'); };
                image.src = '/writing-image/' + encodeURIComponent(task.imageId);
                image.addEventListener('click', () => zoom(image.src));
            }

            const metaLine = $('rv-meta-line');
            metaLine.textContent = kindName(task.kind);

            const scores = $('rv-scores');
            const half = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—');
            if (feedback) {
                const overall = document.createElement('span');
                overall.className = 'rv-score is-total';
                overall.append(text('span', 'Overall'), text('b', half(feedback.overall)));
                scores.append(overall);
                [['TA/TR', feedback.ta], ['CC', feedback.cc], ['LR', feedback.lr], ['GRA', feedback.gra]].forEach(([label, value]) => {
                    if (value == null) return;
                    const chip = document.createElement('span');
                    chip.className = 'rv-score';
                    chip.append(text('span', label), text('b', String(value)));
                    scores.append(chip);
                });
            } else {
                scores.append(text('span', '待批改', 'rv-item-kind'));
            }

            const meta = [];
            meta.push(wordCount + ' 词');
            if (feedback?.updatedAt) meta.push('批改于 ' + when(feedback.updatedAt));
            $('rv-paper-meta').textContent = meta.join(' · ');

            paintEssay(essay, marks);
            paintSide(feedback, essay, marks);

            $('rv-loading').hidden = true;
            $('rv-main').hidden = false;
        } catch (error) {
            fail(error.message || '打开失败，请稍后重试。');
        }
    })();
})();
