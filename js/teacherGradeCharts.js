(function () {
    'use strict';
    const grades = ['G12', 'G11', 'G10', 'Pre', 'English Dept.'];
    let datasets = [], sequence = 0, passageKind = 'reading';
    const listenButton = node('button', '听力各题'); listenButton.id = 'navListeningPassage';
    $('navPassage').after(listenButton);
    const originalPassageClick = $('navPassage').onclick;
    $('navPassage').onclick = () => {passageKind='reading';listenButton.classList.remove('active');originalPassageClick();};
    listenButton.onclick = () => {passageKind='listening';openChart('passage');$('navPassage').classList.remove('active');listenButton.classList.add('active');$('title').textContent='听力各题';};
    for(const id of ['overview','navReadingTypes','navListeningTypes'])$(id)?.addEventListener('click',()=>listenButton.classList.remove('active'));
    const cache = new Map();
    const style = node('style');
    style.textContent = '#chartBoard.grade-charts{display:block}.grade-charts>section{margin:24px 0}.grade-charts h2{margin-bottom:12px}.grade-chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr));gap:12px;align-items:start}.acc-openable{cursor:pointer}.acc-openable:hover,.acc-openable:focus-visible{border-color:var(--green)}#classMistakeDialog{width:min(920px,calc(100vw - 24px));border:0;border-radius:12px;padding:0;color:var(--ink)}#classMistakeDialog::backdrop{background:#143d3366}#classMistakeDialog header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}#classMistakeDialog h2{margin:0;font-size:17px}#classMistakeDialog [data-body]{max-height:72vh;overflow:auto}#classMistakeDialog table{width:100%;border-collapse:collapse;font-size:14px}#classMistakeDialog th,#classMistakeDialog td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}#classMistakeDialog th{position:sticky;top:0;background:#f2f6f3;font-size:12px;color:var(--muted)}#classMistakeDialog td:first-child,#classMistakeDialog .mistake-score{white-space:nowrap;font-variant-numeric:tabular-nums}#classMistakeDialog tr.low td{background:#fff6f5}#classMistakeDialog b{font-weight:650}';
    document.head.append(style);
    function passages() {
        const unique = new Map();
        for (const data of datasets) for (const item of data.passages || []) {
            if (item.kind !== passageKind) continue;
            const id = item.examId || item.title;
            if (!unique.has(id)) unique.set(id, { id, title: item.title, attempts: 0 });
            unique.get(id).attempts += Number(item.attempts) || 0;
        }
        return [...unique.values()].sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title));
    }
    paintCurrentChart = function () {
        if(chartMode==='passage'){$('title').textContent=passageKind==='listening'?'听力各题':'阅读各题';$('navPassage').classList.toggle('active',passageKind==='reading');listenButton.classList.toggle('active',passageKind==='listening');}
        const board = $('chartBoard'); board.classList.add('grade-charts'); board.replaceChildren();
        if (chartMode === 'passage') {
            const list = passages(), pick = $('passagePick'), previous = pick.value;
            pick.replaceChildren(...list.map(item => { const option = node('option', item.title + ' · ' + item.attempts + ' 次'); option.value = item.id; return option; }));
            if (list.some(item => item.id === previous)) pick.value = previous;
            if (!list.length) { board.append(node('div', '当前时间范围暂无'+(passageKind==='listening'?'听力':'阅读')+'逐题记录', 'empty')); return; }
        }
        datasets.forEach((data, index) => {
            const grade = grades[index];
            const chart = chartMode === 'reading' ? data.readingTypes : chartMode === 'listening' ? data.listeningTypes : (data.passages || []).find(item => item.kind === passageKind && (item.examId || item.title) === $('passagePick').value);
            if (grade === 'English Dept.' && !chart?.series?.length) return;
            const section = node('section'), grid = node('div', null, 'grade-chart-grid'); section.append(node('h2', grade), grid);
            const series = new Map((chart?.series || []).map(item => [String(item.className || ''), item]));
            const keys = grade === 'Pre' || grade === 'English Dept.' ? [...new Set([...series.keys(), ''])] : [...new Set([...Array.from({ length: 9 }, (_, i) => String(i + 1)), ...series.keys()])];
            for (const key of keys) {
                const item = series.get(key), rows = [];
                (chart?.axes || []).forEach((axis, i) => { if (item?.values[i] != null) rows.push({ axis, value: item.values[i], count: item.counts?.[i] }); });
                if (chartMode !== 'passage') rows.sort((a, b) => a.value - b.value || String(a.axis).localeCompare(String(b.axis), 'zh-CN'));
                const card = accuracyCard(item?.name || (key ? key + ' 班' : ['Pre', 'English Dept.'].includes(grade) ? grade : '未分班'), rows, chartMode === 'passage');
                if (chartMode === 'passage' && rows.length) {
                    card.classList.add('acc-openable');
                    card.tabIndex = 0;
                    card.title = '查看各题错得最多的选项';
                    const open = () => openClassMistakes(grade, item, chart);
                    card.addEventListener('click', open);
                    card.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        open();
                    });
                }
                grid.append(card);
            }
            board.append(section);
        });
    };
    loadClassCharts = async function () {
        if (!chartMode) return;
        const seq = ++sequence; applyChartView();
        const school = $('schoolFilter').value;
        if (school && school !== 'sample_school') { $('chartBoard').replaceChildren(); $('classChartNote').textContent = '年级与班级统计适用于 示例学校，请切换到全部学校或 示例学校。'; return; }
        $('classChartNote').textContent = '正在加载各年级、各班正确率…'; $('chartBoard').replaceChildren();
        const days = $('range').value || '0';
        try {
            let cached = cache.get(days);
            if (!cached || Date.now() - cached.at > 30000) {
                const promise = Promise.all(grades.map(async grade => {
                    const response = await fetch('/api/admin/class-charts?grade=' + encodeURIComponent(grade) + '&days=' + encodeURIComponent(days), { headers: { 'X-IELTS-User': IELTS_ACCOUNT.id }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
                    const result = await response.json(); if (!response.ok) throw Error(result.error || '加载失败'); return result;
                }));
                cached = { at: Date.now(), promise }; cache.set(days, cached);
                promise.catch(() => { if (cache.get(days) === cached) cache.delete(days); });
            }
            const result = await cached.promise;
            if (seq !== sequence || !chartMode) return;
            datasets = result; classChartData = { allGrades: true };
            $('classChartNote').textContent = '0% 的练习不计入总正确率。' + (chartMode === 'passage' ? '点班级查看错选项，每人取最近一次作答。' : '');
            paintCurrentChart();
        } catch (error) { if (seq === sequence && chartMode) $('classChartNote').textContent = (error.message || '加载失败') + '，请点击刷新重试。'; }
    };
    function optionText(question, answer) {
        const raw = String(answer || '').trim();
        const options = question?.options || {};
        const key = Object.keys(options).find(item => item.toLowerCase() === raw.toLowerCase());
        const text = key ? options[key] : '';
        if (!raw) return '';
        if (!text || text.toLowerCase() === raw.toLowerCase()) return key || raw;
        return (key || raw) + ' ' + text;
    }
    function openClassMistakes(grade, item, chart) {
        let dialog = document.getElementById('classMistakeDialog');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'classMistakeDialog';
            dialog.innerHTML = '<header><h2></h2><button type="button" data-close>关闭</button></header><div data-body></div>';
            dialog.querySelector('[data-close]').onclick = () => dialog.close();
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
            document.body.append(dialog);
        }
        dialog.querySelector('h2').textContent = [grade, item.name || '班级', chart.title || '阅读'].filter(Boolean).join(' · ');
        const body = dialog.querySelector('[data-body]');
        body.replaceChildren();
        const table = document.createElement('table');
        const head = document.createElement('tr');
        ['题号', '答对/人数', '错得最多', '正确答案'].forEach(label => head.append(node('th', label)));
        table.append(head);
        let shown = 0;
        (chart.axes || []).forEach((axis, index) => {
            if (item.values?.[index] == null) return;
            shown += 1;
            const question = chart.questions?.[index] || {};
            const count = item.counts?.[index];
            const picks = item.wrongs?.[index] || [];
            const row = document.createElement('tr');
            if (Number(item.values[index]) < 50) row.className = 'low';
            const number = node('td', String(axis));
            const score = node('td', count ? count[0] + '/' + count[1] : '—', 'mistake-score');
            const wrong = node('td', picks.length ? picks.map(pick => optionText(question, pick.answer)).join('、') + ' · ' + picks[0].count + '人' : '—');
            const answer = node('td', question.correct ? optionText(question, question.correct) : '—');
            row.append(number, score, wrong, answer);
            table.append(row);
        });
        if (shown) body.append(table);
        else body.append(node('p', '这个班在当前范围没有可统计的作答'));
        dialog.showModal();
    }
    $('refresh').addEventListener('click', () => cache.clear());
})();
