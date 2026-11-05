(function (global) {
    'use strict';
    // One shell for legacy listening documents. Keep original question nodes and
    // handlers in their own document; proxy controls instead of moving them.
    var mounted,reviewRequested=false,reviewEntry=null;
    function mount(options) {
        var doc = global.document, frame = options.frame, inner = frame.contentDocument;
        if (!inner || !inner.body) return null;
        if (!mounted) {
            var style = doc.createElement('style');
            style.textContent = `
              #listening-wrapper-root{display:grid;grid-template-rows:56px auto auto minmax(0,1fr) auto;background:#fff;color:#222;font:14px Arial,Helvetica,"PingFang SC",sans-serif}
              #listening-wrapper-root *{box-sizing:border-box}#listening-wrapper-root button,#listening-wrapper-root select{font:inherit;cursor:pointer}
              #listening-wrapper-root button{border:1px solid #ccc;background:#fff;color:#222;border-radius:3px;padding:8px 12px}#listening-wrapper-root button:disabled{opacity:.55;cursor:default}
              #listening-wrapper-root button:focus-visible,#listening-wrapper-root input:focus-visible{outline:2px solid #2465a7;outline-offset:2px}
              .ls-header{display:flex;align-items:center;gap:28px;padding:0 16px;border-bottom:1px solid #c8c8c8}.ls-brand{color:#e31b23;font-size:20px;font-weight:900}.ls-candidate{display:flex;flex-direction:column;gap:2px;font-size:16px;font-weight:600}.ls-header .ls-timer{border:0!important;padding:0!important;font-size:13px!important;text-align:left}.ls-header-actions{margin-left:auto;display:flex;gap:8px;align-items:center}.ls-title{padding:12px 20px;background:#f4f4f4;border-bottom:1px solid #ddd;line-height:1.5}.ls-title strong{font-size:16px}.ls-title small{display:block;color:#555}
              .ls-player{display:flex;gap:12px;align-items:center;padding:9px 20px;border-bottom:1px solid #ddd;min-width:0}.ls-player input{flex:1;min-width:50px;accent-color:#333}.ls-player time{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}.ls-player select{padding:6px;border:1px solid #ccc;border-radius:3px;background:#fff}.ls-player button{min-width:60px}#listening-practice-frame{min-height:0;height:100%;background:#fff;grid-row:4}
              .ls-footer{display:flex;align-items:center;gap:14px;padding:8px 16px;border-top:1px solid #ddd;min-height:54px;background:#fff}.ls-nav{display:flex;align-items:center;gap:5px;overflow-x:auto;min-width:0;flex:1}.ls-nav button{flex:0 0 29px;padding:5px 2px!important;font-size:13px!important}.ls-nav button.answered{background:#e7f0e9!important;border-color:#609574!important}.ls-nav button.active{outline:2px solid #2465a7;outline-offset:-2px}.ls-footer .ls-submit{background:#222!important;border-color:#222!important;color:white!important;min-width:88px}.ls-part{font-weight:bold;white-space:nowrap}.ls-count{color:#666;font-size:12px;white-space:nowrap}.ls-notice{position:absolute;bottom:66px;left:50%;transform:translateX(-50%);padding:9px 16px;background:#222;color:#fff;z-index:5;max-width:90%;border-radius:4px}.ls-settings{position:absolute;top:54px;right:12px;background:#fff;border:1px solid #ccc;padding:16px;z-index:4;box-shadow:0 4px 16px #0002}.ls-settings label{display:flex;align-items:center;gap:12px}.ls-settings select{padding:6px}.ls-results{width:min(680px,92vw);max-height:85vh;border:1px solid #ccc;border-radius:6px;padding:24px;color:#222}.ls-results::backdrop{background:#0006}.ls-results header{display:flex;align-items:center;justify-content:space-between;gap:12px}.ls-results h2{margin:0}.ls-results table{border-collapse:collapse;width:100%;font-size:14px}.ls-results th,.ls-results td{text-align:left;border-bottom:1px solid #ddd;padding:10px;overflow-wrap:anywhere}.ls-results .ls-results-scroll{max-height:55vh;overflow:auto}.ls-results .incorrect{color:#a62a23}.ls-results .correct{color:#25613d}
              @media(max-width:700px){.ls-header{gap:14px;padding:0 10px}.ls-candidate{font-size:13px}.ls-header-actions{gap:4px}.ls-header-actions button{padding:7px!important}.ls-title{padding:8px 12px}.ls-player{padding:8px 10px;gap:7px}.ls-player time{font-size:11px}.ls-footer{flex-wrap:wrap;gap:8px;padding:8px 10px}.ls-nav{flex-basis:calc(100% - 60px);order:0}.ls-part{order:0}.ls-count{order:1;margin-right:auto}.ls-submit,.ls-footer-reset{order:1}}
            `;
            doc.head.appendChild(style);
            var root = doc.getElementById('listening-wrapper-root');
            var header = doc.createElement('header'); header.className='ls-header';
            header.innerHTML='<span class="ls-brand">IELTS</span><div class="ls-candidate"><span id="ls-candidate"></span><button type="button" class="ls-timer" id="ls-timer" title="暂停或继续计时">00:00</button></div><div class="ls-header-actions"><button type="button" id="ls-notes">笔记</button><button type="button" id="ls-transcript">原文</button><button type="button" id="ls-settings">设置</button><button type="button" id="ls-exit">退出</button></div>';
            var title=doc.createElement('div');title.className='ls-title';title.innerHTML='<strong id="ls-title"></strong><small id="ls-instruction">Listen to the recording and answer the questions below.</small>';
            var player=doc.createElement('div');player.className='ls-player';player.innerHTML='<button type="button" id="ls-play">播放</button><input id="ls-seek" type="range" min="0" max="1000" value="0" aria-label="音频进度"><time id="ls-time">00:00 / 00:00</time><select id="ls-rate" aria-label="播放速度"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select>';
            var footer=doc.createElement('footer');footer.className='ls-footer';footer.innerHTML='<span class="ls-part" id="ls-part"></span><nav class="ls-nav" id="ls-nav" aria-label="题号导航"></nav><span class="ls-count" id="ls-count"></span><button class="ls-footer-reset" id="ls-reset" type="button">重置</button><button class="ls-submit" id="ls-submit" type="button">提交答案</button>';
            var settings=doc.createElement('div');settings.className='ls-settings';settings.hidden=true;settings.innerHTML='<label>字号 <select id="ls-font"><option value="regular">标准</option><option value="large">大</option><option value="xlarge">更大</option></select></label><button type="button" id="ls-frame-diagnostics" style="margin-top:12px">题目诊断日志</button>';
            var notice=doc.createElement('div');notice.className='ls-notice';notice.hidden=true;notice.setAttribute('role','status');
            var results=doc.createElement('dialog');results.className='ls-results';results.innerHTML='<header><h2>练习结果</h2><div><button type="button" id="ls-results-close">查看题目</button><button type="button" id="ls-results-return" hidden>返回主页</button></div></header><p id="ls-result-summary"></p><p id="ls-save-status" role="status"></p><div class="ls-results-scroll"><table><thead><tr><th>题号</th><th>你的答案</th><th>参考答案</th><th>结果</th></tr></thead><tbody id="ls-result-rows"></tbody></table></div>';
            root.prepend(header,title,player);root.append(footer,settings,notice,results);
            mounted={root:root,frame:frame,notice:notice,settings:settings,results:results,questions:[],submitting:false,selectedDrag:null};
            var $=function(id){return doc.getElementById(id);};
            $('ls-settings').onclick=function(){settings.hidden=!settings.hidden;};
            $('ls-frame-diagnostics').onclick=function(){var b=mounted.frame.contentDocument.getElementById('practice-diagnostics-access');if(b)b.click();};
            $('ls-results-close').onclick=function(){results.close();};
            $('ls-results-return').onclick=function(){try{global.close();}catch(_){}global.location.replace('/');};
            $('ls-timer').onclick=function(){mounted.options.toggleTimer();};
            $('ls-exit').onclick=function(){if(mounted.saved){try{global.close();}catch(_){}global.location.replace('/');return;}mounted.options.exit();};
            $('ls-notes').onclick=function(){var b=findAction('notes');if(b)b.click();else tell('这道题没有笔记');};
            $('ls-transcript').onclick=function(){var b=findAction('transcript');if(b)b.click();else tell('这道题没有原文');};
            $('ls-reset').onclick=function(){var b=findAction('reset');if(b)b.click();else clearLocalAnswers();};
            $('ls-font').onchange=function(){var d=mounted.frame.contentDocument;d.body.classList.remove('font-regular','font-large','font-xlarge');d.body.classList.add('font-'+this.value);d.documentElement.style.fontSize={regular:'16px',large:'18px',xlarge:'20px'}[this.value];};
            $('ls-play').onclick=function(){var a=currentAudio();if(!a){tell('未找到这道题的音频');return;}if(a.paused){var p=a.play();if(p&&p.catch)p.catch(function(){tell('音频暂时无法播放，请稍后重试。');});}else a.pause();};
            $('ls-seek').oninput=function(){var a=currentAudio();if(a&&isFinite(a.duration)&&a.duration>0)a.currentTime=Number(this.value)/1000*a.duration;};
            $('ls-rate').onchange=function(){var a=currentAudio();if(a)a.playbackRate=Number(this.value);};
            $('ls-submit').onclick=function(){if(mounted.submitting)return;if(mounted.payload&&mounted.frame.contentWindow.__listeningBridgeComplete){mounted.submitting=true;this.disabled=true;this.textContent='保存中…';mounted.frame.contentWindow.__listeningBridgeComplete({allowGenerated:true});return;}var b=findAction('submit');if(!b){tell('未找到提交按钮，请反馈此题名称。');return;}mounted.submitting=true;this.disabled=true;this.textContent='提交中…';b.click();setTimeout(function(){if(mounted.submitting&&!mounted.payload){mounted.submitting=false;$('ls-submit').disabled=false;$('ls-submit').textContent='提交答案';}},2500);};
            mounted.interval=global.setInterval(refresh,500);
        }
        mounted.options=options;mounted.saved=false;mounted.payload=null;mounted.submitting=false;mounted.questions=[];mounted.audio=null;
        doc.getElementById('ls-candidate').textContent=options.candidateCode;
        var filename='';try{filename=decodeURIComponent(new URL(inner.URL).pathname.split('/').pop()).replace(/\.html?$/i,'').replace(/^\d+[.\s-]+(?:P[1-4]\s*)?/i,'');}catch(_){}
        doc.getElementById('ls-title').textContent=filename&&!/^(index|test|practice)$/i.test(filename)?filename:(inner.title.replace(/^IELTS\s+Listening\s*(Practice|Simulator)?\s*[-—·:]?\s*/i,'')||'Listening practice');
        doc.getElementById('ls-part').textContent='Part '+options.part;
        normalizeContent(inner);refresh();if(reviewRequested){setReviewMode();if(reviewEntry)replay(reviewEntry);}return mounted;
    }
    function tell(text){if(!mounted)return;mounted.notice.textContent=text;mounted.notice.hidden=false;clearTimeout(mounted.noticeTimer);mounted.noticeTimer=setTimeout(function(){mounted.notice.hidden=true;},4500);}
    function clearLocalAnswers(){
        var d=mounted&&mounted.frame.contentDocument;
        if(!d||d.querySelector('[draggable="true"],[draggable=true]')){tell('这道题暂不支持重置，请退出后重新进入。');return;}
        d.querySelectorAll('input,textarea,select').forEach(function(el){
            if(el.closest('header,footer,.bottom-bar,.bottomBar,.q-nav-container'))return;
            if(el.type==='radio'||el.type==='checkbox'){if(!el.checked)return;el.checked=false;}
            else if(el.tagName==='SELECT'){if(el.selectedIndex<=0)return;el.selectedIndex=0;}
            else if(el.type==='button'||el.type==='submit'||el.type==='range'||el.type==='hidden'||el.type==='file'||el.value==='')return;
            else el.value='';
            el.dispatchEvent(new Event(el.type==='radio'||el.type==='checkbox'||el.tagName==='SELECT'?'change':'input',{bubbles:true}));
        });
        refresh();
    }
    function findAction(kind){
        var d=mounted.frame.contentDocument;
        var selectors={submit:'#finish-btn,#finishBtn,#btnFinish,#submit-btn,#submitBtn,[data-action="finish"],[data-action="submit"]',reset:'#clear-btn,#clearBtn,#btnClear,#clearAnswersBtn',notes:'#toggle-notes-btn,#notes-btn,#notesBtn,#btnNotes,#notesToggle,#notesToggleBtn',transcript:'#toggle-transcript-btn,#trans-btn,#trans-trigger,#transcriptBtn,#transcriptToggle,#transcriptToggleBtn,#tToggle'};
        var found=d.querySelector(selectors[kind]);if(found)return found;
        var buttons=Array.from(d.querySelectorAll('button,input[type=button],input[type=submit]'));
        var text=function(b){return (b.textContent||b.value||'').trim();};
        if(kind==='notes')return buttons.find(function(b){return /^(?:📝\s*)?notes$/i.test(text(b));})||buttons.find(function(b){return /^(?:📝\s*)?note$/i.test(text(b));});
        var pattern={submit:/^(finish|submit(?: answers)?|check answers|提交|完成)$/i,reset:/^(clear|reset|重置|清空)$/i,transcript:/^(?:📄\s*)?(?:show |hide )?transcript$/i}[kind];
        return buttons.find(function(b){return pattern.test(text(b));});
    }
    function currentAudio(){var d=mounted.frame.contentDocument;return Array.from(d.querySelectorAll('audio')).find(function(a){var p=a.closest('.test-page');return !p||getComputedStyle(p).display!=='none';})||d.querySelector('audio');}
    function normalizeContent(d){
        if(d.getElementById('listening-common-content-style'))return;
        d.body.classList.add('listening-unified-ui','listening-shared-content');
        installDragFallback(d);
        var style=d.createElement('style');style.id='listening-common-content-style';style.textContent=`
          html{height:100%;background:#fff}body.listening-shared-content{margin:0!important;padding:0!important;background:#fff!important;color:#222;font-family:Arial,Helvetica,"PingFang SC",sans-serif!important;min-height:100%;height:100%;overflow:auto!important}
          body.listening-shared-content .header,body.listening-shared-content>header,body.listening-shared-content .bottom-bar,body.listening-shared-content .bottomBar,body.listening-shared-content .bottom-controls,body.listening-shared-content .footer,body.listening-shared-content>footer,body.listening-shared-content .audio-player,body.listening-shared-content .audio-bar,body.listening-shared-content .audioBar,body.listening-shared-content #sticky-header,body.listening-shared-content #sticky-audio,body.listening-shared-content .audio-sticky,body.listening-shared-content .sticky-audio,body.listening-shared-content .ls-original-action{display:none!important}
          body.listening-shared-content .shell,body.listening-shared-content>.app,body.listening-shared-content>.app-shell,body.listening-shared-content>.app-wrapper,body.listening-shared-content>.wrapper,body.listening-shared-content>div.container{width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;display:flex;flex-direction:column;overflow:hidden}
          body.listening-shared-content #main-shell,body.listening-shared-content #mainShell,body.listening-shared-content #mainSplit,body.listening-shared-content #splitLayout,body.listening-shared-content .main-view,body.listening-shared-content .split-layout,body.listening-shared-content .main-row{flex:1;min-height:0!important;height:auto!important;margin:0!important}
          body.listening-shared-content #left-pane,body.listening-shared-content #leftPane,body.listening-shared-content .left-pane{min-height:0!important;overflow:auto!important;padding-bottom:24px!important;background:#fff!important}
          body.listening-shared-content .instruction-box,body.listening-shared-content .instructions,body.listening-shared-content .instruction,body.listening-shared-content .inst-box{border-left:0!important;border-radius:0!important;box-shadow:none!important;background:#f5f5f5!important;color:#333!important}
          body.listening-shared-content .drag-option,body.listening-shared-content .drag-item,body.listening-shared-content .draggable-word,body.listening-shared-content [draggable=true]{user-select:none!important;-webkit-user-select:none!important;touch-action:none;cursor:grab!important}body.listening-shared-content.ls-pointer-dragging,body.listening-shared-content.ls-pointer-dragging *{user-select:none!important;-webkit-user-select:none!important}body.listening-shared-content .ls-drag-ghost{position:fixed!important;z-index:2147483647!important;pointer-events:none!important;max-width:260px!important;padding:8px 12px!important;background:#fff!important;border:1px solid #333!important;box-shadow:0 4px 14px #0003!important;opacity:.95!important}body.listening-shared-content .ls-click-drag-selected{outline:2px solid #444!important;outline-offset:2px!important;background-color:#f3f4f6!important}
          body.listening-shared-content input[type=text],body.listening-shared-content input:not([type]){border:1px solid #999!important;border-radius:2px!important;box-shadow:none!important;background:#fff!important;color:#111!important}
          body.listening-shared-content :where(.q-group,.question-group,.question-section,.group,.question-card,.section){padding:20px 24px!important;margin:0 0 18px!important;border:1px solid #dedede!important;border-radius:4px!important;background:#fff!important;box-shadow:none!important;max-width:none!important}
          body.listening-shared-content :where(.q-group,.question-group,.question-section,.group,.question-card,.section) :where(h2,h3,h4){font-size:17px!important;font-weight:700!important;line-height:1.5!important;margin:0 0 14px!important;padding:0!important;background:transparent!important;border:0!important}
          body.listening-shared-content :where(.instructions,.instruction,.inst-box,.instruction-box){padding:12px 14px!important;margin:0 0 16px!important;border:1px solid #e5e7eb!important;border-radius:3px!important;background:#f7f7f7!important;box-shadow:none!important;font-size:15px!important;line-height:1.6!important}
          body.listening-shared-content :where(.drag-pool,.option-pool,.options-pool){display:flex!important;flex-wrap:wrap!important;gap:8px!important;padding:12px!important;background:#fafafa!important;border:1px solid #ddd!important;border-radius:3px!important}
          body.listening-shared-content :where(.drag-option,.drag-item,.draggable-word,.tag){display:inline-flex!important;align-items:center!important;min-height:38px!important;padding:7px 12px!important;background:#fff!important;color:#222!important;border:1px solid #aaa!important;border-radius:3px!important;box-shadow:none!important;font-size:15px!important;line-height:1.4!important}
          body.listening-shared-content :where(.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone]){min-height:38px!important;min-width:74px!important;border:1px dashed #9ca3af!important;border-radius:3px!important;background:#fafafa!important;box-shadow:none!important}
          body.listening-shared-content :where(.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone]).drag-over{border-color:#2563eb!important;background:#eaf2ff!important}
          body.listening-shared-content :where(label:has(input[type=radio]),label:has(input[type=checkbox])){display:block;padding:8px 10px;margin:5px 0;border:1px solid #e5e7eb;border-radius:3px;background:#fff;line-height:1.5}
          body.listening-shared-content .ls-review-correct{outline:2px solid #2e7d32!important}body.listening-shared-content .ls-review-incorrect{outline:2px solid #c62828!important}body.listening-shared-content .ls-review-highlight{background:#ffed9b!important;color:inherit!important}
          body.listening-shared-content .bottom-nav,body.listening-shared-content .controls-bar,body.listening-shared-content .control-bar,body.listening-shared-content #bottomBar,body.listening-shared-content #dotsContainer,body.listening-shared-content .audio-container,body.listening-shared-content .audio-wrapper,body.listening-shared-content #practice-diagnostics-access{display:none!important}
          body.listening-shared-content .question-section,body.listening-shared-content .question-group,body.listening-shared-content .section,body.listening-shared-content .card,body.listening-shared-content .panel,body.listening-shared-content .group,body.listening-shared-content .question-card,body.listening-shared-content .content-card{border-radius:0!important;box-shadow:none!important;background:#fff!important;border-color:#ddd!important}body.listening-shared-content h1,body.listening-shared-content h2,body.listening-shared-content h3,body.listening-shared-content h4{font-family:Arial,Helvetica,"PingFang SC",sans-serif!important;color:#222!important;letter-spacing:normal!important}body.listening-shared-content img,body.listening-shared-content svg{max-width:100%}body.listening-shared-content table{border-collapse:collapse}body.listening-shared-content th,body.listening-shared-content td{border-color:#ddd!important}body.listening-shared-content button{box-shadow:none!important}
          body.listening-shared-content .hidden-in-pool,body.listening-shared-content [hidden]{display:none!important}
        `;d.head.appendChild(style);
        ['submit','reset','notes','transcript'].forEach(function(k){var b=findAction(k);if(b)b.classList.add('ls-original-action');});
        // Legacy code may reference these controls later, so leave every node in place.
        d.querySelectorAll('audio').forEach(function(a){a.controls=false;});
    }
    function installDragFallback(d){
        if(d.body.dataset.listeningClickDrag==='1')return;d.body.dataset.listeningClickDrag='1';
        var transfer=null,suppressClick=false;
        function makeTransfer(){var values={};return {effectAllowed:'move',dropEffect:'move',files:[],items:[],setData:function(k,v){values[k]=String(v);},getData:function(k){return values[k]||'';},clearData:function(k){if(k)delete values[k];else values={};}};}
        function send(target,type,dt){var ev;try{ev=new d.defaultView.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(ev,'dataTransfer',{value:dt});}catch(_){return;}target.dispatchEvent(ev);}
        d.body.addEventListener('click',function(e){
            if(reviewRequested)return;
            if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}
            var source=e.target.closest('.drag-option,.drag-item,.draggable-word,.drag-word,.tag,[draggable="true"]');
            var target=e.target.closest('.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone],.drag-pool');
            if(source){
                if(!source.closest('.drag-pool,.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone]'))return;
                if(mounted.selectedDrag===source){source.classList.remove('ls-click-drag-selected');mounted.selectedDrag=null;return;}
                if(mounted.selectedDrag)mounted.selectedDrag.classList.remove('ls-click-drag-selected');
                mounted.selectedDrag=source;source.classList.add('ls-click-drag-selected');transfer=makeTransfer();send(source,'dragstart',transfer);e.preventDefault();return;
            }
            if(target&&mounted.selectedDrag){var picked=mounted.selectedDrag;send(target,'dragover',transfer);send(target,'drop',transfer);picked.classList.remove('ls-click-drag-selected');mounted.selectedDrag=null;transfer=null;e.preventDefault();}
        },true);
        var pointer=null,ghost=null;
        function clearPointer(){
            if(ghost){ghost.remove();ghost=null;}
            d.body.classList.remove('ls-pointer-dragging');pointer=null;
        }
        d.addEventListener('dragstart',function(e){if(pointer&&e.isTrusted)pointer.native=true;},true);
        d.addEventListener('pointerdown',function(e){
            if(reviewRequested||e.button!==0||e.isPrimary===false||mounted.saved||mounted.submitting||d.body.classList.contains('listening-timer-locked'))return;
            var source=e.target.closest('.drag-option,.drag-item,.draggable-word,.drag-word,.tag,[draggable="true"]');
            if(!source)return;
            pointer={source:source,id:e.pointerId,x:e.clientX,y:e.clientY,native:false,moved:false};
            d.defaultView.getSelection()?.removeAllRanges();
            try{source.setPointerCapture(e.pointerId);}catch(_){}
            e.preventDefault();
        },true);
        d.addEventListener('pointermove',function(e){
            if(!pointer||pointer.id!==e.pointerId||pointer.native)return;
            if(!pointer.moved&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<7)return;
            pointer.moved=true;d.body.classList.add('ls-pointer-dragging');
            if(!ghost){ghost=pointer.source.cloneNode(true);ghost.className+=' ls-drag-ghost';d.body.appendChild(ghost);}
            ghost.style.left=(e.clientX+12)+'px';ghost.style.top=(e.clientY+12)+'px';
            d.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over');});
            var hit=d.elementFromPoint(e.clientX,e.clientY);
            var target=hit&&hit.closest('.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone],.drag-pool');
            if(target)target.classList.add('drag-over');
            for(var pane=hit;pane&&pane!==d.body;pane=pane.parentElement){
                if(pane.scrollHeight>pane.clientHeight&&/auto|scroll/.test(d.defaultView.getComputedStyle(pane).overflowY)){
                    var box=pane.getBoundingClientRect();
                    if(e.clientY<box.top+36)pane.scrollTop-=18;
                    if(e.clientY>box.bottom-36)pane.scrollTop+=18;
                    break;
                }
            }
            d.defaultView.getSelection()?.removeAllRanges();
            e.preventDefault();
        },{capture:true,passive:false});
        d.addEventListener('pointerup',function(e){
            if(!pointer)return;
            var active=pointer;
            if(active.id!==e.pointerId)return;
            if(active.moved&&!active.native){
                suppressClick=true;setTimeout(function(){suppressClick=false;},0);
                var hit=d.elementFromPoint(e.clientX,e.clientY);
                var target=hit&&hit.closest('.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot,[data-drop-zone],.drag-pool');
                if(target){var dt=makeTransfer();send(active.source,'dragstart',dt);send(target,'dragover',dt);send(target,'drop',dt);send(active.source,'dragend',dt);}
            }
            try{active.source.releasePointerCapture(e.pointerId);}catch(_){}
            d.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over');});
            clearPointer();
        },true);
        d.addEventListener('pointercancel',clearPointer,true);
    }
    function questionEntries(d){
        var map=new Map();
        d.querySelectorAll('input[name],input[id],select[name],textarea[name],[data-q],[data-qnum],[data-qid]').forEach(function(el){
            if(el.closest('.q-nav-container,.bottom-bar,.bottomBar,.footer,header,.header,#notes,#notesPanel')||el.matches('input[type=range],input[type=hidden]'))return;
            var key=el.getAttribute('name')||el.dataset.q||el.dataset.qnum||el.dataset.qid||el.id;
            if(!/^(?:q(?:uestion)?[-_]?\d|\d)/i.test(key||''))return;
            var ns=String(key).match(/\d+/g)||[];ns.forEach(function(n){n=Number(n);if(n<1||n>40)return;if(!map.has(n))map.set(n,[]);map.get(n).push(el);});
        });
        return Array.from(map).sort(function(a,b){return a[0]-b[0];});
    }
    function isAnswered(elements){return elements.some(function(el){if(el.type==='radio'||el.type==='checkbox')return el.checked;if('value' in el)return String(el.value||'').trim()!=='';return !!el.querySelector('.tag,[data-value]')||el.classList.contains('filled');});}
    function refresh(){
        if(!mounted)return;var d=mounted.frame.contentDocument;if(!d||!d.body)return;var doc=global.document,$=function(id){return doc.getElementById(id);};
        var diagnostics=doc.getElementById('practice-diagnostics-access');
        if(diagnostics&&diagnostics.parentNode!==mounted.settings){diagnostics.style.cssText='position:static;display:block;margin-top:12px';diagnostics.textContent='页面诊断日志';mounted.settings.appendChild(diagnostics);}
        var a=currentAudio();$('ls-play').disabled=!a;$('ls-seek').disabled=!a||!isFinite(a.duration)||a.duration<=0;
        if(a){$('ls-play').textContent=a.paused?'播放':'暂停';$('ls-time').textContent=format(a.currentTime)+' / '+format(a.duration);if(doc.activeElement!==$('ls-seek'))$('ls-seek').value=isFinite(a.duration)&&a.duration>0?a.currentTime/a.duration*1000:0;}
        ['notes','transcript'].forEach(function(k){$('ls-'+k).hidden=!findAction(k);});
        var entries=questionEntries(d),signature=entries.map(function(x){return x[0];}).join(',');mounted.questions=entries;
        if(mounted.signature!==signature){mounted.signature=signature;$('ls-nav').replaceChildren();entries.forEach(function(entry){var button=doc.createElement('button');button.type='button';button.textContent=entry[0];button.dataset.question=entry[0];button.onclick=function(){var current=mounted.questions.find(function(x){return x[0]===entry[0];});if(!current)return;var el=current[1][0];el.scrollIntoView({block:'center',behavior:'smooth'});if(el.matches('input,select,textarea'))el.focus({preventScroll:true});$('ls-nav').querySelectorAll('button').forEach(function(b){b.classList.toggle('active',b===button);});};$('ls-nav').appendChild(button);});}
        var count=0;entries.forEach(function(entry){var yes=isAnswered(entry[1]);if(yes)count++;var b=$('ls-nav').querySelector('[data-question="'+entry[0]+'"]');if(b)b.classList.toggle('answered',yes);});$('ls-count').textContent=count+' / '+entries.length+' 已答';
    }
    function format(value){var n=isFinite(value)?Math.max(0,Math.floor(value)):0;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
    function submission(payload){
        if(!mounted)return;mounted.payload=payload;mounted.submitting=true;var d=global.document;d.getElementById('ls-submit').textContent='保存中…';d.getElementById('ls-submit').disabled=true;
        var rows=payload.answerComparison||payload.answerDetails||{},ids=Object.keys(rows).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
        d.getElementById('ls-result-summary').textContent='答对 '+(payload.correct||payload.correctAnswersCount||ids.filter(function(k){return rows[k].isCorrect;}).length)+' / '+(payload.total||payload.totalQuestions||ids.length)+' 题';
        d.getElementById('ls-save-status').textContent='正在保存成绩…';var body=d.getElementById('ls-result-rows');body.replaceChildren();ids.forEach(function(id){var r=rows[id],tr=d.createElement('tr');[id.replace(/^q/i,''),r.userAnswer||'未作答',r.correctAnswer||'—',r.isCorrect?'正确':'错误'].forEach(function(value,i){var td=d.createElement('td');td.textContent=String(value);if(i===3)td.className=r.isCorrect?'correct':'incorrect';tr.appendChild(td);});body.appendChild(tr);});if(!mounted.results.open)mounted.results.showModal();
    }
    function outcome(success){if(!mounted)return;mounted.submitting=false;mounted.saved=!!success;global.document.getElementById('ls-save-status').textContent=success?'成绩已保存，可查看答案或手动返回主页。':'保存未成功，请重试提交。';global.document.getElementById('ls-results-return').hidden=!success;var b=global.document.getElementById('ls-submit');b.disabled=success;b.textContent=success?'已提交':'重试提交';}
    function setReviewMode(){
        reviewRequested=true;if(!mounted)return;
        var d=global.document;d.getElementById('ls-candidate').textContent='学生作答 · 只读回放';
        ['ls-submit','ls-reset','ls-exit'].forEach(function(id){d.getElementById(id).hidden=true;});
        d.getElementById('ls-timer').disabled=true;
        var inner=mounted.frame.contentDocument;
        inner.querySelectorAll('input,textarea,select').forEach(function(el){el.disabled=true;});
        inner.querySelectorAll('[draggable]').forEach(function(el){el.draggable=false;});
        inner.body.style.overflowY='auto';inner.documentElement.style.overflowY='auto';
    }
    function replay(entry){
        reviewEntry=entry||{};setReviewMode();if(!mounted)return;
        var d=mounted.frame.contentDocument,answers=reviewEntry.answers||{},comparison=reviewEntry.answerComparison||reviewEntry.comparison||{};
        Object.keys(comparison).forEach(function(key){if(!(key in answers))answers[key]=comparison[key].userAnswer;});
        d.querySelectorAll('input,textarea,select').forEach(function(el){
            var key=el.name||el.dataset.q||el.id;var value=answers[key]??answers['q'+key]??answers[String(key).replace(/^q/,'')];
            if(value==null)return;
            if(el.type==='radio'||el.type==='checkbox'){var values=Array.isArray(value)?value:String(value).split(/[,;\s]+/);el.checked=values.map(String).includes(String(el.value));}
            else el.value=Array.isArray(value)?value.join(', '):String(value);
        });
        d.querySelectorAll('.match-slot,.drop-slot,.drop-zone,.dropzone,.answer-slot').forEach(function(slot){
            var key=slot.dataset.q||slot.dataset.qid||slot.dataset.qnum||slot.getAttribute('name')||slot.id;
            var value=answers[key]??answers['q'+key]??answers[String(key).replace(/^q/,'')];
            if(value==null)return;
            var tag=d.createElement('span');tag.className='tag';tag.textContent=String(value);slot.replaceChildren(tag);
        });
        var comparisons=reviewEntry.answerComparison||reviewEntry.comparison||{};
        Object.keys(comparisons).forEach(function(key){
            var item=comparisons[key]||{},nodes=d.querySelectorAll('[name="'+CSS.escape(key)+'"],[data-q="'+CSS.escape(key.replace(/^q/,''))+'"]');
            nodes.forEach(function(el){el.classList.add(item.isCorrect?'ls-review-correct':'ls-review-incorrect');});
        });
        (reviewEntry.highlights||[]).forEach(function(h){
            if(!h||!h.text)return;
            var walker=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT),node;
            while((node=walker.nextNode())){
                if(node.parentElement?.closest('script,style,mark,input,textarea'))continue;
                var at=node.textContent.indexOf(h.text);if(at<0)continue;
                var range=d.createRange();range.setStart(node,at);range.setEnd(node,at+h.text.length);
                var mark=d.createElement('mark');mark.className='ls-review-highlight';range.surroundContents(mark);break;
            }
        });
        refresh();
    }
    global.ListeningSharedShell={mount:mount,submission:submission,outcome:outcome,tell:tell,setReviewMode:setReviewMode,replay:replay};
})(typeof window!=='undefined'?window:globalThis);
