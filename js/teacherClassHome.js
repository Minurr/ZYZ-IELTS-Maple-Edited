(function () {
    'use strict';
    const home = node('section', null, 'class-home');
    home.id = 'classHome';
    $('overviewView').before(home);
    home.before($('status'));
    const back = node('button', '← 返回年级与班级');
    back.type = 'button'; back.id = 'backToClasses';
    $('studentNav').before(back);
    const detailGrid = node('div'); detailGrid.id = 'classDetailGrid';
    $('overviewView').before(detailGrid); detailGrid.append($('overviewView'));
    const onlinePanel = node('section', null, 'panel'); onlinePanel.id = 'classOnline'; onlinePanel.hidden = true; detailGrid.append(onlinePanel);
    let onlineIds = new Set(), onlineReady = false, onlineBusy = false;
    const style = node('style');
    style.textContent = '.class-home[hidden],#backToClasses[hidden]{display:none}.class-home{margin-top:24px}.class-grade{margin-bottom:30px}.class-grade>header{margin-bottom:12px}.class-grade h2{margin:0;font-size:21px}.class-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.class-tile{display:block;text-align:left;padding:18px;background:#fff;border:1px solid var(--line);border-radius:10px;transition:border-color .15s}.class-tile:hover{border-color:var(--green)}.class-tile h3{font-size:17px;margin:0 0 7px}.class-metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0 10px}.class-metrics span{display:block;color:var(--muted);font-size:12px}.class-metrics strong{display:block;margin-top:5px;font-size:23px;font-variant-numeric:tabular-nums}.class-tile small{display:block}.class-tile .class-enter{margin-top:15px;color:var(--green)}#backToClasses{margin-bottom:14px}@media(max-width:500px){.class-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.class-tile{padding:12px}.class-metrics{gap:5px}.class-metrics strong{font-size:19px}}';
    document.head.append(style);
    style.textContent += '#classDetailGrid.with-online{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:18px;align-items:start}#classOnline{position:sticky;top:20px;margin-top:16px}#classOnline[hidden]{display:none}#classOnline h2{margin-bottom:8px}#classOnline button{display:block;width:100%;margin-top:8px;text-align:left}.class-online{color:var(--green);margin-top:6px;font-size:12px}@media(max-width:1000px){#classDetailGrid.with-online{grid-template-columns:1fr}#classOnline{position:static;grid-row:1}}';
    let selected = null;
    let showHome = !new URL(location.href).searchParams.has('cohort');
    const originalCohort = cohort, originalRender = render, originalChart = applyChartView;
    const originalTable = renderTable;
    renderTable = function () {
        originalTable();
        if (!student && selected) $('table').querySelectorAll('tr').forEach(row => row.children[1]?.remove());
    };
    for (const id of ['gradeFilter', 'classFilter']) $(id).closest('label').style.display = 'none';
    function readScope() {
        try { const value = JSON.parse(new URL(location.href).searchParams.get('cohort'));
            selected = Array.isArray(value) && value.length === 3 && value.every(x => typeof x === 'string') ? value : null;
        } catch (_) { selected = null; }
        showHome = !selected;
        if (selected) { $('schoolFilter').value = selected[0]; $('gradeFilter').value = selected[1]; $('classFilter').value = selected[2]; }
    }
    function matches(u, key) { return schoolKey(u) === key[0] && String(u.grade || '') === key[1] && String(u.className || '') === key[2]; }
    cohort = function () { return selected ? users.filter(u => matches(u, selected)) : originalCohort(); };
    function totals(members, kind) {
        const sum = { correct: 0, total: 0, records: 0 };
        for (const u of members) {
            const rows = $('range').value === '0' ? [u] : (u.daily || []).filter(d => inRange(d.date));
            for (const row of rows) { const item = row.byType?.[kind];
                sum.correct += n(item?.correctAnswers); sum.total += n(item?.accuracyTotalQuestions); sum.records += n(item?.records);
            }
        }
        return sum;
    }
    function openClass(key) {
        selected = key; showHome = false; chartMode = ''; listState = null; page = 0;
        $('search').value = ''; $('schoolFilter').value = key[0]; $('gradeFilter').value = key[1]; $('classFilter').value = key[2];
        const url = new URL(location.href); url.searchParams.set('cohort', JSON.stringify(key)); url.searchParams.delete('student');
        history.pushState(null, '', url); render(); window.scrollTo(0, 0);
    }
    function paintHome() {
        home.replaceChildren();
        const groups = new Map();
        const filtered = originalCohort();
        for (const u of filtered) {
            const school = schoolKey(u), grade = String(u.grade || '');
            const id = JSON.stringify([school, grade]);
            if (!groups.has(id)) groups.set(id, { school, grade, name: school === 'sample_school' ? (grade || '未填写年级') : (u.schoolName || '未补充学校'), members: [] });
            groups.get(id).members.push(u);
        }
        const grades = ['G12', 'G11', 'G10', 'Pre', 'English Dept.'];
        if (!$('schoolFilter').value || $('schoolFilter').value === 'sample_school') {
            for (const grade of grades.slice(0, 4)) {
                if ($('gradeFilter').value && $('gradeFilter').value !== grade) continue;
                const id = JSON.stringify(['sample_school', grade]);
                if (!groups.has(id)) groups.set(id, { school: 'sample_school', grade, name: grade, members: [] });
            }
        }
        const groupRank = group => group.school === 'missing' || (group.school === 'sample_school' && !group.grade) ? 2 : group.school === 'sample_school' ? 0 : 1;
        const ordered = [...groups.values()].sort((a, b) => groupRank(a) - groupRank(b) || (grades.indexOf(a.grade) < 0 ? 99 : grades.indexOf(a.grade)) - (grades.indexOf(b.grade) < 0 ? 99 : grades.indexOf(b.grade)) || a.name.localeCompare(b.name, 'zh-CN'));
        for (const group of ordered) {
            const section = node('section', null, 'class-grade'), head = node('header');
            head.append(node('h2', group.name), node('small', group.members.length + ' 名学生')); section.append(head);
            const grid = node('div', null, 'class-grid');
            const classes = new Set(group.members.map(u => String(u.className || '')));
            if (['Pre', 'English Dept.'].includes(group.grade)) classes.add('');
            if ($('classFilter').value) classes.add($('classFilter').value);
            if (group.school === 'sample_school' && ['G10', 'G11', 'G12'].includes(group.grade) && !$('classFilter').value) for (let i = 1; i <= 9; i++) classes.add(String(i));
            for (const cl of [...classes].sort((a, b) => a ? (b ? a.localeCompare(b, undefined, { numeric: true }) : -1) : 1)) {
                const members = group.members.filter(u => String(u.className || '') === cl);
                const label = cl ? cl + ' 班' : ['Pre', 'English Dept.'].includes(group.grade) ? group.grade : group.school === 'sample_school' ? '未分班' : '全部学生';
                const card = node('button', null, 'class-tile'); card.type = 'button'; card.dataset.classKey = JSON.stringify([group.school, group.grade, cl]);
                card.append(node('h3', label), node('small', members.length + ' 名学生'));
                const online = node('span', '', 'class-online'); online.dataset.onlineKey = card.dataset.classKey; card.append(online);
                const metrics = node('div', null, 'class-metrics');
                for (const kind of ['reading', 'listening']) {
                    const sum = totals(members, kind), cell = node('div');
                    cell.append(node('span', (kind === 'reading' ? '阅读' : '听力') + '正确率'), node('strong', pct(sum.correct, sum.total)), node('small', sum.records + ' 次练习'));
                    metrics.append(cell);
                }
                card.append(metrics);
                card.onclick = () => openClass([group.school, group.grade, cl]); grid.append(card);
            }
            section.append(grid); home.append(section);
        }
        if (!ordered.length) home.append(node('div', '当前筛选下暂无学生', 'empty'));
        paintOnline();
    }
    function paintOnline() {
        home.querySelectorAll('[data-online-key]').forEach(el => {
            const key = JSON.parse(el.dataset.onlineKey);
            el.textContent = onlineReady ? '在线 ' + users.filter(u => matches(u, key) && onlineIds.has(u.id)).length + ' 人' : '在线人数暂不可用';
            el.title = '最近 5 分钟有活动的账号，每 30 秒更新';
        });
        onlinePanel.replaceChildren(node('h2', '当前在线'), node('small', '最近 5 分钟有活动 · 每 30 秒更新'));
        if (!onlineReady) { onlinePanel.append(node('p', '在线状态暂不可用')); return; }
        const active = cohort().filter(u => onlineIds.has(u.id));
        onlinePanel.append(node('p', active.length + ' 人在线'));
        for (const u of active) { const button = node('button', u.name); button.type = 'button'; button.onclick = () => loadStudent(u.id); onlinePanel.append(button); }
        if (!active.length) onlinePanel.append(node('p', '当前暂无在线学生'));
    }
    async function refreshOnline() {
        if (onlineBusy || document.hidden) return;
        onlineBusy = true;
        try {
            const response = await fetch('/api/admin/online', { headers: { 'X-IELTS-User': IELTS_ACCOUNT.id }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw Error('unavailable');
            const data = await response.json(); onlineIds = new Set(data.userIds || []); onlineReady = true;
        } catch (_) { onlineReady = false; }
        finally { onlineBusy = false; paintOnline(); }
    }
    applyChartView = function () {
        originalChart(); const active = showHome && !student && !chartMode;
        home.hidden = !active; back.hidden = active || !!student;
        const showOnline = !active && !student && !chartMode && !!selected;
        onlinePanel.hidden = !showOnline; detailGrid.classList.toggle('with-online', showOnline);
        if (showOnline) paintOnline();
        if (active) {
            $('overviewView').hidden = true; $('title').textContent = '年级与班级';
            $('subtitle').textContent = ''; paintHome();
        } else if (!student && !chartMode && selected) {
            const first = cohort()[0];
            $('title').textContent = selected[0] === 'sample_school' ? [selected[1] || '未填写年级', selected[2] ? selected[2] + ' 班' : ['Pre', 'English Dept.'].includes(selected[1]) ? '' : '未分班'].filter(Boolean).join(' · ') : (first?.schoolName || '未补充学校');
            $('subtitle').textContent = '';
        }
        $('overview').textContent = '年级与班级';
    };
    render = function () { if (!student && new URL(location.href).searchParams.has('cohort')) readScope(); originalRender(); };
    function goHome() {
        selected = null; showHome = true; chartMode = ''; listState = null; page = 0;
        for (const id of ['schoolFilter', 'gradeFilter', 'classFilter', 'search']) $(id).value = '';
        const url = new URL(location.href); url.searchParams.delete('cohort'); url.searchParams.delete('student'); history.pushState(null, '', url);
        if (student) load(null); else render(); window.scrollTo(0, 0);
    }
    $('overview').onclick = goHome; back.onclick = goHome; $('resetScope').onclick = goHome;
    for (const id of ['schoolFilter', 'gradeFilter', 'classFilter']) $(id).onchange = () => {
        selected = null;
        if (id === 'schoolFilter') { $('gradeFilter').value = ''; $('classFilter').value = ''; }
        if (id === 'gradeFilter') $('classFilter').value = '';
        const url = new URL(location.href); url.searchParams.delete('cohort'); history.replaceState(null, '', url); page = 0; render();
    };
    addEventListener('popstate', readScope);
    readScope();
    if (users.length || student) render();
    refreshOnline(); setInterval(refreshOnline, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOnline(); });
})();
