(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const view = document.createElement('section');
    view.id = 'examView';
    view.hidden = true;
    document.querySelector('main').append(view);
    const button = document.createElement('button');
    button.id = 'navExams';
    button.type = 'button';
    button.textContent = '考试';
    const label = document.createElement('div');
    label.className = 'side-label';
    label.textContent = '安排';
    $('sideNav').append(label, button);
    const style = document.createElement('style');
    style.textContent = `
#examView[hidden]{display:none}
#examView{position:fixed;z-index:30;top:0;right:0;bottom:0;left:188px;max-width:calc(100vw - 188px);overflow:auto;box-sizing:border-box;background:#f3f6f3;padding:32px 28px 48px}
@media(max-width:1000px){#examView{left:172px;max-width:calc(100vw - 172px);padding:20px}}
@media(max-width:650px){#examView{position:relative;left:auto;max-width:100%;padding:12px}}
#examView button,#examView input,#examView select{padding:9px 12px}
.exam-page{width:min(1180px,100%);min-width:0;margin:0 auto;display:grid;gap:18px}
.exam-page h2{margin:0;font-size:22px}
.exam-top{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
.exam-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;min-width:0;box-sizing:border-box;display:grid;gap:18px}
.exam-steps{display:flex;gap:10px;margin:0;padding:0;list-style:none}
.exam-steps li{padding:7px 12px;border-radius:999px;background:#eef4f0;color:#60756d;font-size:13px}
.exam-steps li.on{background:#087e66;color:#fff}
.exam-label{display:block;margin:0 0 8px;font-size:12px;color:var(--muted)}
.exam-block{display:grid;gap:8px}
.exam-chips{display:flex;flex-wrap:wrap;gap:10px}
.exam-choice{padding:8px 16px;border-radius:999px;font-size:14px}
.exam-choice.active{background:var(--green);color:#fff;border-color:var(--green)}
.exam-card input[type=text],.exam-card input[type=search],.exam-card input[type=datetime-local]{width:100%;max-width:100%;min-width:0;box-sizing:border-box}
.exam-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media(max-width:640px){.exam-times{grid-template-columns:1fr}}
.exam-parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;min-width:0}
.exam-part{min-width:0;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafcfb;display:grid;gap:8px;align-content:start}
.exam-part h3{margin:0;font-size:15px}
.exam-papers{border:0;border-radius:0;max-height:min(420px,50vh);overflow:auto;padding:0;background:transparent}
.exam-papers label{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start;padding:8px 4px;border-radius:8px;cursor:pointer;line-height:1.45}
.exam-papers label:hover{background:#f3f8f5}
.exam-papers small{display:block;margin-top:2px;color:var(--muted)}
.exam-actions{display:flex;flex-wrap:wrap;gap:10px}
.exam-scroll{overflow:auto;max-width:100%}
.exam-table{width:100%;border-collapse:collapse;font-size:14px}
.exam-table th,.exam-table td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.exam-table th{font-size:12px;color:var(--muted);font-weight:600}
.exam-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:12px;background:#eef4f0;color:#476257}
.exam-badge.live{background:#e6f4ee;color:#087e66}
.exam-badge.wait{background:#fff4df;color:#9a6b00}
.exam-badge.done,.exam-badge.off{background:#f2f2f2;color:#666}
.exam-summary{display:flex;flex-wrap:wrap;gap:10px}
.exam-summary span{padding:8px 12px;border-radius:999px;background:#f3f8f5;font-size:13px;font-variant-numeric:tabular-nums}
.exam-result{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:800px){.exam-result{grid-template-columns:1fr}}
.exam-class{display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:12px;border-radius:10px;background:#fff}
.exam-class.on{border-color:var(--green);background:#f3faf7}
.exam-class strong{display:block;font-size:15px}
.exam-class small{color:var(--muted)}
.exam-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:700px){.exam-split{grid-template-columns:1fr}}
.exam-split section{min-width:0;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafcfb}
.exam-split h3{margin:0 0 8px;font-size:14px}
.exam-split div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed var(--line)}
.exam-empty{color:var(--muted);margin:8px 0}
.exam-class-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:0 0 18px}.exam-chart{border:1px solid var(--line);border-radius:10px;background:#fff;padding:16px;min-width:0}.exam-chart h3{margin:0 0 12px;font-size:15px}.exam-chart-row{display:grid;grid-template-columns:72px minmax(0,1fr) 54px;gap:8px;align-items:center;margin:9px 0;font-size:12px}.exam-chart-row.is-type{grid-template-columns:minmax(84px,1.15fr) minmax(0,1fr) 54px}.exam-chart-row.is-type span:first-child{overflow-wrap:anywhere}.exam-chart-row b{text-align:right;font-variant-numeric:tabular-nums}.exam-chart-track{display:block;height:10px;background:#e7eeeb;border-radius:99px;overflow:hidden}.exam-chart-bar{display:block;height:100%;background:#16836d;border-radius:99px}.exam-type-matrix{grid-column:1/-1}.exam-matrix-scroll{overflow:auto}.exam-type-matrix table{border-collapse:collapse;width:100%;font-size:12px}.exam-type-matrix th,.exam-type-matrix td{padding:9px;border:1px solid #e1e8e4;text-align:center;white-space:nowrap}.exam-type-matrix th:first-child{text-align:left;position:sticky;left:0;background:#fff}.exam-foot{font-size:12px;color:var(--muted);margin:0;line-height:1.6}
`;
    style.textContent += `
#examView{background:#f6f8fa}.exam-dashboard{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}@media(max-width:700px){.exam-dashboard{grid-template-columns:repeat(3,minmax(0,1fr))}}.exam-dashboard button{flex:1;min-width:0;text-align:left;border:1px solid #dce3e9;background:#fff;border-radius:10px;padding:14px!important}.exam-dashboard button.active{border-color:#167762;background:#eef8f4;color:#174b40}.exam-dashboard button.active strong{color:#174b40}.exam-dashboard strong{display:block;font-size:24px;margin-top:6px}.exam-list-tools{display:flex;gap:12px;flex-wrap:wrap}.exam-list-tools input{flex:1;min-width:170px}.exam-list-tools select{max-width:150px}.exam-list-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;padding:20px 0;border-bottom:1px solid #e2e8f0}.exam-list-item h3{font-size:17px;margin:0 0 8px;overflow-wrap:anywhere}.exam-list-item p{margin:6px 0;color:#607080;font-size:13px;line-height:1.65}.exam-list-item .exam-actions{justify-content:flex-end}.exam-list-item .exam-badge{margin-left:10px}.exam-result>.exam-chips{position:sticky;top:12px;max-height:70dvh;overflow:auto}.exam-class{align-items:center}.exam-detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.exam-progress{width:100%;height:8px;accent-color:#087e66;margin:8px 0 18px}.exam-split section{background:#fff}.exam-split div{padding:11px 0;border-bottom:1px solid #edf0f3}.exam-split div span:last-child{font-variant-numeric:tabular-nums;font-weight:600}.exam-card input,.exam-card select{border:1px solid #ccd6df;border-radius:6px;background:#fff}.exam-card button:focus-visible{outline:2px solid #087e66;outline-offset:3px}@media(max-width:700px){.exam-list-item{grid-template-columns:1fr;gap:8px}.exam-list-item .exam-actions{justify-content:flex-start}.exam-result>.exam-chips{position:static;max-height:230px}}`;
    document.head.append(style);
    let open = false, catalog = [], mode = 'passage', subject = 'reading', selected = [], step = 1, screen = 'list', activePart = 'P1';
    const headers = () => ({ 'Content-Type': 'application/json', 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' });
    function node(tag, text, cls) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; }
    function pad(date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0') + 'T' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'); }
    function stamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
    function phase(exam, now) {
        if (exam.cancelled) return ['已撤回', 'off'];
        if (now < new Date(exam.startAt)) return ['未开始', 'wait'];
        if (now > new Date(exam.endAt)) return ['已结束', 'done'];
        return ['进行中', 'live'];
    }
    function parts() { return subject === 'reading' ? ['P1', 'P2', 'P3'] : ['P1', 'P2', 'P3', 'P4']; }
    function partName(part) { return 'Part ' + String(part || '').replace(/\D/g, ''); }
    function partOf(item) { const match = String(item?.category || '').match(/P(\d+)/i); return match ? 'P' + match[1] : ''; }
    function partRank(part) { return Number(String(part || '').replace(/\D/g, '')) || 99; }
    function detail(item) {
        const bits = [item.frequency || '频率未标'];
        bits.push(item.difficulty == null || item.difficulty === '' ? '难度未标' : '难度 ' + item.difficulty);
        return bits.join(' · ');
    }
    function classRank(item) {
        const grades = ['G12', 'G11', 'G10', 'Pre', 'English Dept.'];
        const number = Number(item.className || String(item.label || '').match(/(\d+)\s*班/)?.[1] || 0);
        return (grades.indexOf(item.grade) + 1 || 9) * 100 + number;
    }
    function setExamChrome(on) {
        const toolbar = document.querySelector('main > header .toolbar');
        const filter = document.querySelector('main > section.panel');
        if (toolbar) toolbar.hidden = on;
        if (filter) filter.hidden = on;
    }
    function pin() {
        ['classHome', 'classDetailGrid', 'overviewView', 'chartView', 'backToClasses', 'studentNav'].forEach(id => { const el = $(id); if (el) el.hidden = true; });
        setExamChrome(true);
        view.hidden = false;
        $('title').textContent = '考试管理';
        $('subtitle').textContent = '';
        for (const id of ['overview', 'navReadingTypes', 'navListeningTypes', 'navPassage', 'navListeningPassage', 'navExams']) $(id)?.classList.toggle('active', id === 'navExams');
    }
    function unpin() {
        open = false;
        view.hidden = true;
        setExamChrome(false);
        $('navExams')?.classList.remove('active');
    }
    function page() {
        const root = node('div', null, 'exam-page');
        view.replaceChildren(root);
        return root;
    }
    async function loadCatalog() {
        if (catalog.length) return;
        const response = await fetch('/api/admin/exams/catalog', { headers: headers(), cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || '题库加载失败');
        catalog = data.papers || [];
    }
    function paintPapers() {
        const box = $('examPapers');
        const note = $('examSelected');
        if (!box) return;
        const query = ($('examSearch')?.value || '').trim().toLowerCase();
        box.replaceChildren();
        const columns = mode === 'suite' ? parts() : [activePart];
        if (mode === 'passage') {
            const tabs = node('div', null, 'exam-chips');
            parts().forEach(part => tabs.append(choice(partName(part), part, activePart === part, () => { activePart = part; paintPapers(); })));
            box.append(tabs);
        }
        const grid = node('div', null, 'exam-parts');
        for (const part of columns) {
            const column = node('section', null, 'exam-part');
            column.append(node('h3', partName(part)));
            const list = node('div', null, 'exam-papers');
            const items = catalog.filter(item => item.subject === subject && partOf(item) === part && (!query || (item.title + ' ' + item.category + ' ' + (item.frequency || '')).toLowerCase().includes(query)));
            if (!items.length) list.append(node('p', query ? '没有匹配的篇目' : '这一部分还没有篇目', 'exam-empty'));
            for (const item of items) {
                const row = node('label'), input = document.createElement('input');
                input.type = 'radio';
                input.name = mode === 'suite' ? 'exam-' + part : 'examPaper';
                input.checked = selected.includes(item.id);
                input.onchange = () => {
                    if (mode === 'passage') selected = [item.id];
                    else {
                        selected = selected.filter(id => partOf(catalog.find(paper => paper.id === id)) !== part);
                        selected.push(item.id);
                        selected.sort((a, b) => partRank(partOf(catalog.find(paper => paper.id === a))) - partRank(partOf(catalog.find(paper => paper.id === b))));
                    }
                    if (note) note.textContent = selectedText();
                };
                const text = node('span');
                text.append(node('span', item.title), node('small', detail(item)));
                row.append(input, text);
                list.append(row);
            }
            column.append(list);
            grid.append(column);
        }
        box.append(grid);
        if (note) note.textContent = selectedText();
    }
    function selectedText() {
        if (mode === 'passage') return selected.length ? '已选 1 篇' : '在一个 Part 里选择 1 篇';
        const need = parts();
        const have = need.filter(part => selected.some(id => partOf(catalog.find(item => item.id === id)) === part));
        return have.length === need.length ? partName(need[0]) + ' 到 ' + partName(need[need.length - 1]) + ' 都已选择' : '还需要选择 ' + need.filter(part => !have.includes(part)).map(partName).join('、');
    }
    function choice(name, value, active, onpick) {
        const item = node('button', name, 'exam-choice' + (active ? ' active' : ''));
        item.type = 'button';
        item.onclick = onpick;
        return item;
    }
    function steps() {
        const list = node('ol', null, 'exam-steps');
        ['科目', '篇目', '对象和时间'].forEach((name, index) => {
            list.append(node('li', (index + 1) + ' ' + name, index + 1 === step ? 'on' : ''));
        });
        return list;
    }
    function paintCreate() {
        screen = 'create';
        pin();
        const root = page();
        const card = node('div', null, 'exam-card');
        const top = node('div', null, 'exam-top');
        const back = node('button', step === 1 ? '返回列表' : '上一步');
        back.type = 'button';
        back.onclick = () => { if (step === 1) showList(); else { step -= 1; paintCreate(); } };
        top.append(node('h2', '发布考试'), back);
        card.append(top, steps());
        if (step === 1) {
            const subjects = node('div', null, 'exam-chips');
            [['reading', '阅读'], ['listening', '听力']].forEach(([value, name]) => subjects.append(choice(name, value, subject === value, () => { subject = value; selected = []; activePart = 'P1'; subjects.querySelectorAll('button').forEach((el, index) => el.classList.toggle('active', ['reading', 'listening'][index] === value)); })));
            const modes = node('div', null, 'exam-chips');
            [['passage', '散篇'], ['suite', '套题']].forEach(([value, name]) => modes.append(choice(name, value, mode === value, () => { mode = value; selected = []; activePart = 'P1'; modes.querySelectorAll('button').forEach((el, index) => el.classList.toggle('active', ['passage', 'suite'][index] === value)); })));
            card.append(node('span', '科目', 'exam-label'), subjects);
            card.append(node('span', '形式', 'exam-label'), modes);
            card.append(node('p', '散篇在一个 Part 里选一篇。套题从 Part 1 开始，每个 Part 选一篇，阅读到 Part 3，听力到 Part 4。考试按这个顺序一次做完。', 'exam-foot'));
            const next = node('button', '下一步', 'primary'); next.type = 'button'; next.onclick = () => { step = 2; paintCreate(); };
            const actions = node('div', null, 'exam-actions'); actions.append(next); card.append(actions);
        } else if (step === 2) {
            const search = node('input'); search.id = 'examSearch'; search.placeholder = '可搜索标题，不输入也会显示全部篇目'; search.oninput = paintPapers;
            const papers = node('div'); papers.id = 'examPapers';
            const note = node('p', '', 'exam-foot'); note.id = 'examSelected';
            card.append(node('span', '搜索', 'exam-label'), search, papers, note);
            const next = node('button', '下一步', 'primary'); next.type = 'button';
            next.onclick = () => {
                if (mode === 'passage' && selected.length !== 1) { alert('散篇请在一个 Part 里选择 1 篇'); return; }
                if (mode === 'suite' && parts().some(part => !selected.some(id => partOf(catalog.find(item => item.id === id)) === part))) {
                    alert(subject === 'reading' ? '阅读套题要 Part 1、Part 2、Part 3 各选一篇' : '听力套题要 Part 1 到 Part 4 各选一篇');
                    return;
                }
                step = 3; paintCreate();
            };
            const actions = node('div', null, 'exam-actions'); actions.append(next); card.append(actions);
        } else {
            const title = node('input'); title.id = 'examTitle'; title.placeholder = '考试名称，可留空'; title.maxLength = 40;
            const gradeBox = node('div', null, 'exam-chips'); gradeBox.id = 'examGrades';
            for (const grade of ['G12', 'G11', 'G10', 'Pre', 'English Dept.']) {
                const item = choice(grade, grade, false, () => item.classList.toggle('active'));
                item.dataset.grade = grade; gradeBox.append(item);
            }
            const classBox = node('div', null, 'exam-chips'); classBox.id = 'examClasses';
            for (let i = 1; i <= 9; i++) {
                const item = choice(i + ' 班', String(i), false, () => item.classList.toggle('active'));
                item.dataset.class = String(i); classBox.append(item);
            }
            const start = node('input'), end = node('input');
            start.type = end.type = 'datetime-local'; start.id = 'examStart'; end.id = 'examEnd';
            const now = new Date(); start.value = pad(now); end.value = pad(new Date(now.getTime() + 90 * 60000));
            const times = node('div', null, 'exam-times');
            const startWrap = node('div'); startWrap.append(node('span', '开始', 'exam-label'), start);
            const endWrap = node('div'); endWrap.append(node('span', '结束', 'exam-label'), end);
            times.append(startWrap, endWrap);
            card.append(node('span', '考试名称', 'exam-label'), title, node('span', '年级', 'exam-label'), gradeBox, node('span', '班级，不选就是该年级全部班级', 'exam-label'), classBox, times);
            const submit = node('button', '发布', 'primary'); submit.type = 'button'; submit.onclick = publish;
            const actions = node('div', null, 'exam-actions'); actions.append(submit); card.append(actions);
        }
        root.append(card);
        if (step === 2) paintPapers();
    }
    async function publish(event) {
        const button = event?.currentTarget; if (button?.disabled) return;
        if (button) { button.disabled = true; button.textContent = '发布中…'; }
        try {
        const grades = [...document.querySelectorAll('#examGrades .active')].map(item => item.dataset.grade);
        const classes = [...document.querySelectorAll('#examClasses .active')].map(item => item.dataset.class);
        const response = await fetch('/api/admin/exams', { method: 'POST', headers: headers(), body: JSON.stringify({ title: $('examTitle').value, subject, mode, papers: selected, grades, classes, start: $('examStart').value, end: $('examEnd').value }) });
        const data = await response.json();
        if (!response.ok) { alert(data.error || '发布失败'); return; }
        selected = []; step = 1; await showList();
        } catch(error) { alert(error.message || '发布失败，请重试'); }
        finally { if(button){button.disabled=false;button.textContent='发布';} }
    }
    async function showList() {
        screen = 'list'; pin();
        const root = page(); view.scrollTop = 0;
        const top = node('div', null, 'exam-top');
        const create = node('button', '发布考试', 'primary'); create.type = 'button';
        create.onclick = async () => { create.disabled = true; create.textContent = '加载题库…'; try { await loadCatalog(); step = 1; paintCreate(); } catch (error) { alert(error.message); } finally {create.disabled = false; create.textContent = '发布考试';} };
        const reload = node('button', '刷新'); reload.onclick = showList;
        const actions = node('div', null, 'exam-actions'); actions.append(reload, create);
        top.append(node('h2', '考试管理'), actions);
        const card = node('div', null, 'exam-card'); card.setAttribute('aria-live','polite');
        card.append(node('p', '正在加载考试…', 'exam-empty')); root.append(top, card);
        try {
            const response = await fetch('/api/admin/exams', { headers: headers(), cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw Error(data.error || '加载失败');
            if (!root.isConnected) return;
            const exams = data.exams || []; const now = new Date();
            let filter = 'all', query = '', subjectFilter = '';
            const stats = node('div', null, 'exam-dashboard');
            const tools = node('div', null, 'exam-list-tools');
            const search = node('input'); search.type = 'search'; search.placeholder = '搜索考试名称、年级或班级'; search.setAttribute('aria-label',search.placeholder);
            const subjectSelect = node('select'); subjectSelect.setAttribute('aria-label','科目');
            for (const [value,label] of [['','全部科目'],['reading','阅读'],['listening','听力']]) {const option = node('option',label);option.value=value;subjectSelect.append(option);}
            tools.append(search,subjectSelect); const list = node('div');
            const paint = () => {
                stats.replaceChildren(); list.replaceChildren();
                for (const [value,label] of [['all','全部'],['live','进行中'],['wait','未开始'],['done','已结束'],['off','已撤回']]) {
                    const item = node('button',label,value===filter?'active':'');item.type='button';item.setAttribute('aria-pressed',String(value===filter));
                    item.append(node('strong',exams.filter(exam=>value==='all'||phase(exam,now)[1]===value).length));
                    item.onclick=()=>{filter=value;paint();};stats.append(item);
                }
                const rows = exams.filter(exam => (filter==='all'||phase(exam,now)[1]===filter) && (!subjectFilter||exam.subject===subjectFilter) && (!query||[exam.title,...exam.grades,...exam.classes.map(c=>c+'班')].join(' ').toLowerCase().includes(query)))
                    .sort((a,b)=>({live:0,wait:1,done:2,off:3}[phase(a,now)[1]]-{live:0,wait:1,done:2,off:3}[phase(b,now)[1]]) || new Date(b.startAt)-new Date(a.startAt));
                if (!rows.length) list.append(node('p',exams.length?'没有符合条件的考试':'还没有考试，点击“发布考试”开始安排。','exam-empty'));
                for (const exam of rows) {
                    const [label,status]=phase(exam,now); const row=node('article',null,'exam-list-item');const copy=node('div');const title=node('h3',exam.title);title.append(node('span',label,'exam-badge '+status));
                    copy.append(title,node('p',(exam.subject==='reading'?'阅读':'听力')+' · '+(exam.mode==='suite'?'套题 · '+exam.papers.length+' 篇':'散篇')+' · '+exam.grades.join('、')+' · '+(exam.classes.length?exam.classes.map(c=>c+'班').join('、'):'全部班级')),node('p',stamp(exam.startAt)+' — '+stamp(exam.endAt)));
                    const controls=node('div',null,'exam-actions');const results=node('button','查看交卷与成绩','primary');results.onclick=()=>showResults(exam.id);controls.append(results);
                    if(!exam.cancelled){const cancel=node('button','撤回');cancel.onclick=async()=>{cancel.disabled=true;try{await withdraw(exam.id);}catch(error){alert(error.message||'撤回失败，请重试');}finally{cancel.disabled=false;}};controls.append(cancel);}
                    row.append(copy,controls);list.append(row);
                }
            };
            search.oninput=()=>{query=search.value.trim().toLowerCase();paint();};subjectSelect.onchange=()=>{subjectFilter=subjectSelect.value;paint();};
            card.replaceChildren(tools,list);root.insertBefore(stats,card);paint();
        } catch(error) { if(root.isConnected){const retry=node('button','重新加载');retry.onclick=showList;card.replaceChildren(node('p',error.message||'加载失败','exam-empty'),retry);} }
    }
    async function withdraw(id) {
        if (!confirm('撤回后学生不再看到这场考试，已有成绩仍可查看。')) return;
        const response = await fetch('/api/admin/exams/cancel', { method: 'POST', headers: headers(), body: JSON.stringify({ id }) });
        const data = await response.json();
        if (!response.ok) { alert(data.error || '撤回失败'); return; }
        showList();
    }
    function scoreText(item, suite) {
        if (suite) return item.band == null ? '—' : Number(item.band).toFixed(1);
        return item.accuracy == null ? '—' : item.accuracy + '%';
    }
    function typeLabel(name) {
        const labels = {'heading-matching':'段落小标题','true-false-not-given':'判断题','yes-no-not-given':'观点判断','multiple-choice':'单/多选题','summary-completion':'摘要填空','sentence-completion':'句子填空','short-answer':'简答题','diagram-labelling':'图表标注','flow-chart':'流程图','table-completion':'表格填空','matching-information':'信息配对','matching-features':'特征匹配','matching-people-ideas':'人名观点配对','other':'其他题型'};
        return labels[name] || name;
    }
    function classCharts(item, suite) {
        const panel = node('div', null, 'exam-class-charts');
        const roster = item.roster || [];
        const scoreBins = suite
            ? [{name:'低于 4', min:0, max:4}, {name:'4–4.5', min:4, max:5}, {name:'5–5.5', min:5, max:6}, {name:'6–6.5', min:6, max:7}, {name:'7–7.5', min:7, max:8}, {name:'8–9', min:8, max:10}]
            : [{name:'0–39%', min:0, max:40}, {name:'40–59%', min:40, max:60}, {name:'60–79%', min:60, max:80}, {name:'80–100%', min:80, max:101}];
        const scores = roster.filter(student => student.submitted).map(student => suite ? student.band?.value : student.accuracy).filter(value => value != null && Number.isFinite(Number(value))).map(Number);
        const scoreRows = scoreBins.map(bin => ({name:bin.name, count:scores.filter(value => value >= bin.min && value < bin.max).length}));
        const chart = node('section', null, 'exam-chart');
        chart.append(node('h3', suite ? '雅思分分布' : '正确率分布'));
        for (const row of scoreRows) {
            const line = node('div', null, 'exam-chart-row');
            const track = node('span', null, 'exam-chart-track');
            const bar = node('span', null, 'exam-chart-bar');
            bar.style.width = (scores.length ? Math.round(row.count * 100 / scores.length) : 0) + '%';
            track.append(bar);
            line.append(node('span', row.name), track, node('b', String(row.count)));
            chart.append(line);
        }
        panel.append(chart);
        const typeTotals = new Map();
        for (const part of item.partStats || []) {
            for (const type of part.questionTypes || []) {
                const slot = typeTotals.get(type.name) || {correct:0, total:0};
                slot.correct += Number(type.correct) || 0;
                slot.total += Number(type.total) || 0;
                typeTotals.set(type.name, slot);
            }
        }
        const weakRows = [...typeTotals.entries()].map(([name, slot]) => ({name:typeLabel(name), accuracy:slot.total ? Math.round(slot.correct * 1000 / slot.total) / 10 : null, correct:slot.correct, total:slot.total})).filter(row => row.total > 0).sort((a, b) => a.accuracy - b.accuracy);
        if (weakRows.length) {
            const weak = node('section', null, 'exam-chart');
            weak.append(node('h3', '题型正确率'));
            for (const row of weakRows) {
                const line = node('div', null, 'exam-chart-row is-type');
                const track = node('span', null, 'exam-chart-track');
                const bar = node('span', null, 'exam-chart-bar');
                bar.style.width = row.accuracy + '%';
                track.append(bar);
                line.append(node('span', row.name), track, node('b', row.accuracy + '%'));
                line.title = row.correct + ' / ' + row.total + ' 题';
                weak.append(line);
            }
            panel.append(weak);
        }
        const parts = item.partStats || [];
        if (parts.length) {
            const accuracy = node('section', null, 'exam-chart');
            accuracy.append(node('h3', '各 Part 正确率'));
            for (const part of parts) {
                const line = node('div', null, 'exam-chart-row');
                const track = node('span', null, 'exam-chart-track');
                const bar = node('span', null, 'exam-chart-bar');
                bar.style.width = (part.accuracy || 0) + '%'; track.append(bar);
                line.append(node('span', partName(part.part || 'P1')), track, node('b', part.accuracy == null ? '—' : part.accuracy + '%'));
                accuracy.append(line);
            }
            panel.append(accuracy);
            const types = [...new Set(parts.flatMap(part => (part.questionTypes || []).map(type => type.name)))];
            {
                const matrix = node('section', null, 'exam-chart exam-type-matrix');
                matrix.append(node('h3', 'Part × 题型正确率'));
                if (!types.length) {
                    matrix.append(node('p', '这场考试的交卷记录暂无题型统计', 'exam-empty'));
                    panel.append(matrix);
                } else {
                const scroll = node('div', null, 'exam-matrix-scroll');
                const table = document.createElement('table');
                const header = document.createElement('tr'); header.append(node('th', '题型'));
                parts.forEach(part => header.append(node('th', partName(part.part || 'P1')))); table.append(header);
                for (const type of types) {
                    const row = document.createElement('tr'); row.append(node('th', typeLabel(type)));
                    for (const part of parts) {
                        const metric = (part.questionTypes || []).find(item => item.name === type);
                        const cell = node('td', metric ? metric.accuracy + '%' : '—');
                        if (metric) { cell.style.background = 'rgba(22,131,109,' + (0.08 + metric.accuracy / 180) + ')'; cell.title = metric.correct + ' / ' + metric.total + ' 题'; }
                        row.append(cell);
                    }
                    table.append(row);
                }
                scroll.append(table); matrix.append(scroll); panel.append(matrix);
                }
            }
        }
        return panel;
    }
    function markOf(student, suite) {
        if (!student.submitted) return '未交';
        if (suite && student.band?.label) return student.band.label;
        return student.accuracy == null ? '—' : student.accuracy + '%';
    }
    async function showResults(id) {
        screen = 'results'; pin(); view.scrollTop = 0;
        const root = page();
        const top = node('div', null, 'exam-top');
        const back = node('button', '返回列表'); back.type = 'button'; back.onclick = showList;
        top.append(node('h2', '班级结果'), back);
        const card = node('div', null, 'exam-card');
        card.append(node('p', '正在统计…', 'exam-empty'));
        root.append(top, card);
        let response, data;
        try { response = await fetch('/api/admin/exams/results?id=' + encodeURIComponent(id), { headers: headers(), cache: 'no-store' }); data = await response.json(); }
        catch (error) { if(root.isConnected){const retry=node('button','重新加载');retry.onclick=()=>showResults(id);card.replaceChildren(node('p','成绩暂时加载失败，请重试','exam-empty'),retry);}return; }
        if (!root.isConnected) return;
        if (!response.ok) { card.replaceChildren(node('p', data.error || '统计失败', 'exam-empty')); return; }
        const suite = data.exam.mode === 'suite';
        const classes = (data.classes || []).slice().sort((a, b) => classRank(a) - classRank(b));
        const students = classes.reduce((sum, item) => sum + (item.students || 0), 0);
        const submitted = classes.reduce((sum, item) => sum + (item.submitted || 0), 0);
        const numeric = classes.map(item => suite ? item.band : item.accuracy).filter(value => value != null);
        const average = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
        let current = classes[0] || null;
        let query = ''; let order = 'name';
        const sort = node('select'); sort.setAttribute('aria-label','学生排序');
        for (const [value,label] of [['name','姓名排序'],['score','成绩从高到低']]) { const option=node('option',label);option.value=value;sort.append(option); }
        sort.onchange=()=>{order=sort.value;paintDetail();};
        const summary = node('div', null, 'exam-summary');
        summary.append(node('span', data.exam.title), node('span', '已交 ' + submitted + ' / ' + students), node('span', '未交 ' + Math.max(0, students - submitted)));
        if (average != null && !Number.isNaN(average)) summary.append(node('span', suite ? '平均雅思 ' + average.toFixed(1) : '平均正确率 ' + average.toFixed(1) + '%'));
        const search = node('input'); search.type = 'search'; search.placeholder = '搜索学生';
        const body = node('div', null, 'exam-result');
        const classList = node('div', null, 'exam-chips');
        classList.style.display = 'grid';
        const detail = node('div');
        function paintDetail() {
            classList.replaceChildren();
            for (const item of classes) {
                const matched = !query || (item.roster || []).some(student => String(student.name).toLowerCase().includes(query));
                const button = node('button', null, 'exam-class' + (item === current ? ' on' : ''));
                button.type = 'button';
                button.style.opacity = matched ? '' : '.35';
                const copy = node('span');
                copy.append(node('strong', item.label), node('small', '已交 ' + item.submitted + ' / ' + item.students));
                button.append(copy, node('b', scoreText(item, suite)));
                button.onclick = () => { current = item; paintDetail(); };
                classList.append(button);
            }
            detail.replaceChildren();
            if (!current) { detail.append(node('p', '没有班级', 'exam-empty')); return; }
            const people = (current.roster || []).filter(student => !query || String(student.name).toLowerCase().includes(query));
            const missing = people.filter(student => !student.submitted).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
            const done = people.filter(student => student.submitted).sort((a, b) => order === 'score' ? (Number(suite ? b.band?.label : b.accuracy)||0)-(Number(suite ? a.band?.label : a.accuracy)||0) : String(a.name).localeCompare(String(b.name), 'zh'));
            const heading=node('div',null,'exam-detail-heading'); heading.append(node('strong',current.label),node('span','已交 '+current.submitted+' / '+current.students));
            const progress=node('progress',null,'exam-progress');progress.max=current.students||1;progress.value=current.submitted||0;progress.setAttribute('aria-label',current.label+'交卷进度');
            detail.append(heading,progress,classCharts(current, suite));
            const split = node('div', null, 'exam-split');
            for (const [title, rows] of [['未交 ' + missing.length, missing], [suite ? '已交 · 雅思分' : '已交 · 正确率', done]]) {
                const section = document.createElement('section');
                section.append(node('h3', title));
                if (!rows.length) section.append(node('p', '没有', 'exam-empty'));
                for (const student of rows) {
                    const line = document.createElement('div');
                    line.append(node('span', student.name), node('span', markOf(student, suite)));
                    section.append(line);
                }
                split.append(section);
            }
            detail.append(split);
        }
        search.oninput = () => {
            query = search.value.trim().toLowerCase();
            if (query) {
                const hit = classes.find(item => (item.roster || []).some(student => String(student.name).toLowerCase().includes(query)));
                if (hit) current = hit;
            }
            paintDetail();
        };
        const tools = node('div',null,'exam-list-tools');tools.append(search,sort);
        card.replaceChildren(summary, tools, body);
        body.append(classList, detail);
        if (suite) card.append(node('p', '按 40 题换算雅思分，未答计错。', 'exam-foot'));
        paintDetail();
    }
    button.onclick = async () => {
        open = true;
        try { await showList(); }
        catch (error) { view.replaceChildren(node('p', error.message || '考试管理加载失败', 'exam-empty')); }
    };
    for (const id of ['overview', 'navReadingTypes', 'navListeningTypes', 'navPassage','navListeningPassage']) {
        $(id)?.addEventListener('click', () => { if (open) unpin(); });
    }
    $('refresh')?.addEventListener('click', () => { if (open) setTimeout(pin, 0); });
    $('range')?.addEventListener('change', () => { if (open) setTimeout(pin, 0); });
})();
