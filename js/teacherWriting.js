(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const main = document.querySelector('main');
    if (!main) return;

    const view = document.createElement('section');
    view.id = 'writingView';
    view.hidden = true;
    main.append(view);

    const nav = document.createElement('button');
    nav.id = 'navWriting';
    nav.type = 'button';
    nav.textContent = '写作任务';
    const exams = $('navExams');
    if (exams) exams.after(nav);
    else {
        const label = document.createElement('div');
        label.className = 'side-label';
        label.textContent = '安排';
        $('sideNav')?.append(label, nav);
    }

    const style = document.createElement('style');
    style.textContent = `
main > header .toolbar[hidden],main > section.panel[hidden]{display:none!important}
#writingView[hidden]{display:none}
#writingView{position:fixed;z-index:30;top:0;right:0;bottom:0;left:188px;max-width:calc(100vw - 188px);overflow:auto;box-sizing:border-box;background:#f6f8fa;padding:20px 20px 24px}
#writingView.is-list{padding:32px 28px 48px}
@media(max-width:1000px){#writingView{left:172px;max-width:calc(100vw - 172px);padding:22px}#writingView.is-list{padding:20px}}
@media(max-width:650px){#writingView{position:relative;left:auto;max-width:100%;padding:12px}#writingView.is-list{padding:12px}}
#writingView .wr-page{width:min(1480px,100%);min-width:0;margin:0 auto;display:grid;gap:18px}
#writingView .wr-page.wr-page-list{width:min(1180px,100%)}
#writingView h2{margin:0;font-size:22px}
#writingView h2 .wr-count{margin-left:10px;font-size:13px;font-weight:500;color:#8a958f;font-variant-numeric:tabular-nums;letter-spacing:.02em}
#writingView h3{margin:0;font-size:16px}
#writingView .wr-roster{display:grid;grid-template-columns:minmax(200px,260px) minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:800px){#writingView .wr-roster{grid-template-columns:1fr}}
#writingView .wr-classes{display:grid;gap:8px;align-content:start}
#writingView .wr-classes button{display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:10px}
#writingView .wr-classes button.active{border-color:#087e66;background:#eef8f4;color:#174b40}
#writingView .wr-classes strong{display:block;font-size:15px}
#writingView .wr-classes small{display:block;margin-top:4px;font-size:12px;color:#607080;font-weight:500}
#writingView .wr-classes button.active small{color:#174b40}
#writingView .wr-students{min-width:0}
#writingView button{padding:9px 14px;border-radius:8px;border:1px solid #ccd6df;background:#fff;color:#1d332c;cursor:pointer;font:inherit}
#writingView button:hover{border-color:#087e66}
#writingView button.primary{background:#087e66;border-color:#087e66;color:#fff}
#writingView button.primary:hover{background:#076a56}
#writingView button.danger{color:#9b3030;border-color:#e8c4c4}
#writingView button[disabled]{opacity:.55;cursor:default}
#writingView input,#writingView select,#writingView textarea{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ccd6df;border-radius:6px;background:#fff;color:inherit;font:inherit}
#writingView textarea{resize:vertical;line-height:1.7}
#writingView textarea.wr-prompt{min-height:150px}
#writingView textarea.wr-comment{min-height:110px}
#writingView .exam-top{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
#writingView .exam-card{background:#fff;border:1px solid #e0e8e3;border-radius:14px;padding:24px;min-width:0;box-sizing:border-box;display:grid;gap:18px}
#writingView .exam-steps{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
#writingView .exam-steps li{padding:7px 12px;border-radius:999px;background:#eef4f0;color:#60756d;font-size:13px}
#writingView .exam-steps li.on{background:#087e66;color:#fff}
#writingView .exam-label{display:block;margin:0 0 8px;font-size:12px;color:#6b8177}
#writingView .exam-chips{display:flex;flex-wrap:wrap;gap:10px}
#writingView .exam-choice{padding:8px 16px;border-radius:999px;font-size:14px}
#writingView .exam-choice.active{background:#087e66;color:#fff;border-color:#087e66}
#writingView .exam-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#writingView .exam-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
#writingView .exam-foot{font-size:12px;color:#6b8177;margin:0;line-height:1.6}
#writingView .exam-dashboard{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
#writingView .exam-dashboard button{min-width:0;text-align:left;border:1px solid #dce3e9;background:#fff;border-radius:10px;padding:14px!important}
#writingView .exam-dashboard button.active{border-color:#087e66;background:#eef8f4;color:#174b40}
#writingView .exam-dashboard button span{display:block;font-size:13px;color:#607080}
#writingView .exam-dashboard strong{display:block;font-size:24px;margin-top:6px;color:#17332b}
#writingView .exam-list-tools{display:flex;gap:12px;flex-wrap:wrap}
#writingView .exam-list-tools input{flex:1;min-width:170px}
#writingView .exam-list-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;padding:20px 0;border-bottom:1px solid #e2e8f0}
#writingView .exam-list-item h3{font-size:17px;margin:0 0 8px;overflow-wrap:anywhere}
#writingView .exam-list-item p{margin:6px 0;color:#607080;font-size:13px;line-height:1.65}
#writingView .exam-list-item .exam-actions{justify-content:flex-end}
#writingView .exam-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:12px;background:#eef4f0;color:#476257;margin-left:10px}
#writingView .exam-badge.live{background:#e6f4ee;color:#087e66}
#writingView .exam-badge.wait{background:#fff4df;color:#9a6b00}
#writingView .exam-badge.done,#writingView .exam-badge.off{background:#f2f2f2;color:#666}
#writingView .wr-preview{display:block;max-width:min(360px,100%);max-height:240px;border:1px solid #dbe4df;border-radius:0}
#writingView .wr-preview[hidden]{display:none}
#writingView .wr-pick{border:1px solid #dce3e9;background:#fff;padding:12px 16px;display:grid;gap:0}
#writingView .wr-pick.is-open{padding-bottom:14px;gap:10px}
#writingView .wr-pick-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
#writingView .wr-pick-toggle{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#17332b;cursor:pointer}
#writingView .wr-pick-toggle input{width:14px;height:14px;margin:0;accent-color:#0b7a63;cursor:pointer}
#writingView .wr-pick-note{font-size:12px;color:#6b8177}
#writingView .wr-pick-note:empty{display:none}
#writingView .wr-pick-body{display:grid;gap:10px}
#writingView .wr-pick-body[hidden]{display:none}
#writingView .wr-pick-chosen{display:flex;flex-wrap:wrap;gap:6px}
#writingView .wr-pick-chosen:empty{display:none}
#writingView .wr-pick-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid #bcd7cb;background:#eef8f4;border-radius:999px;font-size:12px;color:#0b3f33}
#writingView .wr-pick-chip button{border:0;background:transparent;padding:0;font-size:13px;line-height:1;color:#5b7168}
#writingView .wr-pick-list{max-height:264px;overflow:auto;border-top:1px solid #eef2ef}
#writingView .wr-pick-list:empty{display:none}
#writingView .wr-pick-row{display:flex;gap:10px;align-items:center;width:100%;padding:8px 4px;border:0;border-bottom:1px solid #f2f5f3;border-radius:0;background:transparent;text-align:left;font:inherit;cursor:pointer}
#writingView .wr-pick-row:hover{background:#f6faf8}
#writingView .wr-pick-row.on{background:#f1f8f4}
#writingView .wr-pick-row i{width:14px;height:14px;flex:0 0 auto;border:1px solid #c4d2cb;background:#fff;border-radius:3px;display:inline-block;position:relative}
#writingView .wr-pick-row.on i{border-color:#0b7a63;background:#0b7a63}
#writingView .wr-pick-row.on i::after{content:"";position:absolute;left:3px;top:1px;width:5px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(42deg)}
#writingView .wr-pick-name{font-size:13px;color:#17332b;min-width:0;overflow-wrap:anywhere}
#writingView .wr-pick-meta{margin-left:auto;flex:0 0 auto;font-size:11.5px;color:#8a958f}
#writingView .wr-pick-empty{margin:0;padding:10px 2px;font-size:12.5px;color:#8a958f}
#writingView .wr-pick-empty:empty{display:none}
#writingView .wr-minutes{max-width:190px}
#writingView .wr-status{font-size:13px;color:#087e66}
#writingView .wr-grade{display:grid;grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(220px,260px);height:auto;min-height:0;border:1px solid #e0e8e3;border-radius:0;overflow:hidden;background:#fff}
#writingView .wr-sheet{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:#fff}
#writingView .wr-sheet+.wr-sheet{border-left:1px solid #e6ece8}
#writingView .wr-sheet-head{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:10px 18px;border-bottom:1px solid #eef2ef;background:#fbfdfc;font-size:13px;color:#5b7168;flex:0 0 auto}
#writingView .wr-sheet-head strong{color:#17332b;font-size:14px}
#writingView .wr-sheet-body{flex:1 1 auto;min-height:0;overflow:auto;padding:18px 20px}
#writingView .wr-prompt-title{margin:0 0 14px;font-size:20px;line-height:1.42;color:#172f2a}
#writingView .wr-prompt-text{margin:0 0 18px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:14.5px;color:#3c4f47}
#writingView .wr-prompt-img{display:block;width:100%;height:auto;border:1px solid #e0e6e2;border-radius:0;background:#fff;cursor:zoom-in}
#writingView .wr-ai{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:18px;padding-top:16px;border-top:1px dashed #e2e8e4}
#writingView .wr-ai button{border:1px solid #0b7a63;background:#0b7a63;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;line-height:1.4}
#writingView .wr-ai button:hover{background:#096a56}
#writingView .wr-ai button:disabled{opacity:.6;cursor:default}
#writingView .wr-ai-note{flex:1 1 160px;font-size:12.5px;color:#6b8177;line-height:1.6}
#writingView .wr-ai-note:empty{display:none}
#writingView .wr-essay-surface{min-height:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.95;font-size:16.5px;cursor:text}
#writingView .wr-sheet-body.wr-essay-body{min-height:min(460px,72vh)}
#writingView .wr-essay-surface::selection,#writingView .wr-essay-surface *::selection{background:#ffe9a8}
#writingView .wr-hl{border-radius:0;padding:1px 0;cursor:pointer;transition:box-shadow .15s ease}
#writingView .wr-hl-note{background:#fbf3cf}
#writingView .wr-hl-note.is-bridge{padding-bottom:0}
#writingView .wr-hl-note.has-inner,#writingView .wr-hl.has-inner>.wr-hl{padding-bottom:0;background-image:linear-gradient(#e7d79c,#e7d79c);background-repeat:no-repeat;background-size:100% 2.6px;background-position:0 100%}
#writingView .wr-hl-replace{background:#dcefe6}
#writingView .wr-hl-delete{background:#fae2e2;color:#8d3b3b;text-decoration:line-through}
#writingView .wr-hl-replace::after{content:" → " attr(data-replacement);color:#0f6b57;font-weight:600;text-decoration:none;white-space:pre-wrap}
#writingView .wr-hl::before{content:attr(data-no);display:inline-block;margin-right:3px;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b958f;vertical-align:super;text-decoration:none}
#writingView .wr-hl:hover{box-shadow:0 0 0 1px rgba(15,107,87,.32)}
#writingView .wr-hl.is-focus{box-shadow:0 0 0 2px rgba(15,107,87,.45)}
#writingView .wr-rail{display:flex;flex-direction:column;min-height:0;background:#fbfbfa}
#writingView .wr-rail-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 18px 12px;border-bottom:1px solid #e7ebe9;flex:0 0 auto}
#writingView .wr-rail-head strong{font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#74807a}
#writingView .wr-rail-head span{font-size:11.5px;color:#8a958f}
#writingView .wr-rail-body{flex:1 1 auto;min-height:0;overflow:auto;padding:2px 18px 26px;display:grid;gap:0;align-content:start}
#writingView .wr-rail-empty{margin:14px 0;font-size:13px;line-height:1.75;color:#74807a}
#writingView .wr-rail-card{padding:11px 0 12px;border:0;border-bottom:1px solid #e9ecea;border-radius:0;background:transparent;display:grid;gap:6px;cursor:pointer;transition:background-color .15s ease}
#writingView .wr-rail-card:hover{background:#f4f7f5}
#writingView .wr-rail-card.is-focus{background:#f1f6f3;box-shadow:inset 2px 0 0 #0f6b57}
#writingView .wr-rail-card.is-editing{background:#fff;box-shadow:inset 0 0 0 1px #d9e2dd;border-radius:0;padding:12px;border-bottom-color:transparent}
#writingView .wr-rail-top{display:flex;align-items:baseline;gap:8px}
#writingView .wr-rail-no{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b958f;font-variant-numeric:tabular-nums}
#writingView .wr-rail-kind{font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#74807a}
#writingView .wr-rail-kind.replace{color:#0f6b57}
#writingView .wr-rail-kind.delete{color:#9a4a4a}
#writingView .wr-rail-quote{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;margin:0;padding:0 0 0 9px;border-left:2px solid #dfe4e1;font-size:12px;line-height:1.55;color:#66716b;overflow-wrap:anywhere}
#writingView .wr-rail-note{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-size:13px;line-height:1.7;color:#1c211e;white-space:pre-wrap;overflow-wrap:anywhere}
#writingView .wr-rail-repl{margin:0;font-size:12.5px;line-height:1.6;color:#0f6b57;overflow-wrap:anywhere}
#writingView .wr-rail-actions{display:flex;gap:4px;justify-content:flex-end;margin-left:auto}
#writingView .wr-rail-actions button{padding:2px 7px;border-radius:5px;font-size:11.5px;line-height:1.5;opacity:0;transition:opacity .15s ease}
#writingView .wr-rail-card:hover .wr-rail-actions button,#writingView .wr-rail-card.is-focus .wr-rail-actions button{opacity:1}
@media(hover:none){#writingView .wr-rail-actions button{opacity:1}}
#writingView .wr-rail-input{font-size:13px!important;padding:7px 9px!important}
#writingView .wr-scorebar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 18px;border-top:1px solid #eef2ef;background:#fbfdfc;flex:0 0 auto}
#writingView .wr-scorebar label{display:flex;gap:6px;align-items:center;font-size:12px;color:#6b8177}
#writingView .wr-scorebar select{padding:6px 8px;font-size:13px;width:auto}
#writingView .wr-scorebar .wr-total{display:flex;gap:8px;align-items:baseline;padding:4px 12px;border-radius:8px;background:#eef8f4}
#writingView .wr-scorebar .wr-total strong{font-size:20px;font-variant-numeric:tabular-nums;color:#0b3f33}
#writingView .wr-essay-foot{padding:12px 18px 14px;border-top:1px solid #eef2ef;background:#fff;flex:0 0 auto}
#writingView .wr-essay-foot textarea{min-height:56px}
#writingView .wr-essay-foot .wr-actions{margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#writingView .wr-empty{margin:6px 0;color:#6b8177}
@media(max-width:1180px){#writingView .wr-grade{grid-template-columns:minmax(240px,300px) minmax(0,1fr)}#writingView .wr-rail{grid-column:1/-1;border-top:1px solid #e6ece8;max-height:40vh}}
@media(max-width:860px){#writingView .wr-grade{grid-template-columns:1fr;height:auto}#writingView .wr-sheet+.wr-sheet{border-left:0;border-top:1px solid #e6ece8}#writingView .wr-sheet-body{max-height:58vh}#writingView .wr-rail{max-height:none}}
.wr-selbar{position:fixed;z-index:2147482500;display:none;border:1px solid #737373;border-radius:6px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.22);overflow:hidden}
.wr-selbar.is-open{display:flex}
.wr-selbar button{margin:0;border:0;border-radius:0;padding:8px 14px;background:#fff;color:#172f2a;font:14px system-ui;cursor:pointer}
.wr-selbar button+button{border-left:1px solid #e4e4e4}
.wr-selbar button:hover{background:#eef7f3}
.wr-selbar button.danger:hover{background:#fdecec;color:#9b3030}
.wr-marker{position:fixed;z-index:2147482499;display:none;width:min(330px,calc(100vw - 24px));padding:12px;border:1px solid #cfdad4;border-radius:12px;background:#fff;box-shadow:0 18px 40px rgba(15,23,42,.22);font:14px system-ui;color:#172f2a}
.wr-marker.is-open{display:grid;gap:8px}
.wr-marker small{color:#6b8177;font-size:12px;line-height:1.5}
.wr-marker textarea,.wr-marker input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cfdad4;border-radius:8px;font:inherit;color:inherit;background:#fff}
.wr-marker textarea{min-height:64px;resize:vertical;line-height:1.6}
.wr-marker-actions{display:flex;gap:8px;justify-content:flex-end}
.wr-marker-actions button{padding:7px 13px;border-radius:8px;border:1px solid #cfdad4;background:#fff;color:#172f2a;cursor:pointer;font:inherit}
.wr-marker-actions button.primary{background:#0b7c65;border-color:#0b7c65;color:#fff}
.wr-marker-actions button.danger{color:#9b3030;border-color:#e8b9b9;margin-right:auto}
#wr-zoom{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:32px;background:rgba(18,22,20,.84);cursor:zoom-out}
#wr-zoom[hidden]{display:none}
#wr-zoom img{max-width:100%;max-height:100%;border-radius:2px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.45)}
`;
    document.head.append(style);

    /* ---------------- helpers ---------------- */
    const headers = () => ({ 'Content-Type': 'application/json', 'X-IELTS-User': window.IELTS_ACCOUNT?.id || '' });

    function node(tag, text, cls) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (cls) el.className = cls;
        return el;
    }
    function zoomImage(source) {
        let box = document.getElementById('wr-zoom');
        if (!box) {
            box = node('div');
            box.id = 'wr-zoom';
            const image = node('img');
            image.alt = '题目配图放大';
            box.append(image);
            box.addEventListener('click', () => { box.hidden = true; });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') box.hidden = true;
            });
            document.body.append(box);
        }
        box.querySelector('img').src = source;
        box.hidden = false;
    }
    function pad(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
            + 'T' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }
    function stamp(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        });
    }
    function phase(task) {
        if (task.cancelled) return ['已撤回', 'off'];
        const now = Date.now();
        if (now < new Date(task.startAt).getTime()) return ['未开始', 'wait'];
        if (now > new Date(task.endAt).getTime()) return ['已结束', 'done'];
        return ['进行中', 'live'];
    }
    function overallBand(ta, cc, lr, gra) {
        if ([ta, cc, lr, gra].some(value => value === '' || value == null)) return null;
        const mean = (Number(ta) + Number(cc) + Number(lr) + Number(gra)) / 4;
        const whole = Math.floor(mean + 1e-9);
        const rest = mean - whole;
        if (rest < 0.25) return whole;
        if (rest < 0.75) return whole + 0.5;
        return Math.min(9, whole + 1);
    }
    function scoreOptions(select, value) {
        select.append(new Option('未给', ''));
        for (let number = 0; number <= 9; number += 1) {
            select.append(new Option(String(number), String(number)));
        }
        if (value != null) select.value = String(Math.round(Number(value)));
    }
    async function api(path, options) {
        const response = await fetch(path, Object.assign({ headers: headers(), cache: 'no-store' }, options));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '请求失败');
        return data;
    }

    /* ---------------- chrome ---------------- */
    let open = false;
    let markTimer = null;
    let markTeardown = null;
    function stopMarkTimer() {
        if (markTimer) { clearInterval(markTimer); markTimer = null; }
        markTeardown?.();
        markTeardown = null;
    }
    function setChrome(hidden) {
        const toolbar = document.querySelector('main > header .toolbar');
        const panel = document.querySelector('main > section.panel');
        if (toolbar) toolbar.hidden = hidden;
        if (panel) panel.hidden = hidden;
    }
    function pin(title) {
        ['classHome', 'classDetailGrid', 'overviewView', 'chartView', 'examView', 'backToClasses', 'studentNav']
            .forEach(id => { const el = $(id); if (el) el.hidden = true; });
        setChrome(true);
        view.hidden = false;
        $('title').textContent = title || '写作任务';
        $('subtitle').textContent = '';
        ['overview', 'navReadingTypes', 'navListeningTypes', 'navPassage', 'navListeningPassage', 'navExams', 'navWriting']
            .forEach(id => $(id)?.classList.toggle('active', id === 'navWriting'));
    }
    function unpin() {
        open = false;
        view.hidden = true;
        setChrome(false);
        $('navWriting')?.classList.remove('active');
    }
    function page(asList) {
        const root = node('div', null, asList ? 'wr-page wr-page-list' : 'wr-page');
        view.classList.toggle('is-list', !!asList);
        view.replaceChildren(root);
        return root;
    }

    /* ---------------- image ---------------- */
    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('图片无法读取'));
            reader.readAsDataURL(file);
        });
    }
    async function prepareImage(file) {
        if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片');
        if (file.size > 12 * 1024 * 1024) throw new Error('图片需小于 12 MB');
        return readFile(file);
    }

    /* ---------------- list ---------------- */
    const EMPTY = () => {
        const now = new Date();
        return {
            step: 1, kind: 'task1', title: '', prompt: '', image: '', minutes: 20,
            grades: new Set(), classes: new Set(), students: new Set(),
            start: pad(now), end: pad(new Date(now.getTime() + 24 * 3600000))
        };
    };
    let draft = EMPTY();
    let listCache = [];
    let rosterCache = null;
    let pickQuery = '';

    async function roster() {
        if (rosterCache) return rosterCache;
        const data = await api('/api/admin/writing/students');
        rosterCache = data.students || [];
        return rosterCache;
    }

    async function showList() {
        stopMarkTimer();
        pin('写作任务');
        const root = page(true);
        const top = node('div', null, 'exam-top');
        const create = node('button', '发布写作任务', 'primary');
        create.type = 'button';
        create.onclick = () => { draft = EMPTY(); paintCreate(); };
        const reload = node('button', '刷新');
        reload.type = 'button';
        reload.onclick = showList;
        const actions = node('div', null, 'exam-actions');
        actions.append(reload, create);
        top.append(node('h2', '写作任务'), actions);
        root.append(top);

        let data;
        try { data = await api('/api/admin/writing'); }
        catch (error) { root.append(node('p', error.message, 'wr-empty')); return; }
        listCache = data.tasks || [];

        const stats = node('div', null, 'exam-dashboard');
        let filter = 'all';
        let query = '';
        const card = node('div', null, 'exam-card');
        const tools = node('div', null, 'exam-list-tools');
        const search = node('input');
        search.type = 'search';
        search.placeholder = '搜索名称、年级或班级';
        tools.append(search);
        const list = node('div');
        const paint = () => {
            stats.replaceChildren();
            for (const [value, label] of [['all', '全部'], ['live', '进行中'], ['wait', '未开始'], ['done', '已结束'], ['off', '已撤回']]) {
                const item = node('button', null, filter === value ? 'active' : '');
                item.type = 'button';
                item.append(node('span', label), node('strong', String(listCache.filter(task => value === 'all' || phase(task)[1] === value).length)));
                item.onclick = () => { filter = value; paint(); };
                stats.append(item);
            }
            list.replaceChildren();
            const rows = listCache.filter(task => {
                if (filter !== 'all' && phase(task)[1] !== filter) return false;
                if (!query) return true;
                return [task.title, ...(task.grades || []), ...(task.classes || []).map(item => item + '班')]
                    .join(' ').toLowerCase().includes(query);
            });
            if (!rows.length) {
                list.append(node('p', listCache.length ? '没有符合条件的任务。' : '还没有写作任务，点击“发布写作任务”开始安排。', 'wr-empty'));
                return;
            }
            for (const task of rows) {
                const [label, status] = phase(task);
                const row = node('div', null, 'exam-list-item');
                const copy = node('div');
                const title = node('h3', task.title);
                title.append(node('span', label, 'exam-badge ' + status));
                copy.append(title, node('p',
                    (task.kind === 'task1' ? '小作文 Task 1' : '大作文 Task 2')
                    + ' · ' + task.minutes + ' 分钟 · ' + (task.grades || []).join('、')
                    + ' · ' + ((task.classes || []).length ? task.classes.map(item => item + '班').join('、') : '全部班级')
                    + ((task.students || []).length ? ' · 指定 ' + task.students.length + ' 人' : '')),
                    node('p', stamp(task.startAt) + ' — ' + stamp(task.endAt) + ' · 已交 ' + (task.submitted || 0) + ' 份 · 已批改 ' + (task.graded || 0) + ' 份'));
                const actions = node('div', null, 'exam-actions');
                const mark = node('button', '批改', 'primary');
                mark.type = 'button';
                mark.onclick = () => showAttempts(task);
                actions.append(mark);
                if (!task.cancelled) {
                    const cancel = node('button', '撤回');
                    cancel.type = 'button';
                    cancel.onclick = async () => {
                        if (!confirm('撤回后学生不再看到这个写作任务，已提交的作文仍可批改。')) return;
                        try { await api('/api/admin/writing/cancel', { method: 'POST', body: JSON.stringify({ id: task.id }) }); showList(); }
                        catch (error) { alert(error.message); }
                    };
                    actions.append(cancel);
                }
                const remove = node('button', '删除');
                remove.type = 'button';
                remove.onclick = async () => {
                    if (!confirm('删除后题目、作答和批改都会移除，且无法恢复。')) return;
                    try { await api('/api/admin/writing/delete', { method: 'POST', body: JSON.stringify({ id: task.id }) }); showList(); }
                    catch (error) { alert(error.message); }
                };
                actions.append(remove);
                row.append(copy, actions);
                list.append(row);
            }
        };
        search.oninput = () => { query = search.value.trim().toLowerCase(); paint(); };
        card.append(tools, list);
        root.append(stats, card);
        paint();
    }

    /* ---------------- publish ---------------- */
    function steps(step) {
        const list = node('ol', null, 'exam-steps');
        ['题型', '题目和配图', '对象和时间'].forEach((name, index) => {
            list.append(node('li', (index + 1) + ' ' + name, index + 1 === step ? 'on' : ''));
        });
        return list;
    }
    function choice(label, active, onclick) {
        const item = node('button', label, 'exam-choice' + (active ? ' active' : ''));
        item.type = 'button';
        item.onclick = onclick;
        return item;
    }
    function paintCreate() {
        stopMarkTimer();
        pin('发布写作任务');
        const root = page(true);
        const card = node('div', null, 'exam-card');
        const top = node('div', null, 'exam-top');
        const back = node('button', draft.step === 1 ? '返回列表' : '上一步');
        back.type = 'button';
        back.onclick = () => {
            if (draft.step === 1) showList();
            else { draft.step -= 1; paintCreate(); }
        };
        top.append(node('h2', '发布写作任务'), back);
        card.append(top, steps(draft.step));

        if (draft.step === 1) {
            const chips = node('div', null, 'exam-chips');
            [['task1', '小作文 Task 1'], ['task2', '大作文 Task 2']].forEach(([value, label]) => {
                chips.append(choice(label, draft.kind === value, () => {
                    draft.kind = value;
                    draft.minutes = value === 'task1' ? 20 : 40;
                    paintCreate();
                }));
            });
            const next = node('button', '下一步', 'primary');
            next.type = 'button';
            next.onclick = () => { draft.step = 2; paintCreate(); };
            const actions = node('div', null, 'exam-actions');
            actions.append(next);
            card.append(node('span', '题型', 'exam-label'), chips, actions);
            root.append(card);
            return;
        }

        if (draft.step === 2) {
            const title = node('input');
            title.placeholder = '任务名称，可留空';
            title.maxLength = 80;
            title.value = draft.title;
            title.oninput = () => { draft.title = title.value; };
            const prompt = document.createElement('textarea');
            prompt.className = 'wr-prompt';
            prompt.placeholder = '写作题目，或图表说明';
            prompt.value = draft.prompt;
            prompt.oninput = () => { draft.prompt = prompt.value; };
            const file = document.createElement('input');
            file.type = 'file';
            file.accept = 'image/jpeg,image/png,image/webp,image/gif';
            const preview = node('img', null, 'wr-preview');
            preview.alt = '题目配图预览';
            preview.hidden = !draft.image;
            if (draft.image) preview.src = draft.image;
            const remove = node('button', '去掉配图');
            remove.type = 'button';
            remove.hidden = !draft.image;
            remove.onclick = () => { draft.image = ''; paintCreate(); };
            let busy = false;
            file.onchange = async () => {
                const picked = file.files?.[0];
                if (!picked || busy) return;
                busy = true;
                try {
                    draft.image = await prepareImage(picked);
                    paintCreate();
                } catch (error) {
                    alert(error.message || '图片处理失败');
                } finally { busy = false; }
            };
            const next = node('button', '下一步', 'primary');
            next.type = 'button';
            next.onclick = () => {
                if (draft.prompt.trim().length < 8) { alert('题目至少需要 8 个字'); return; }
                draft.step = 3;
                paintCreate();
            };
            const actions = node('div', null, 'exam-actions');
            actions.append(next);
            card.append(node('span', '名称', 'exam-label'), title,
                node('span', '题目', 'exam-label'), prompt,
                node('span', '配图，可留空。', 'exam-label'), file, preview, remove, actions);
            root.append(card);
            return;
        }

        const grades = node('div', null, 'exam-chips');
        for (const grade of ['G12', 'G11', 'G10', 'Pre', 'English Dept.']) {
            grades.append(choice(grade, draft.grades.has(grade), () => {
                if (draft.grades.has(grade)) draft.grades.delete(grade); else draft.grades.add(grade);
                paintCreate();
            }));
        }
        const classes = node('div', null, 'exam-chips');
        for (let index = 1; index <= 9; index += 1) {
            const value = String(index);
            classes.append(choice(index + ' 班', draft.classes.has(value), () => {
                if (draft.classes.has(value)) draft.classes.delete(value); else draft.classes.add(value);
                paintCreate();
            }));
        }

        /* ---- 指定学生 ---- */
        const people = { rows: [] };
        let loaded = false;
        let loading = false;
        let failed = '';
        let pickOpen = draft.students.size > 0;

        const picker = node('div', null, 'wr-pick');
        const pickHead = node('div', null, 'wr-pick-head');
        const toggle = node('label', null, 'wr-pick-toggle');
        const toggleBox = document.createElement('input');
        toggleBox.type = 'checkbox';
        toggleBox.checked = pickOpen;
        toggle.append(toggleBox, node('span', '指定学生'));
        const pickNote = node('span', null, 'wr-pick-note');
        pickHead.append(toggle, pickNote);

        const pickBody = node('div', null, 'wr-pick-body');
        const chosen = node('div', null, 'wr-pick-chosen');
        const pickerSearch = node('input');
        pickerSearch.type = 'search';
        pickerSearch.placeholder = '搜索姓名、年级或班级';
        pickerSearch.value = pickQuery;
        const pickList = node('div', null, 'wr-pick-list');
        pickBody.append(chosen, pickerSearch, pickList);
        picker.append(pickHead, pickBody);

        const personOf = id => people.rows.find(item => item.id === id);
        const meetsScope = person => (draft.grades.size ? draft.grades.has(person.grade) : true)
            && (draft.classes.size ? draft.classes.has(person.className) : true);

        function paintChosen() {
            chosen.replaceChildren();
            const ids = [...draft.students];
            if (!pickOpen) {
                pickNote.textContent = '';
            } else if (!ids.length) {
                pickNote.textContent = '勾选学生后只发给这些人';
            } else {
                pickNote.textContent = '已勾选 ' + ids.length + ' 人，只发给这些人';
            }
            for (const id of ids) {
                const person = personOf(id);
                const chip = node('span', null, 'wr-pick-chip');
                chip.append(node('span', person ? person.name : id));
                const drop = node('button', '×');
                drop.type = 'button';
                drop.title = '移除';
                drop.onclick = () => {
                    draft.students.delete(id);
                    paintChosen();
                    paintRows();
                };
                chip.append(drop);
                chosen.append(chip);
            }
        }

        function paintRows() {
            pickList.replaceChildren();
            if (!pickOpen) return;
            if (failed) {
                pickList.append(node('p', failed, 'wr-pick-empty'));
                return;
            }
            if (!loaded) {
                pickList.append(node('p', loading ? '正在加载学生名单…' : '', 'wr-pick-empty'));
                return;
            }
            const term = pickQuery.trim().toLowerCase();
            let rows = people.rows.filter(meetsScope);
            if (term) {
                rows = rows.filter(item => [item.name, item.grade, item.className].join(' ').toLowerCase().includes(term));
            }
            if (!rows.length) {
                pickList.append(node('p', people.rows.length ? '没有符合条件的学生' : '还没有学生账号', 'wr-pick-empty'));
                return;
            }
            const limit = 200;
            for (const person of rows.slice(0, limit)) {
                const row = node('button', null, 'wr-pick-row' + (draft.students.has(person.id) ? ' on' : ''));
                row.type = 'button';
                const meta = [person.grade, person.className ? person.className + ' 班' : ''].filter(Boolean).join(' · ');
                row.append(node('i'), node('span', person.name, 'wr-pick-name'), node('span', meta || '未填写班级', 'wr-pick-meta'));
                row.onclick = () => {
                    if (draft.students.has(person.id)) draft.students.delete(person.id);
                    else draft.students.add(person.id);
                    row.classList.toggle('on', draft.students.has(person.id));
                    paintChosen();
                };
                pickList.append(row);
            }
            if (rows.length > limit) {
                pickList.append(node('p', '只显示前 ' + limit + ' 人，用上面的搜索继续缩小。', 'wr-pick-empty'));
            }
        }

        function ensureRoster() {
            if (loaded || loading) return;
            loading = true;
            paintRows();
            roster().then(rows => {
                people.rows = rows;
                loaded = true;
                loading = false;
                paintChosen();
                paintRows();
            }).catch(error => {
                failed = error.message || '学生名单加载失败';
                loading = false;
                paintRows();
            });
        }

        function applyPick() {
            pickBody.hidden = !pickOpen;
            toggleBox.checked = pickOpen;
            picker.classList.toggle('is-open', pickOpen);
            if (pickOpen) ensureRoster();
            paintChosen();
            paintRows();
        }

        toggleBox.onchange = () => {
            pickOpen = toggleBox.checked;
            if (!pickOpen) {
                draft.students.clear();
                pickQuery = '';
                pickerSearch.value = '';
            }
            applyPick();
        };
        pickerSearch.oninput = () => { pickQuery = pickerSearch.value; paintRows(); };
        applyPick();

        const start = document.createElement('input');
        const end = document.createElement('input');
        const minutes = document.createElement('input');
        start.type = end.type = 'datetime-local';
        minutes.type = 'number';
        minutes.min = '5';
        minutes.max = '120';
        start.value = draft.start;
        end.value = draft.end;
        minutes.value = String(draft.minutes);
        start.oninput = () => { draft.start = start.value; };
        end.oninput = () => { draft.end = end.value; };
        minutes.oninput = () => { draft.minutes = Number(minutes.value); };
        const startWrap = node('div');
        startWrap.append(node('span', '开始', 'exam-label'), start);
        const endWrap = node('div');
        endWrap.append(node('span', '结束', 'exam-label'), end);
        const minuteWrap = node('div', null, 'wr-minutes');
        minuteWrap.append(node('span', '作答分钟', 'exam-label'), minutes);
        const times = node('div', null, 'exam-times');
        times.append(startWrap, endWrap);

        const status = node('span', '', 'wr-status');
        const publish = node('button', '发布', 'primary');
        publish.type = 'button';
        publish.onclick = async () => {
            const chosenIds = [...draft.students];
            let gradeValues = [...draft.grades];
            let classValues = [...draft.classes];
            if (chosenIds.length) {
                const picked = chosenIds.map(personOf).filter(Boolean);
                if (!gradeValues.length) gradeValues = [...new Set(picked.map(item => item.grade).filter(Boolean))];
                if (!classValues.length) classValues = [...new Set(picked.map(item => item.className).filter(Boolean))];
            } else if (!gradeValues.length) {
                alert('请选择年级，或指定具体学生');
                return;
            }
            publish.disabled = true;
            status.textContent = '发布中…';
            try {
                await api('/api/admin/writing', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: draft.title, kind: draft.kind, prompt: draft.prompt, image: draft.image,
                        minutes: Number(draft.minutes), grades: gradeValues, classes: classValues,
                        students: chosenIds,
                        start: draft.start, end: draft.end
                    })
                });
                draft = EMPTY();
                pickQuery = '';
                await showList();
            } catch (error) {
                alert(error.message);
            } finally {
                publish.disabled = false;
                status.textContent = '';
            }
        };
        const actions = node('div', null, 'exam-actions');
        actions.append(publish, status);
        card.append(
            node('span', '年级', 'exam-label'), grades,
            node('span', '班级，不选就是该年级全部班级', 'exam-label'), classes,
            picker,
            times, minuteWrap, actions
        );
        root.append(card);
    }

    /* ---------------- attempts ---------------- */
    async function showAttempts(task) {
        stopMarkTimer();
        pin(task.title);
        const root = page(true);
        const top = node('div', null, 'exam-top');
        const back = node('button', '返回列表');
        back.type = 'button';
        back.onclick = showList;
        top.append(node('h2', task.title), back);
        root.append(top);
        let data;
        try { data = await api('/api/admin/writing/attempts?id=' + encodeURIComponent(task.id)); }
        catch (error) { root.append(node('p', error.message, 'wr-empty')); return; }
        const submitted = (data.attempts || []).filter(item => item.submitted);
        const pending = submitted.filter(item => !item.graded).length;
        const card = node('div', null, 'exam-card');
        card.append(node('p', '已交 ' + submitted.length + ' 份 · 待批改 ' + pending + ' 份', 'exam-foot'));
        if (!submitted.length) card.append(node('p', '还没有学生提交。', 'wr-empty'));
        const groups = new Map();
        for (const item of data.attempts || []) {
            const key = (item.grade || '') + '\0' + (item.className || '');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }
        const keys = [...groups.keys()].sort((a, b) => {
            const [gradeA, classA] = a.split('\0');
            const [gradeB, classB] = b.split('\0');
            return gradeA.localeCompare(gradeB, 'zh')
                || (Number(classA) || 99) - (Number(classB) || 99)
                || classA.localeCompare(classB, 'zh');
        });
        let current = keys[0] || '';
        const rosterBox = node('div', null, 'wr-roster');
        const classList = node('div', null, 'wr-classes');
        const studentList = node('div', null, 'wr-students');
        function classLabel(key) {
            const [grade, className] = key.split('\0');
            return [grade, className ? className + ' 班' : ''].filter(Boolean).join(' · ') || '未填写班级';
        }
        function paintRoster() {
            classList.replaceChildren();
            for (const key of keys) {
                const people = groups.get(key);
                const done = people.filter(item => item.submitted).length;
                const button = node('button');
                button.type = 'button';
                if (key === current) button.className = 'active';
                const copy = node('span');
                copy.append(node('strong', classLabel(key)), node('small', '已交 ' + done + ' / ' + people.length));
                button.append(copy);
                button.onclick = () => { current = key; paintRoster(); };
                classList.append(button);
            }
            studentList.replaceChildren();
            if (!current) {
                studentList.append(node('p', '还没有学生进入。', 'wr-empty'));
                return;
            }
            const people = groups.get(current).slice().sort((a, b) => {
                if (Boolean(a.submitted) !== Boolean(b.submitted)) return a.submitted ? -1 : 1;
                return String(a.name).localeCompare(String(b.name), 'zh');
            });
            const roster = people.filter(item => item.submitted);
            studentList.append(node('h3', classLabel(current)));
            for (const item of people) {
                const row = node('div', null, 'exam-list-item');
                const copy = node('div');
                copy.append(node('h3', item.name));
                copy.append(node('p', item.submitted
                    ? item.wordCount + ' 词 · ' + stamp(item.submittedAt) + ' · ' + (item.graded ? '已批改 ' + (item.overall ?? '') : '待批改')
                    : '已进入，未提交'));
                const action = node('button', item.graded ? '查看 / 修改批改' : '批改', 'primary');
                action.type = 'button';
                if (!item.submitted) action.disabled = true;
                else action.onclick = () => showMark(task, item, roster);
                const actions = node('div', null, 'exam-actions');
                actions.append(action);
                row.append(copy, actions);
                studentList.append(row);
            }
        }
        rosterBox.append(classList, studentList);
        card.append(rosterBox);
        paintRoster();
        root.append(card);
    }

    /* ---------------- grader ---------------- */
    const MARK_META = {
        comment: { label: '批注', cls: 'wr-hl-note' },
        replace: { label: '替换', cls: 'wr-hl-replace' },
        delete: { label: '删除', cls: 'wr-hl-delete' }
    };

    function textOffset(rootEl, container, offset) {
        if (!rootEl.contains(container)) return null;
        if (container === rootEl) {
            let sum = 0;
            const children = rootEl.childNodes;
            for (let i = 0; i < offset && i < children.length; i += 1) sum += (children[i].textContent || '').length;
            return sum;
        }
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        let total = 0;
        let current = walker.nextNode();
        while (current) {
            if (current === container) return total + offset;
            total += current.nodeValue.length;
            current = walker.nextNode();
        }
        return null;
    }

    async function showMark(task, meta, roster) {
        stopMarkTimer();
        markTeardown?.();
        markTeardown = null;
        pin('批改 · ' + meta.name);
        let data;
        try { data = await api('/api/admin/writing/attempt?id=' + encodeURIComponent(meta.id)); }
        catch (error) { alert(error.message); return; }
        const attempt = data.attempt;
        const paper = data.task;
        const feedback = data.feedback || {};
        const essay = attempt.text || '';
        let marks = Array.isArray(feedback.annotations)
            ? feedback.annotations
                .filter(item => item && Number.isFinite(Number(item.from)) && Number.isFinite(Number(item.to)))
                .map(item => ({
                    kind: MARK_META[item.kind] ? item.kind : 'comment',
                    from: Number(item.from), to: Number(item.to),
                    note: String(item.note || ''), replacement: String(item.replacement || '')
                }))
            : [];

        const root = page();
        const index = roster.findIndex(row => row.id === meta.id);

        /* ---- header ---- */
        const head = node('div', null, 'exam-top');
        const back = node('button', '返回名单');
        back.type = 'button';
        back.onclick = () => showAttempts(task);
        const prev = node('button', '上一份');
        prev.type = 'button';
        prev.disabled = index <= 0;
        prev.onclick = () => showMark(task, roster[index - 1], roster);
        const next = node('button', '下一份');
        next.type = 'button';
        next.disabled = index >= roster.length - 1;
        next.onclick = () => showMark(task, roster[index + 1], roster);
        const headActions = node('div', null, 'exam-actions');
        headActions.append(back, prev, next);
        const headTitle = node('h2');
        headTitle.append(document.createTextNode(meta.name),
            node('span', (index + 1) + '/' + roster.length, 'wr-count'));
        head.append(headTitle, headActions);
        root.append(head);

        const board = node('div', null, 'wr-grade');

        /* ---- left sheet: the question paper ---- */
        const left = node('section', null, 'wr-sheet');
        const leftHead = node('div', null, 'wr-sheet-head');
        leftHead.append(
            node('strong', paper.kind === 'task1' ? '小作文 Task 1' : '大作文 Task 2'),
            node('span', '建议 ' + paper.minutes + ' 分钟')
        );
        const leftBody = node('div', null, 'wr-sheet-body');
        leftBody.append(node('h3', paper.title, 'wr-prompt-title'));
        if (paper.prompt) leftBody.append(node('p', paper.prompt, 'wr-prompt-text'));
        if (paper.imageId) {
            const image = document.createElement('img');
            image.className = 'wr-prompt-img';
            image.alt = paper.title || '题目配图';
            image.src = '/writing-image/' + encodeURIComponent(paper.imageId);
            image.addEventListener('click', () => zoomImage(image.src));
            leftBody.append(image);
        }
        left.append(leftHead, leftBody);

        /* ---- AI grammar check ---- */
        const aiBox = node('div', null, 'wr-ai');
        const aiBtn = node('button', 'AI 语法批改');
        aiBtn.type = 'button';
        const aiNote = node('span', '', 'wr-ai-note');
        aiBox.append(aiBtn, aiNote);
        aiBtn.onclick = async () => {
            if (aiBtn.disabled) return;
            if (!essay.trim()) { aiNote.textContent = '这份作答还没有内容。'; return; }
            aiBtn.disabled = true;
            aiNote.textContent = '正在让 AI 检查语法…';
            try {
                const result = await api('/api/admin/writing/ai-grammar', {
                    method: 'POST',
                    body: JSON.stringify({ id: attempt.id })
                });
                const incoming = Array.isArray(result.annotations) ? result.annotations : [];
                let added = 0;
                let skipped = 0;
                for (const item of incoming) {
                    const from = Number(item.from);
                    const to = Number(item.to);
                    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
                    if (to > essay.length) continue;
                    const kind = MARK_META[item.kind] ? item.kind : 'comment';
                    if (clashes(from, to, -1, kind)) { skipped += 1; continue; }
                    marks.push({
                        kind, from, to,
                        note: String(item.note || ''),
                        replacement: kind === 'replace' ? String(item.replacement || '') : ''
                    });
                    added += 1;
                }
                render();
                if (!added) {
                    aiNote.textContent = skipped
                        ? 'AI 找到的 ' + skipped + ' 处与已有替换/删除标记冲突，没有新增。'
                        : 'AI 没有发现明显的语法问题。';
                } else {
                    aiNote.textContent = 'AI 添加了 ' + added + ' 处'
                        + (skipped ? '，另有 ' + skipped + ' 处与已有标记冲突未加入' : '')
                        + '，请检查后保存。';
                    status.textContent = 'AI 已添加 ' + added + ' 处批注，记得保存';
                }
            } catch (error) {
                aiNote.textContent = error.message || 'AI 批改失败，请稍后再试。';
            } finally {
                aiBtn.disabled = false;
            }
        };
        leftBody.append(aiBox);

        /* ---- right sheet: the essay ---- */
        const right = node('section', null, 'wr-sheet');
        const rightHead = node('div', null, 'wr-sheet-head');
        rightHead.append(
            node('strong', '学生作文'),
            node('span', (attempt.wordCount || 0) + ' 词'),
            node('span', '用时 ' + Math.max(1, Math.round((attempt.duration || 0) / 60)) + ' 分钟'),
            node('span', stamp(attempt.submittedAt))
        );
        const rightBody = node('div', null, 'wr-sheet-body wr-essay-body');
        const surface = node('div', null, 'wr-essay-surface');
        rightBody.append(surface);
        right.append(rightHead, rightBody);

        /* ---- scores ---- */
        const scorebar = node('div', null, 'wr-scorebar');
        const fields = {};
        const total = node('strong', '—');
        function paintTotal() {
            const value = overallBand(fields.ta.value, fields.cc.value, fields.lr.value, fields.gra.value);
            total.textContent = value == null ? '—' : value.toFixed(1);
        }
        [['ta', 'TA/TR'], ['cc', 'CC'], ['lr', 'LR'], ['gra', 'GRA']].forEach(([key, label]) => {
            const wrap = node('label', label);
            const select = document.createElement('select');
            scoreOptions(select, feedback[key]);
            select.onchange = paintTotal;
            fields[key] = select;
            wrap.append(select);
            scorebar.append(wrap);
        });
        const totalBox = node('div', null, 'wr-total');
        totalBox.append(node('span', '总分'), total);
        scorebar.append(totalBox);
        paintTotal();
        right.append(scorebar);

        const foot = node('div', null, 'wr-essay-foot');
        const comment = document.createElement('textarea');
        comment.className = 'wr-comment';
        comment.placeholder = '给学生的总评';
        comment.value = feedback.comment || '';
        const status = node('span', '', 'wr-status');
        const saveDraft = node('button', '保存草稿');
        saveDraft.type = 'button';
        const publish = node('button', '发给学生', 'primary');
        publish.type = 'button';
        const actions = node('div', null, 'wr-actions');
        actions.append(saveDraft, publish, status);
        foot.append(comment, actions);
        right.append(foot);

        /* ---- comment rail: collaborative-document style ---- */
        const rail = node('div', null, 'wr-rail');
        const railHead = node('div', null, 'wr-rail-head');
        const railTitle = node('strong', '批注');
        const railSub = node('span', '选中文字添加');
        railHead.append(railTitle, railSub);
        const railBody = node('div', null, 'wr-rail-body');
        rail.append(railHead, railBody);
        let railEdit = -1;

        /* ---- annotation popovers ---- */
        const selbar = node('div', null, 'wr-selbar');
        const pickComment = node('button', '批注');
        const pickReplace = node('button', '替换');
        const pickDelete = node('button', '删除');
        pickDelete.classList.add('danger');
        [pickComment, pickReplace, pickDelete].forEach(button => { button.type = 'button'; });
        selbar.append(pickComment, pickReplace, pickDelete);

        const marker = node('div', null, 'wr-marker');
        const markerTitle = node('small', '');
        const noteInput = document.createElement('textarea');
        noteInput.placeholder = '批注内容，可留空';
        const replInput = document.createElement('input');
        replInput.placeholder = '替换为…';
        const markerActions = node('div', null, 'wr-marker-actions');
        const dropBtn = node('button', '撤销标记', 'danger');
        const cancelBtn = node('button', '取消');
        const saveBtn = node('button', '保存', 'primary');
        [dropBtn, cancelBtn, saveBtn].forEach(button => { button.type = 'button'; });
        markerActions.append(dropBtn, cancelBtn, saveBtn);
        marker.append(markerTitle, noteInput, replInput, markerActions);
        document.body.append(selbar, marker);

        let draftKind = 'comment';
        let draftRange = null;
        let editingIndex = -1;

        function orderedMarks() {
            return marks.slice().sort((a, b) => a.from - b.from || a.to - b.to);
        }

        function markNumbers() {
            const table = new Map();
            orderedMarks().forEach((mark, position) => table.set(mark, position + 1));
            return table;
        }

        /* 批注可以盖在替换/删除之上；替换和删除之间仍然互斥。 */
        function clashes(from, to, skip, kind) {
            return marks.some((mark, i) => {
                if (i === skip) return false;
                if (kind === 'comment' || mark.kind === 'comment') return false;
                return from < mark.to && to > mark.from;
            });
        }

        function paintSpan(item, text, painted, numbers, wraps, child) {
            const mark = item.mark;
            const meta = MARK_META[mark.kind] || MARK_META.comment;
            const span = document.createElement('span');
            span.className = 'wr-hl ' + meta.cls + (wraps ? ' has-inner' : '');
            span.dataset.index = String(item.index);
            if (!painted.has(item.index)) {
                painted.add(item.index);
                span.dataset.no = String(numbers.get(mark) || '');
            }
            if (mark.kind === 'replace' && mark.replacement) span.dataset.replacement = mark.replacement;
            if (mark.note) { span.dataset.note = mark.note; span.title = mark.note; }
            if (child) span.append(child);
            else span.textContent = text;
            return span;
        }

        function renderSurface() {
            surface.replaceChildren();
            const total = essay.length;
            const numbers = markNumbers();
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

            for (let i = 0; i < cuts.length - 1; i += 1) {
                const from = cuts[i];
                const to = cuts[i + 1];
                if (to <= from) continue;
                const text = essay.slice(from, to);
                const covering = items.filter(item => item.from <= from && item.to >= to);
                if (!covering.length) { surface.append(document.createTextNode(text)); continue; }
                // 批注排在外层，替换/删除排在内层，同层时范围大的在外。
                const stack = covering.slice().sort((a, b) => {
                    const outer = (a.mark.kind === 'comment' ? 0 : 1) - (b.mark.kind === 'comment' ? 0 : 1);
                    return outer || (b.to - b.from) - (a.to - a.from);
                });
                let span = null;
                for (let index = stack.length - 1; index >= 0; index -= 1) {
                    span = paintSpan(stack[index], span ? null : text, painted, numbers, Boolean(span), span);
                }
                if (span && bridged.has(stack[0].index)) {
                    span.classList.add('is-bridge');
                }
                surface.append(span);
            }
            if (!essay.trim()) surface.append(document.createTextNode('（这份作答没有内容）'));
        }

        function focusMark(at) {
            const spans = surface.querySelectorAll('.wr-hl[data-index="' + at + '"]');
            const card = railBody.querySelector('.wr-rail-card[data-index="' + at + '"]');
            spans[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            spans.forEach(span => span.classList.add('is-focus'));
            card?.classList.add('is-focus');
            setTimeout(() => {
                spans.forEach(span => span.classList.remove('is-focus'));
                card?.classList.remove('is-focus');
            }, 1600);
        }

        function renderRail() {
            const ordered = orderedMarks();
            railTitle.textContent = marks.length ? '批注 ' + marks.length : '批注';
            railSub.textContent = marks.length ? '点高亮定位' : '选中文字添加';
            railBody.replaceChildren();
            if (!ordered.length) {
                railBody.append(node('p', '还没有批注。选中文中一段，点「批注 / 替换 / 删除」，所有批注会按顺序列在这里。', 'wr-rail-empty'));
                return;
            }
            ordered.forEach((mark, position) => {
                const at = marks.indexOf(mark);
                const card = node('div', null, 'wr-rail-card' + (at === railEdit ? ' is-editing' : ''));
                card.dataset.index = String(at);
                const top = node('div', null, 'wr-rail-top');
                top.append(node('span', String(position + 1), 'wr-rail-no'),
                    node('span', MARK_META[mark.kind].label, 'wr-rail-kind ' + mark.kind));
                card.append(top);
                if (at === railEdit) {
                    const noteArea = document.createElement('textarea');
                    noteArea.className = 'wr-rail-input';
                    noteArea.value = mark.note || '';
                    noteArea.placeholder = '批注内容，可留空';
                    const repl = document.createElement('input');
                    repl.className = 'wr-rail-input';
                    repl.value = mark.replacement || '';
                    repl.placeholder = '替换为…';
                    repl.hidden = mark.kind !== 'replace';
                    const acts = node('div', null, 'wr-rail-actions');
                    const save = node('button', '保存', 'primary');
                    save.type = 'button';
                    const cancel = node('button', '取消');
                    cancel.type = 'button';
                    save.onclick = event => {
                        event.stopPropagation();
                        if (mark.kind === 'replace' && !repl.value.trim()) { alert('请填写替换后的内容'); return; }
                        mark.note = noteArea.value.trim();
                        if (mark.kind === 'replace') mark.replacement = repl.value.trim();
                        railEdit = -1;
                        render();
                        status.textContent = '标记已更新，记得保存';
                    };
                    cancel.onclick = event => { event.stopPropagation(); railEdit = -1; renderRail(); };
                    acts.append(save, cancel);
                    card.append(noteArea, repl, acts);
                    railBody.append(card);
                    setTimeout(() => (mark.kind === 'replace' ? repl : noteArea).focus(), 0);
                    return;
                }
                const quote = node('p', '“' + essay.slice(mark.from, Math.min(mark.to, mark.from + 80)) + (mark.to - mark.from > 80 ? '…' : '') + '”', 'wr-rail-quote');
                card.append(quote);
                if (mark.note) card.append(node('p', mark.note, 'wr-rail-note'));
                if (mark.kind === 'replace' && mark.replacement) card.append(node('p', '改为：' + mark.replacement, 'wr-rail-repl'));
                const acts = node('div', null, 'wr-rail-actions');
                const edit = node('button', '编辑');
                edit.type = 'button';
                const dropCard = node('button', '删除', 'danger');
                dropCard.type = 'button';
                edit.onclick = event => { event.stopPropagation(); railEdit = at; renderRail(); };
                dropCard.onclick = event => {
                    event.stopPropagation();
                    marks.splice(at, 1);
                    railEdit = -1;
                    render();
                    status.textContent = '已撤销标记';
                };
                acts.append(edit, dropCard);
                top.append(acts);
                card.addEventListener('click', () => focusMark(at));
                railBody.append(card);
            });
        }

        function render() {
            renderSurface();
            renderRail();
        }

        function place(el, rect) {
            el.classList.add('is-open');
            const width = el.offsetWidth;
            const height = el.offsetHeight;
            let left = rect.left + rect.width / 2 - width / 2;
            left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
            let top = rect.top - height - 10;
            if (top < 8) top = Math.min(window.innerHeight - height - 8, rect.bottom + 10);
            el.style.left = Math.round(left) + 'px';
            el.style.top = Math.round(Math.max(8, top)) + 'px';
        }

        function readSelection() {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return null;
            const range = selection.getRangeAt(0);
            if (range.collapsed) return null;
            if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return null;
            let from = textOffset(surface, range.startContainer, range.startOffset);
            let to = textOffset(surface, range.endContainer, range.endOffset);
            if (from == null || to == null) return null;
            if (from > to) { const swap = from; from = to; to = swap; }
            if (to <= from) return null;
            const rects = range.getClientRects();
            const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
            if (!rect || (!rect.width && !rect.height)) return null;
            return { from, to, rect };
        }

        function closeMarker() {
            marker.classList.remove('is-open');
            editingIndex = -1;
        }
        function closeSelbar() {
            selbar.classList.remove('is-open');
        }
        function dismissAll() {
            closeMarker();
            closeSelbar();
        }

        function openMarker(kind, range, at, rect) {
            draftKind = kind;
            editingIndex = at == null ? -1 : at;
            markerTitle.textContent = kind === 'comment' ? '批注这段文字'
                : kind === 'replace' ? '把这段换成…' : '建议删除这段';
            noteInput.value = editingIndex >= 0 ? marks[editingIndex].note || '' : '';
            noteInput.placeholder = kind === 'delete' ? '为什么删？可留空' : '批注内容，可留空';
            replInput.value = editingIndex >= 0 ? marks[editingIndex].replacement || '' : '';
            replInput.hidden = kind !== 'replace';
            dropBtn.hidden = editingIndex < 0;
            closeSelbar();
            if (range) draftRange = range;
            place(marker, rect || range?.rect);
            (kind === 'replace' ? replInput : noteInput).focus({ preventScroll: true });
        }

        function pushMark(kind, range, note, replacement) {
            if (!range) return false;
            if (clashes(range.from, range.to, -1, kind)) {
                alert('这段文字已经有替换或删除标记了，先点它撤销；或者改用「批注」，批注可以盖在上面。');
                return false;
            }
            marks.push({ kind, from: range.from, to: range.to, note: note || '', replacement: kind === 'replace' ? replacement || '' : '' });
            return true;
        }

        function commit() {
            const note = noteInput.value.trim();
            const replacement = replInput.value.trim();
            if (editingIndex >= 0) {
                const mark = marks[editingIndex];
                if (!mark) { closeMarker(); return; }
                mark.note = note;
                if (mark.kind === 'replace') {
                    if (!replacement) { alert('请填写替换后的内容'); return; }
                    mark.replacement = replacement;
                }
            } else {
                if (draftKind === 'replace' && !replacement) { alert('请填写替换后的内容'); return; }
                if (!pushMark(draftKind, draftRange, note, replacement)) return;
            }
            closeMarker();
            window.getSelection()?.removeAllRanges();
            render();
            status.textContent = '标记已更新，记得保存';
        }

        function drop() {
            if (editingIndex < 0) return;
            marks.splice(editingIndex, 1);
            closeMarker();
            render();
            status.textContent = '已撤销标记';
        }

        /* pointer/selection wiring */
        surface.addEventListener('pointerup', () => setTimeout(() => {
            const picked = readSelection();
            if (!picked) { closeSelbar(); return; }
            draftRange = picked;
            place(selbar, picked.rect);
        }, 10));
        surface.addEventListener('contextmenu', event => event.preventDefault());
        surface.addEventListener('click', event => {
            const span = event.target.closest?.('.wr-hl');
            if (!span) { closeMarker(); return; }
            const at = Number(span.dataset.index);
            if (!marks[at]) return;
            closeSelbar();
            closeMarker();
            focusMark(at);
        });

        selbar.addEventListener('mousedown', event => event.preventDefault());
        pickComment.onclick = () => { const range = draftRange; if (range) openMarker('comment', range, -1, range.rect); };
        pickReplace.onclick = () => { const range = draftRange; if (range) openMarker('replace', range, -1, range.rect); };
        pickDelete.onclick = () => {
            const range = draftRange;
            if (!range) return;
            if (!pushMark('delete', range, '', '')) return;
            closeSelbar();
            window.getSelection()?.removeAllRanges();
            render();
            status.textContent = '已标记删除，记得保存';
        };

        saveBtn.onclick = commit;
        cancelBtn.onclick = closeMarker;
        dropBtn.onclick = drop;
        noteInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
            if (event.key === 'Escape') { event.preventDefault(); closeMarker(); }
        });
        replInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            if (event.key === 'Escape') { event.preventDefault(); closeMarker(); }
        });

        const onDocDown = event => {
            if (event.target.closest?.('.wr-marker') || event.target.closest?.('.wr-selbar')) return;
            if (surface.contains(event.target)) return;
            dismissAll();
        };
        const onViewportChange = () => dismissAll();
        document.addEventListener('pointerdown', onDocDown, true);
        window.addEventListener('resize', onViewportChange);
        rightBody.addEventListener('scroll', onViewportChange);
        markTeardown = () => {
            document.removeEventListener('pointerdown', onDocDown, true);
            window.removeEventListener('resize', onViewportChange);
            selbar.remove();
            marker.remove();
        };

        /* ---- persistence ---- */
        let saving = false;
        function payload(published) {
            const body = { id: attempt.id, comment: comment.value, annotations: marks, published };
            for (const key of Object.keys(fields)) body[key] = fields[key].value === '' ? null : Number(fields[key].value);
            return body;
        }
        async function submit(published) {
            if (saving) return;
            if (published && Object.keys(fields).some(key => fields[key].value === '')) {
                alert('发给学生前请给齐 TA、CC、LR、GRA 四项分数');
                return;
            }
            saving = true;
            saveDraft.disabled = publish.disabled = true;
            status.textContent = '保存中…';
            try {
                const result = await api('/api/admin/writing/feedback', { method: 'POST', body: JSON.stringify(payload(published)) });
                if (published) {
                    status.textContent = '已发给学生，总分 ' + result.overall;
                    await showAttempts(task);
                    return;
                }
                status.textContent = '草稿已保存';
                if (result.overall != null) total.textContent = Number(result.overall).toFixed(1);
            } catch (error) {
                status.textContent = '';
                alert(error.message);
            } finally {
                saving = false;
                saveDraft.disabled = publish.disabled = false;
            }
        }
        saveDraft.onclick = () => submit(false);
        publish.onclick = () => submit(true);

        const snapshot = () => JSON.stringify(payload(false));
        let baseline = snapshot();
        markTimer = setInterval(async () => {
            if (saving) return;
            const current = snapshot();
            if (current === baseline) return;
            try {
                await api('/api/admin/writing/feedback', { method: 'POST', body: current });
                baseline = current;
                if (!status.textContent) status.textContent = '草稿已自动保存';
            } catch (_) { /* keep working; manual buttons surface errors */ }
        }, 30000);

        render();
        board.append(left, right, rail);
        root.append(board);
    }

    /* ---------------- wiring ---------------- */
    nav.onclick = async () => {
        open = true;
        try { await showList(); }
        catch (error) {
            view.replaceChildren(node('p', error.message || '写作任务加载失败', 'wr-empty'));
        }
    };
    for (const id of ['overview', 'navReadingTypes', 'navListeningTypes', 'navPassage', 'navListeningPassage', 'navExams']) {
        $(id)?.addEventListener('click', () => { if (open) unpin(); });
    }
})();
