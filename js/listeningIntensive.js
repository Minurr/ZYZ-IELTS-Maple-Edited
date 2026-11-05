(function (g) {
 'use strict';

    function paintSavedNotes(root, notes) {
        if (!root) return;
        // Paint ranges without rewriting text nodes: selections and vocabulary anchors stay intact.
        if (!window.CSS?.highlights || !window.Highlight) return;
        const registry = window.__ieltsNoteRanges ||= new Map();
        const ranges = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = []; let content = '';
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('button,textarea,script,style')) continue;
            nodes.push({ node, offset: content.length }); content += node.nodeValue;
        }
        for (const quote of new Set((notes || []).map(n => n.quote).filter(Boolean))) {
            let at = content.indexOf(quote);
            while (at >= 0) {
                const end = at + quote.length;
                const first = nodes.find(n => n.offset + n.node.length > at);
                const last = nodes.find(n => n.offset < end && n.offset + n.node.length >= end);
                if (first && last) {
                    const range = document.createRange();
                    range.setStart(first.node, at - first.offset); range.setEnd(last.node, end - last.offset);
                    ranges.push(range);
                }
                at = content.indexOf(quote, end);
            }
        }
        registry.set(root, ranges);
        for (const element of registry.keys()) if (!element.isConnected) registry.delete(element);
        CSS.highlights.set('ielts-saved-notes', new Highlight(...[...registry.values()].flat()));
        if (!document.getElementById('ielts-note-highlight-style')) {
            const style = document.createElement('style'); style.id = 'ielts-note-highlight-style';
            style.textContent = '::highlight(ielts-saved-notes){background-color:#dbeafe;color:#174b86}';
        document.head.append(style);
        }
    }

 let dictionaryPending;
    const RATES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2];
    const SEEK_MAX = 1000;
    const STEP = 5;

    function literalArray(source, start) {
        let out = '';
        let depth = 0;
        for (let i = start; i < source.length; i++) {
            const ch = source[i];
            if (source.slice(i, i + 2) === '//') {
                i = source.indexOf('\n', i);
                if (i < 0) return null;
                continue;
            }
            if (source.slice(i, i + 2) === '/*') {
                i = source.indexOf('*/', i + 2) + 1;
                if (i === 0) return null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                let value = '';
                let closed = false;
                const q = ch;
                while (++i < source.length) {
                    if (source[i] === q) { closed = true; break; }
                    if (source[i] === '\\') {
                        const c = source[++i];
                        value += ({ n: '\n', r: '\r', t: '\t' }[c] ?? c);
                    } else value += source[i];
                }
                if (!closed || value.includes('${')) return null;
                out += JSON.stringify(value);
                continue;
            }
            out += ch;
            if (ch === '[') depth++;
            if (ch === ']' && !--depth) {
                try { return JSON.parse(out.replace(/,\s*\]/g, ']')); } catch (_) { return null; }
            }
        }
        return null;
    }

    function script(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => { s.remove(); reject(Error('词典加载失败')); };
            document.head.append(s);
        });
    }

    function dictionary() {
        if (g.DictionaryService) return Promise.resolve(g.DictionaryService);
        if (!dictionaryPending) {
            dictionaryPending = (async () => {
                if (!g.__EMBEDDED_WORDLISTS__?.ielts_core) await script('/assets/wordlists/ielts_core.bundle.js');
                if (!g.__LOCAL_DICTIONARIES__?.ecdict) await script('/assets/wordlists/ecdict_reading.bundle.js');
                await script('/js/bundles/dictionary.bundle.js');
                return g.DictionaryService;
            })().catch((e) => { dictionaryPending = null; throw e; });
        }
        return dictionaryPending;
    }

    function clock(value) {
        const text = String(value ?? '').trim();
        if (!text) return null;
        if (/^\d+(?:\.\d+)?$/.test(text)) {
            const n = Number(text);
            return n >= 0 && n < 20000 ? n : null;
        }
        const parts = text.split(':');
        if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return null;
        const nums = parts.map(Number);
        const seconds = nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
        return seconds >= 0 && seconds < 20000 ? seconds : null;
    }

    function textOf(html) {
        const parsed = new DOMParser().parseFromString(String(html), 'text/html');
        parsed.querySelectorAll('script,style,button').forEach((n) => n.remove());
        const blocks = [...parsed.body.querySelectorAll('p,li,h1,h2,h3,h4')]
            .map((n) => n.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (blocks.length) return blocks;
        return parsed.body.textContent.replace(/[ \t]+/g, ' ').trim().split(/\n+/).map((s) => s.trim()).filter(Boolean);
    }

    function splitSentences(text) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return [];
        return clean.split(/(?<=[.!?])\s+(?=[A-Z\u201c"(])/).map((s) => s.trim()).filter(Boolean);
    }

    function pushCue(list, text, start, end) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return;
        if (start != null && end != null && end < start) end = null;
        list.push({ text: clean, start, end });
    }

    function endsSentence(text) {
        return /[.!?…]["'”’)]?$/.test(text);
    }

    function mergeCues(list) {
        const out = [];
        for (let i = 0; i < list.length; i++) {
            let text = list[i].text;
            let start = list[i].start;
            let end = list[i].end;
            while (!endsSentence(text) && i + 1 < list.length) {
                i += 1;
                text += ' ' + list[i].text;
                if (list[i].end != null) end = list[i].end;
            }
            out.push({ text, start, end });
        }
        return out;
    }

    function segmentsFrom(d) {
        const list = [];
        for (const s of d.scripts) {
            const m = /(?:(?:transcriptLines|rawTranscript|transcriptBlocks)\s*:|(?:TRANSCRIPT_PARAGRAPHS|TRANS_RAW|FULL_TRANSCRIPT)\s*=)\s*\[/i.exec(s.textContent);
            if (!m) continue;
            const rows = literalArray(s.textContent, m.index + m[0].length - 1);
            if (!rows?.length || !rows.every((x) => typeof x === 'string' || (Array.isArray(x) && typeof x[2] === 'string'))) continue;
            rows.forEach((row) => {
                if (typeof row === 'string') textOf(row).forEach((block) => pushCue(list, block, null, null));
                else pushCue(list, textOf(row[2]).join(' '), clock(row[0]), clock(row[1]));
            });
            if (list.length) return mergeCues(list);
        }
        const selectors = ['#transcript-content', '.transcript-content', '#custom-transcript', '#transcriptArea', '#transcriptFull', '#transcript-body', '.transcript-body', '#transcript-area', '.transcript-area', '#transcriptBody', '#transcriptContent', '.transcript-container', '.transcript-pane', '.transcript-block', '#transcriptPanel'];
        for (const selector of selectors) {
            const nodes = [...d.querySelectorAll(selector)];
            if (!nodes.length) continue;
            nodes.forEach((n) => {
                const c = n.cloneNode(true);
                c.querySelectorAll('script,style,button,input,audio,select,textarea').forEach((x) => x.remove());
                textOf(c.innerHTML).forEach((block) => pushCue(list, block, null, null));
            });
            if (list.map((item) => item.text).join('').length > 100) return mergeCues(list);
            list.length = 0;
        }
        for (const s of d.scripts) {
            const m = s.textContent.match(/(?:const|let|var)\s+(?:TRANSCRIPT_HTML|FULL_TRANSCRIPT(?:_HTML)?|fullTranscriptHTML)\s*=\s*`([^`]+)`/);
            if (m && !m[1].includes('${')) {
                textOf(m[1]).forEach((block) => pushCue(list, block, null, null));
                if (list.length) return mergeCues(list);
            }
        }
        for (const s of d.scripts) {
            const m = s.textContent.match(/(?:const|let|var)\s+TRANSCRIPT_FULL\s*=\s*(\[[\s\S]*?\]);/);
            if (!m) continue;
            try {
                const lines = JSON.parse(m[1]);
                if (lines.every((x) => typeof x === 'string')) {
                    lines.forEach((line) => pushCue(list, line, null, null));
                    if (list.length) return mergeCues(list);
                }
            } catch (_) {}
        }
        for (const s of d.scripts) {
            const m = s.textContent.match(/(?:(?:transcriptHTML|transcript)\s*:|tWrap\.innerHTML\s*=)\s*`([^`]+)`/);
            if (m && !m[1].includes('${')) {
                textOf(m[1]).forEach((block) => pushCue(list, block, null, null));
                if (list.length) return mergeCues(list);
            }
        }
        return mergeCues(list);
    }

    function extract(d) {
        return segmentsFrom(d).map((item) => item.text).join('\n');
    }

    function audioUrl(doc, pageUrl) {
        const node = doc.querySelector('audio[src],audio source[src],source[src]');
        const raw = node?.getAttribute('src') || 'audio.mp3';
        return new URL(raw, pageUrl).href;
    }

    function safePage(value) {
        if (!value || value.includes('..')) return '';
        try {
            const url = new URL(value, location.origin);
            if (url.origin !== location.origin) return '';
            const path = url.pathname;
            if (!path.toLowerCase().startsWith('/listeningpractice/') || !/\.html?$/i.test(path)) return '';
            return url.href;
        } catch (_) { return ''; }
    }

    function storeGet(key) {
        try { return sessionStorage.getItem(key) || ''; } catch (_) { return ''; }
    }

    function storeSet(key, value) {
        try { sessionStorage.setItem(key, value); } catch (_) {}
    }

    function fmt(n) {
        if (!Number.isFinite(n) || n < 0) return '0:00';
        const whole = Math.floor(n);
        return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
    }

    function start(options) {
        const root = options.root;
        const status = options.status;
        const pageUrl = safePage(options.sourceUrl);
        if (!pageUrl) { status.textContent = '没有可打开的听力题目。'; return; }
        status.textContent = '正在准备精听…';
        fetch(pageUrl, { credentials: 'same-origin', cache: 'no-store' }).then((r) => {
            if (!r.ok) throw Error('题目加载失败');
            return r.text();
        }).then((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const segments = segmentsFrom(doc);
            const maple = !segments.length && /\/6\.(?:%20|\s)*P4(?:%20|\s)Canadian(?:%20|\s)Maple(?:%20|\s)Syrup\//i.test(pageUrl);
            const source = maple
                ? fetch('/assets/generated/listening-exams/maple-transcript.json?v=20261103-translations-33', { credentials: 'same-origin' })
                    .then((response) => response.ok ? response.json() : Promise.reject(Error('原文加载失败')))
                    .then((data) => data.segments || [])
                : Promise.resolve(segments);
            return source.then((available) => {
                render(root, { title: options.title || doc.title || '精听', segments: available, audio: audioUrl(doc, pageUrl) });
                status.remove();
            });
        }).catch(() => { status.textContent = '精听页面加载失败，请返回题库后重试。'; });
    }

    function render(root, data) {
        const style = document.createElement('style');
        style.textContent = [
            'body{margin:0;background:#fff;color:#242424}',
            '#listening-studio{font:15px/1.5 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
            '#listening-studio *{box-sizing:border-box}',
            '#listening-studio button,#listening-studio select{font:inherit}',
            '#listening-studio button{border:1px solid #d5ded8;background:#f6f9f7;color:#285e45;border-radius:6px;padding:6px 12px;min-height:36px;cursor:pointer}',
            '#listening-studio button:hover:not(:disabled){background:#e7f0ea}',
            '#listening-studio button:disabled{opacity:.4;cursor:default}',
            '#listening-studio select{border:1px solid #d5ded8;background:#fff;color:#285e45;border-radius:6px;padding:6px 8px;min-height:36px}',
            '#listening-studio .li-play{background:#285e45;color:#fff;border-color:#285e45;min-width:72px}',
            '#listening-studio .li-play:hover:not(:disabled){background:#1f4a36}',
            '#listening-studio :focus-visible{outline:2px solid #285e45;outline-offset:2px}',
            '.li-top,.li-script,.li-dock-inner{max-width:820px;margin-left:auto;margin-right:auto}',
            '.li-top{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;padding:14px 24px;background:#fff;border-bottom:1px solid #e2e8f0}',
            '.li-back{flex:none;padding:5px 10px;font-size:13px;font-weight:600;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;text-decoration:none}',
            '.li-top h1{flex:1;margin:0;font-size:16px;font-weight:500;line-height:1.35}',
            '.li-script{padding:8px 24px 128px}',
            '.li-sentence{padding:22px 0;border-bottom:1px solid #ececec;scroll-margin:72px 0 140px}',
            '.li-sentence.is-current{background:#f4f8f5;margin:0 -12px;padding-left:12px;padding-right:12px}',
            '.li-sentence.is-cue{cursor:pointer}',
            '.li-en{margin:0;font-family:Georgia,"Times New Roman","Songti SC",serif;font-size:18px;line-height:1.8;color:#242424}',
            '.li-en mark.listening-vocab-word{background:#fff1a8;color:inherit;border-radius:2px;padding:0 1px}',
            '.li-stamp{float:right;margin-left:12px;color:#888;font:13px/1.8 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-variant-numeric:tabular-nums}',
            '.li-zh{margin:10px 0 0;padding-left:12px;border-left:1px solid #e5e5e5;color:#555;font-size:15px;line-height:1.7}',
            '.li-empty{color:#666}',
            '.li-dock{position:fixed;left:0;right:0;bottom:0;z-index:20;background:#fff;border-top:1px solid #e2e8f0;padding:10px 16px calc(12px + env(safe-area-inset-bottom))}',
            '.li-dock-inner{display:flex;flex-direction:column;gap:8px}',
            '.li-seek{position:relative;height:28px;display:flex;align-items:center}',
            '.li-seek input{position:relative;z-index:1;width:100%;accent-color:#285e45}',
            '.li-region,.li-mark,.li-ticks{position:absolute;pointer-events:none}',
            '.li-ticks{z-index:0;left:0;right:0;top:12px;height:4px}',
            '.li-ticks i{position:absolute;top:0;width:2px;height:4px;background:#9bb5a6}',
            '.li-region{z-index:0;top:12px;height:4px;border-radius:4px;background:rgba(40,94,69,.35)}',
            '.li-mark{z-index:2;top:6px;width:3px;height:16px;border-radius:2px;background:#285e45}',
            '.li-mark.is-b{background:#b8633a}',
            '.li-transport{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
            '.li-time,.li-note{font-variant-numeric:tabular-nums;color:#3d4a42}',
            '.li-note{font-size:13px}',
            '.li-dict{position:fixed;z-index:30;width:min(340px,calc(100vw - 16px));max-height:42vh;overflow:auto;background:#fff;border:1px solid #d9e3dc;border-radius:14px;box-shadow:0 16px 40px rgba(28,43,36,.16);padding:12px 14px}',
            '.li-dict header{display:flex;gap:8px;align-items:center}',
            '.li-dict header strong{flex:1;font-size:18px}',
            '.li-dict header button{padding:4px 8px}',
            '.li-dict-meta{color:#285e45;font-size:13px;margin-top:4px}',
            '.li-dict p{margin:6px 0 0;white-space:pre-wrap}',
            '.li-dict .is-en{color:#4e584f}',
            '.li-sentence{position:relative}.li-sync{position:absolute;right:4px;top:12px;font-size:12px!important;min-height:27px!important;padding:3px 7px!important;opacity:.7}.li-sync:hover{opacity:1}.li-sync-hint{font-size:12px;color:#617166}',
            '.li-dict-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.li-note-form[hidden]{display:none!important}.li-note-form{display:grid;gap:8px;margin-top:10px}.li-note-form textarea{width:100%;box-sizing:border-box;min-height:72px;resize:vertical;border:1px solid #d7ddd7;border-radius:8px;padding:8px;font:inherit}.li-note-form button{justify-self:end;width:auto}.li-note-list:empty{display:none}.li-note-list{display:grid;gap:8px;margin-top:10px}.li-note-list p{margin:4px 0 0}.li-book{position:fixed;inset:0;z-index:40;background:#1118;display:grid;place-items:center;padding:16px}.li-book[hidden]{display:none}.li-book-panel{width:min(620px,100%);max-height:85dvh;overflow:auto;background:#fff;border-radius:12px;padding:20px;box-shadow:0 20px 60px #0003}.li-book-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.li-book-head h2{margin:0;font-size:20px}.li-book-tools{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.li-book-tools input{flex:1;min-width:140px;padding:8px;border:1px solid #ccd7ce;border-radius:6px}.li-book-list{display:grid;gap:8px}.li-book-item{border:1px solid #e1e8e2;border-radius:8px;padding:12px}.li-book-item strong{font-size:18px}.li-book-item p{margin:10px 0;color:#334155;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}.li-book-item{padding:16px}.li-book-item strong{color:#174b86}.li-book-item small{display:block;margin-top:10px}.li-book-item small{color:#748075}.li-book-item button{float:right}.li-book-status{color:#5b6b60;font-size:13px}',
            '.li-book-definition{clear:both;margin-top:10px;padding:12px;border:1px solid #dfe7e1;background:#f9fbf9;border-radius:8px}.li-book-definition[hidden]{display:none}.li-book-definition section+section{border-top:1px solid #e1e8e2;margin-top:10px;padding-top:10px}.li-book-definition p{white-space:pre-wrap}',
            '.li-dict[hidden],.li-mark[hidden],.li-region[hidden]{display:none!important}'
        ].join('');
        style.textContent += `
          body{background:#fafaf8;color:#252a27}.li-top,.li-script,.li-dock-inner{max-width:1040px}
          .li-top{max-width:none;padding:16px max(20px,calc((100vw - 992px)/2));gap:18px;background:#fafaf8f5;backdrop-filter:blur(12px)}
          .li-top h1{font-size:17px;font-weight:600}.li-back{background:none;border:0;padding:8px 0;white-space:nowrap}
          .li-view-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:20px 0 16px;border-bottom:1px solid #ddd}
          .li-view-tools .li-hint{font-size:13px;color:#717872;margin-left:auto}
          #listening-studio button,#listening-studio select{background:#fff;color:#313b34;border:1px solid #d7ddd7;border-radius:7px;min-height:40px;padding:8px 12px}
          #listening-studio button[aria-pressed=true]{background:#e9efe8;border-color:#9aac9d;color:#213e2b}
          #listening-studio .li-play{background:#293d30;color:white;min-width:84px}
          .li-script{padding:0 24px calc(var(--li-dock-height,160px) + 40px)}
          .li-sentence{display:grid;grid-template-columns:64px minmax(0,1fr);column-gap:18px;padding:22px 12px;border-bottom:1px solid #e8e9e3;scroll-margin:120px 0 calc(var(--li-dock-height,160px) + 20px)}
          .li-sentence.is-current{margin:0;background:#eef2eb;border-radius:8px;padding:22px 12px}
          .li-sentence.is-cue{cursor:text}.li-en{font-size:21px;line-height:1.85;grid-column:2;overflow-wrap:anywhere}
          .li-zh{grid-column:2;padding:0;border:0;margin:9px 0 0;color:#73796f;font-size:15px;line-height:1.9}
          .li-line-control{grid-row:1/3;grid-column:1;align-self:start;text-align:center;color:#8b9189;font-size:12px;padding-top:8px}
          #listening-studio button.li-line-play{padding:5px 6px;font-size:12px;min-height:32px;width:64px;background:transparent;border-color:transparent}
          #listening-studio button.li-line-play:hover{background:#e0e9dd}.li-no-translation .li-zh{display:none}
          .li-dock{padding:12px 20px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -4px 20px #00000005;background:#fff}
          .li-transport{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.li-time{margin:0 6px;min-width:112px}.li-loop-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:13px}
          .li-loop-tools span{color:#757e75}.li-loop-tools .li-note{margin-left:auto}.li-seek{height:22px}
          .li-dict{box-shadow:0 8px 40px #0002;border:1px solid #d9dfd6;border-radius:10px;max-height:40dvh;overflow:auto;background:#fff;padding:18px}
          #listening-studio .li-dict header{position:sticky;top:-18px;background:#fff;padding:8px 0}#listening-studio .li-dict-actions button,#listening-studio .li-note-form button{min-height:36px;padding:7px 12px}.li-empty{padding:30px 12px}
          @media(max-width:650px){.li-top{padding:12px 16px;gap:12px}.li-top h1{font-size:15px}.li-script{padding-left:12px;padding-right:12px}.li-view-tools{padding:12px 4px;gap:6px}.li-view-tools .li-hint{width:100%;margin:0}.li-sentence,.li-sentence.is-current{grid-template-columns:44px minmax(0,1fr);gap:10px;padding:17px 4px}.li-en{font-size:19px}.li-zh{font-size:14px}#listening-studio button.li-line-play{width:44px;padding:4px 0;font-size:11px}.li-dock{padding:8px 12px calc(10px + env(safe-area-inset-bottom))}.li-transport{gap:6px}#listening-studio button,#listening-studio select{padding:7px 9px;min-height:38px}.li-time{font-size:12px;min-width:98px;margin:0}.li-loop-tools{gap:6px}.li-loop-tools>span:first-child{display:none}}
        `;
        const page = document.createElement('main');
        page.id = 'listening-studio';
        page.innerHTML = [
            '<header class="li-top"><a class="li-back" href="/">返回</a><h1></h1></header>',
            '<div class="li-script"><div class="li-view-tools"><button type="button" data-translation aria-pressed="true">中文译文</button><button type="button" data-follow aria-pressed="true">跟随播放</button><button type="button" data-book-open>生词本</button><button type="button" data-current>回到当前句</button><button type="button" data-sync-reset hidden>重置对齐</button><span class="li-sync-hint">时间错位？播放到对应句时点“对齐”，可对齐两处。</span></div><div data-passages></div></div>',
            '<footer class="li-dock"><div class="li-dock-inner">',
            '<div class="li-seek"><i class="li-region" data-region hidden></i><i class="li-mark" data-mark-a hidden></i><i class="li-mark is-b" data-mark-b hidden></i><span class="li-ticks" data-ticks></span><input data-seek type="range" min="0" max="1000" value="0" aria-label="播放进度"></div>',
            '<div class="li-transport"><button type="button" class="li-play" data-play>播放</button><button type="button" data-back>−5s</button><button type="button" data-forward>+5s</button><span class="li-time" data-time>0:00 / 0:00</span><label>速度 <select data-rate aria-label="速度"></select></label></div><div class="li-loop-tools"><span>句子复听</span><button type="button" data-prev>上一句</button><button type="button" data-repeat>循环本句</button><button type="button" data-next>下一句</button><button type="button" data-a>设置 A</button><button type="button" data-b>设置 B</button><button type="button" data-clear hidden>取消循环</button><span class="li-note" data-note role="status"></span></div>',
            '</div></footer>',
            '<aside class="li-dict" data-dict hidden role="dialog" aria-label="词典"><header><strong></strong><button type="button" data-dict-close>关闭</button></header><div data-dict-body></div><div class="li-dict-actions"><button type="button" data-dict-save>收录到生词本</button><button type="button" data-dict-note>添加笔记</button></div><form class="li-note-form" data-dict-note-form hidden><textarea data-dict-note-input maxlength="500" placeholder="写下这一处的笔记"></textarea><button type="button" data-dict-note-save>保存笔记</button></form><div class="li-note-list" data-dict-notes></div></aside>',
            '<div class="li-book" data-book hidden role="dialog" aria-modal="false" aria-label="听力生词与笔记"><div class="li-book-panel"><div class="li-book-head"><h2>听力生词本</h2><button type="button" data-book-close>关闭</button></div><div class="li-book-tools"><button type="button" data-book-scope>本题</button><input type="search" data-book-search placeholder="搜索单词或题目" aria-label="搜索生词"><span class="li-book-status" data-book-count></span></div><div class="li-book-list" data-book-list></div><h2 style="margin:18px 0 8px;font-size:18px">笔记</h2><div class="li-book-list" data-book-notes></div></div></div>'
        ].join('');
            style.textContent += '#listening-studio .li-book{background:transparent;pointer-events:none;place-items:start end;padding:80px 16px 16px}#listening-studio .li-book-panel{pointer-events:auto;width:min(410px,88vw);max-height:calc(100dvh - 100px);background:rgba(255,255,255,.94);box-shadow:0 8px 35px #17203326;border:1px solid #dce3ec}#listening-studio .li-note-card{border:0;border-bottom:1px solid #e2e8f0;border-radius:0;padding:18px 0}#listening-studio .li-note-card>strong{display:block;background:#eff6ff;padding:10px 12px;font:500 15px/1.6 system-ui;color:#245180}#listening-studio .li-note-card>button{float:none;margin:10px 8px 0 0}@media(min-width:1100px){#listening-studio:has(.li-book:not([hidden])) .li-script{box-sizing:border-box;width:calc(100% - 464px);margin-right:440px;margin-left:auto}}';
        document.head.append(style);
        root.replaceChildren(page);

        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.src = data.audio;
        page.append(audio);
        page.querySelector('h1').textContent = data.title || '精听';

        const passages = page.querySelector('[data-passages]');
        const dict = page.querySelector('[data-dict]');
        const dictBody = page.querySelector('[data-dict-body]');
        const book = page.querySelector('[data-book]');
        const bookList = page.querySelector('[data-book-list]');
        const sourcePath = new URL(data.audio, location.origin).pathname;
        let bookWords = [];
        let passageNotes = [];
        let bookLoaded = false;
        let bookCurrent = true;
        let selectedWord = '';
        let selectedContext = '';
        let accountIdPromise;
        let bookRequestSequence = 0;
        const accountId = () => accountIdPromise ||= fetch('/api/status', { credentials: 'same-origin' })
            .then(r => r.ok ? r.json() : Promise.reject(Error('账号检查失败')))
            .then(data => data.user?.id || Promise.reject(Error('请先登录')));
        async function bookRequest(action, payload) {
            const sequence = ++bookRequestSequence;
            const id = await accountId();
            const response = await fetch('/api/listening-vocabulary', {
                credentials: 'same-origin',
                method: action ? 'POST' : 'GET',
                headers: { 'X-IELTS-User': id, ...(action ? { 'Content-Type': 'application/json' } : {}) },
                ...(action ? { body: JSON.stringify({ action, ...payload }) } : {})
            });
            if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || '生词本保存失败');
            const words = (await response.json()).words || [];
            if (sequence === bookRequestSequence) { bookWords = words; bookLoaded = true; }
            return bookWords;
        }
        async function noteRequest(action, payload) {
            const id = await accountId();
            const query = action ? '' : '?subject=listening&source=' + encodeURIComponent(sourcePath);
            const response = await fetch('/api/selection-notes' + query, {
                credentials: 'same-origin',
                method: action ? 'POST' : 'GET',
                headers: { 'X-IELTS-User': id, ...(action ? { 'Content-Type': 'application/json' } : {}) },
                ...(action ? { body: JSON.stringify({ action, subject: 'listening', source: sourcePath, ...payload }) } : {})
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Error(data.error || '笔记保存失败');
            passageNotes = data.notes || [];
            passages.querySelectorAll('.li-en').forEach(root => paintSavedNotes(root, passageNotes));
            return passageNotes;
        }
        function renderDictNotes() {
            const list = page.querySelector('[data-dict-notes]');
            const rows = passageNotes.filter(item => item.quote === selectedWord);
            list.replaceChildren();
            rows.forEach(item => {
                const block = document.createElement('article');
                const quote = document.createElement('strong'); quote.textContent = item.quote;
                const text = document.createElement('p'); text.textContent = item.note;
                block.append(quote, text);
                list.append(block);
            });
        }
        function renderBookNotes() {
            const list = page.querySelector('[data-book-notes]');
            list.replaceChildren();
            if (!passageNotes.length) { list.textContent = '暂无笔记。划选原文后可添加。'; return; }
            passageNotes.forEach(item => {
                const block = document.createElement('article'); block.className = 'li-book-item';
                const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
                remove.onclick = async () => {
                    remove.disabled = true;
                    try { await noteRequest('remove', { id: item.id }); renderBookNotes(); renderDictNotes(); }
                    catch (error) { remove.disabled = false; remove.textContent = '重试'; }
                };
                const quote = document.createElement('strong'); quote.textContent = item.quote;
                const text = document.createElement('p'); text.textContent = item.note;
                const meta = document.createElement('small');
                meta.textContent = [item.title, item.created_at].filter(Boolean).join(' · ');
                const locate = document.createElement('button'); locate.type = 'button'; locate.textContent = '查看原文';
                locate.onclick = () => { if (window.innerWidth < 1100) book.hidden = true; const target = [...passages.querySelectorAll('.li-en')].find(el => el.textContent.includes(item.quote)); if (target) target.scrollIntoView({behavior:'smooth', block:'center'}); };
                block.classList.add('li-note-card');
                block.append(quote, text, meta, locate, remove);
                list.append(block);
            });
        }
        function refreshSaveButton() {
            const button = page.querySelector('[data-dict-save]');
            const saved = bookWords.some(row => row.word.toLowerCase() === selectedWord.toLowerCase() && row.source === sourcePath);
            button.textContent = saved ? '已收录' : '收录到生词本';
            button.disabled = !selectedWord || saved;
        }
        function renderBook() {
            const query = page.querySelector('[data-book-search]').value.trim().toLowerCase();
            const rows = bookWords.filter(row => (!bookCurrent || row.source === sourcePath)
                && (!query || (row.word + ' ' + row.title + ' ' + row.context).toLowerCase().includes(query)));
            page.querySelector('[data-book-scope]').textContent = bookCurrent ? '本题 · 切换全部' : '全部题目 · 切换本题';
            page.querySelector('[data-book-count]').textContent = `${rows.length} 个词`;
            bookList.replaceChildren();
            if (!rows.length) { bookList.textContent = '暂无生词。划选原文后可在词典中收录。'; return; }
            rows.forEach(row => {
                const item = document.createElement('article'); item.className = 'li-book-item';
                const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '移除';
                remove.onclick = async () => {
                    remove.disabled = true; remove.textContent = '移除中…';
                    try { await bookRequest('remove', { word: row.word, source: row.source }); renderBook(); refreshSaveButton(); paintVocab(); }
                    catch (error) { remove.disabled = false; remove.textContent = '重试移除'; page.querySelector('[data-book-count]').textContent = error.message; }
                };
                const title = document.createElement('strong'); title.textContent = row.word;
                const definition = document.createElement('div'); definition.className = 'li-book-definition'; definition.hidden = true;
                const lookup = document.createElement('button'); lookup.type = 'button'; lookup.textContent = '查看词典';
                lookup.onclick = async () => {
                    if (!definition.hidden) { definition.hidden = true; lookup.textContent = '查看词典'; return; }
                    definition.hidden = false; definition.textContent = '查词中…'; lookup.disabled = true;
                    try {
                        const result = (await dictionary()).lookup(row.word);
                        definition.replaceChildren();
                        if (!result.found) definition.textContent = '本地词典暂未收录这个词。';
                        else (result.parts?.length ? result.parts : [result]).forEach(part => {
                            const section = document.createElement('section');
                            const heading = document.createElement('strong');
                            heading.textContent = [part.term || result.term || row.word, part.phonetic ? '/' + part.phonetic + '/' : '', part.pos || ''].filter(Boolean).join(' · ');
                            section.append(heading);
                            for (const value of [part.zh, part.en, part.example]) if (value) {
                                const p = document.createElement('p'); p.textContent = value; section.append(p);
                            }
                            definition.append(section);
                        });
                    } catch (_) { definition.textContent = '词典加载失败，收起后可重试。'; }
                    finally { lookup.disabled = false; lookup.textContent = '收起词典'; }
                };
                const context = document.createElement('p'); context.textContent = row.context || '';
                const origin = document.createElement('small'); origin.textContent = row.title || '听力原文';
                item.append(remove, title, lookup, context, origin, definition); bookList.append(item);
            });
        }
        page.querySelector('[data-book-open]').onclick = async () => {
            book.hidden = false; bookList.textContent = '正在加载生词本…';
            try { await bookRequest(); renderBook(); await noteRequest(); renderBookNotes(); } catch (error) { bookList.textContent = error.message + '，请关闭后重试。'; }
        };
        page.querySelector('[data-book-close]').onclick = () => { book.hidden = true; };
        book.onclick = event => { if (event.target === book) book.hidden = true; };
        page.querySelector('[data-book-scope]').onclick = () => { bookCurrent = !bookCurrent; renderBook(); };
        page.querySelector('[data-book-search]').oninput = renderBook;
        page.querySelector('[data-dict-save]').onclick = async event => {
            if (!selectedWord) return;
            const button = event.currentTarget; button.disabled = true; button.textContent = '保存中…';
            try {
                await bookRequest('add', { word: selectedWord, source: sourcePath, title: data.title, context: selectedContext });
                refreshSaveButton(); paintVocab(); if (!book.hidden) renderBook();
            } catch (error) { button.disabled = false; button.textContent = '重试收录'; noteText(error.message); }
        };
        page.querySelector('[data-dict-note]').onclick = () => {
            const form = page.querySelector('[data-dict-note-form]');
            form.hidden = false;
            page.querySelector('[data-dict-note-input]').focus();
        };
        page.querySelector('[data-dict-note-save]').onclick = async event => {
            const input = page.querySelector('[data-dict-note-input]');
            const text = input.value.trim();
            if (!selectedWord || !text) return;
            const button = event.currentTarget; button.disabled = true; button.textContent = '保存中…';
            try {
                await noteRequest('add', { quote: selectedWord, note: text, title: data.title || '' });
                input.value = '';
                page.querySelector('[data-dict-note-form]').hidden = true;
                renderDictNotes();
                if (!book.hidden) renderBookNotes();
                noteText('笔记已保存');
            } catch (error) { noteText(error.message); }
            finally { button.disabled = false; button.textContent = '保存笔记'; }
        };
        const seek = page.querySelector('[data-seek]');
        const region = page.querySelector('[data-region]');
        const markA = page.querySelector('[data-mark-a]');
        const markB = page.querySelector('[data-mark-b]');
        const ticks = page.querySelector('[data-ticks]');
        const note = page.querySelector('[data-note]');
        const rateSelect = page.querySelector('[data-rate]');
        const segments = data.segments || [];
        const nodes = [];
        const posKey = 'ielts-listening-intensive-pos:' + new URL(data.audio, location.origin).pathname;
        const syncKey = 'ielts-listening-intensive-sync:' + sourcePath;
        let syncAnchors = [];
        try {
            const stored = JSON.parse(localStorage.getItem(syncKey) || '[]');
            if (Array.isArray(stored)) syncAnchors = stored.filter(row => Number.isFinite(row?.source) && Number.isFinite(row?.audio)).slice(-2);
        } catch (_) {}
        if (syncAnchors.length === 2) {
            const slope = (syncAnchors[1].audio - syncAnchors[0].audio) / (syncAnchors[1].source - syncAnchors[0].source);
            if (!Number.isFinite(slope) || slope < 0.3 || slope > 3) syncAnchors = [];
        }
        segments.forEach(seg => { seg.rawStart = seg.start; seg.rawEnd = seg.end; });
        function applySync() {
            const anchors = [...syncAnchors].sort((a, b) => a.source - b.source);
            const slope = anchors.length === 2 ? (anchors[1].audio - anchors[0].audio) / (anchors[1].source - anchors[0].source) : 1;
            const convert = value => value == null ? null : Math.max(0, anchors.length ? anchors[0].audio + (value - anchors[0].source) * slope : value);
            segments.forEach((seg, index) => {
                seg.start = convert(seg.rawStart);
                seg.end = convert(seg.rawEnd);
                nodes[index]?.querySelector('.li-line-play')?.replaceChildren(document.createTextNode(fmt(seg.start)));
            });
            page.querySelector('[data-sync-reset]').hidden = !anchors.length;
            currentIndex = -2;
            if (audio.readyState > 0) paintTicks();
            if (nodes.length) update();
        }
        function alignSentence(index) {
            const source = segments[index]?.rawStart;
            if (source == null || !Number.isFinite(audio.currentTime)) return;
            const previous = syncAnchors;
            syncAnchors = syncAnchors.length === 1 && Math.abs(syncAnchors[0].source - source) > 10
                ? [syncAnchors[0], { source, audio: audio.currentTime }]
                : [{ source, audio: audio.currentTime }];
            if (syncAnchors.length === 2) {
                const slope = (syncAnchors[1].audio - syncAnchors[0].audio) / (syncAnchors[1].source - syncAnchors[0].source);
                if (slope < 0.3 || slope > 3 || !Number.isFinite(slope)) {
                    syncAnchors = previous; noteText('两处对齐点冲突，请重置后重试'); return;
                }
            }
            try { localStorage.setItem(syncKey, JSON.stringify(syncAnchors)); } catch (_) {}
            applySync(); noteText(syncAnchors.length === 2 ? '已按两处时间点对齐' : '已对齐这一句，可再对齐一处修正漂移');
        }
        page.querySelector('[data-sync-reset]').onclick = () => {
            syncAnchors = []; try { localStorage.removeItem(syncKey); } catch (_) {}
            applySync(); noteText('已恢复原始时间');
        };
        let rateIndex = RATES.indexOf(Number(storeGet('ielts-listening-intensive-rate')));
        if (rateIndex < 0) rateIndex = RATES.indexOf(1);
        let pointA = null;
        let pointB = null;
        let regionLock = false;
        let dragging = false;
        let restored = false;
        let lastSave = 0;
        let dictSeq = 0;
        let selectTimer;
        let currentIndex = -2;
        let noted = false;
        let following = true;
        const followButton = page.querySelector('[data-follow]');
        const setFollow = value => { following=value; followButton.setAttribute('aria-pressed',String(value)); };
        followButton.onclick=()=>setFollow(!following);
        page.querySelector('[data-translation]').onclick=event=>{const hidden=page.classList.toggle('li-no-translation');event.currentTarget.setAttribute('aria-pressed',String(!hidden));};
        page.querySelector('[data-current]').onclick=()=>{const i=activeIndex(audio.currentTime);if(i>=0)nodes[i].scrollIntoView({block:'center',behavior:'smooth'});setFollow(true);};
        passages.addEventListener('wheel',()=>setFollow(false),{passive:true});
        passages.addEventListener('touchmove',()=>setFollow(false),{passive:true});
        const timed=segments.map((seg,index)=>({seg,index})).filter(x=>x.seg.start!=null);
        if (!timed.length) page.querySelector('.li-sync-hint').hidden = true;
        applySync();
        function nextSentence(delta){const i=activeIndex(audio.currentTime);let at=timed.findIndex(x=>x.index===i);if(at<0)at=delta>0?-1:1;const item=timed[Math.max(0,Math.min(timed.length-1,at+delta))];if(item){pointA=pointB=null;seekTo(item.seg.start);setFollow(true);play();}}
        page.querySelector('[data-prev]').onclick=()=>nextSentence(-1);
        page.querySelector('[data-next]').onclick=()=>nextSentence(1);
        page.querySelector('[data-repeat]').onclick=()=>{const i=activeIndex(audio.currentTime),seg=segments[i];if(!seg||seg.start==null||seg.end==null||seg.end<=seg.start){noteText('本句没有完整时间范围，可手动设置 A、B。');return;}pointA=seg.start;pointB=seg.end;seekTo(pointA);update();play();};
        ['prev','next','repeat','current'].forEach(key=>{page.querySelector('[data-'+key+']').disabled=!timed.length;});
        const dock=page.querySelector('.li-dock');
        const measureDock=()=>page.style.setProperty('--li-dock-height',dock.getBoundingClientRect().height+'px');
        if(g.ResizeObserver){const observer=new ResizeObserver(measureDock);observer.observe(dock);g.addEventListener('pagehide',()=>observer.disconnect(),{once:true});}measureDock();
        g.addEventListener('pagehide',()=>audio.pause());

        RATES.forEach((value) => {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value) + '×';
            rateSelect.append(option);
        });
        rateSelect.value = String(RATES[rateIndex]);
        audio.playbackRate = RATES[rateIndex];

        function noteText(text) {
            note.textContent = text || '';
            noted = Boolean(text);
        }

        function buildScript() {
            passages.replaceChildren();
            nodes.length = 0;
            if (!segments.length) {
                const empty = document.createElement('p');
                empty.className = 'li-empty';
                empty.textContent = '没有原文。';
                passages.append(empty);
                return;
            }
            segments.forEach((seg, index) => {
                const section = document.createElement('section');
                section.className = 'li-sentence' + (seg.start == null ? '' : ' is-cue');
                const en = document.createElement('p');
                en.className = 'li-en';
                const control=document.createElement(seg.start==null?'span':'button');
                control.className='li-line-control'+(seg.start==null?'':' li-line-play');
                control.textContent=seg.start==null?String(index+1).padStart(2,'0'):fmt(seg.start);
                if(seg.start!=null){control.type='button';control.setAttribute('aria-label','播放第 '+(index+1)+' 句');control.onclick=()=>{pointA=pointB=null;seekTo(seg.start);play();};}
                en.textContent=seg.text;
                const zh=document.createElement('p');zh.className='li-zh';zh.textContent='正在加载译文…';
                section.append(control,en,zh);
                if (seg.start != null) {
                    const sync = document.createElement('button'); sync.type = 'button'; sync.className = 'li-sync';
                    sync.textContent = '对齐'; sync.title = '播放到这一句时点击，对齐时间轴';
                    sync.onclick = () => alignSentence(index); section.append(sync);
                }
                passages.append(section);
                nodes.push(section);
            });
            fillTranslations();
            paintVocab();
        }

        function paintVocab() {
            const terms = [...new Set(bookWords.map(row => String(row.word || '').replace(/\s+/g, ' ').trim()).filter(word => word.length > 1 && /[A-Za-z]/.test(word)))];
            passages.querySelectorAll('.li-en').forEach(node => { highlightTerms(node, terms); paintSavedNotes(node, passageNotes); });
        }

        function highlightTerms(root, terms) {
            root.querySelectorAll('mark.listening-vocab-word').forEach(mark => mark.replaceWith(mark.ownerDocument.createTextNode(mark.textContent)));
            root.normalize();
            if (!terms.length) return;
            const pattern = terms.slice().sort((a, b) => b.length - a.length)
                .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
            const re = new RegExp('(^|[^A-Za-z])(' + pattern + ')(?![A-Za-z])', 'gi');
            const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(node => {
                const text = node.nodeValue;
                if (!text || !/[A-Za-z]/.test(text)) return;
                re.lastIndex = 0;
                if (!re.test(text)) return;
                re.lastIndex = 0;
                const frag = node.ownerDocument.createDocumentFragment();
                let last = 0;
                let match;
                while ((match = re.exec(text))) {
                    const start = match.index + match[1].length;
                    if (start > last) frag.append(node.ownerDocument.createTextNode(text.slice(last, start)));
                    const mark = node.ownerDocument.createElement('mark');
                    mark.className = 'listening-vocab-word';
                    mark.textContent = match[2];
                    frag.append(mark);
                    last = start + match[2].length;
                    if (re.lastIndex === match.index) re.lastIndex += 1;
                }
                if (last < text.length) frag.append(node.ownerDocument.createTextNode(text.slice(last)));
                node.replaceWith(frag);
            });
        }

        function fillTranslations() {
            fetch('/assets/generated/listening-translations-reviewed.json?v=20261103-translations-33', { credentials: 'same-origin' }).then((response) => {
                if (!response.ok) throw Error('译文加载失败');
                return response.json();
            }).then((data) => {
                const map = new Map();
                (data.sentences || []).forEach((item) => {
                    if (item.en && item.zh) map.set(item.en, item.zh);
                });
                nodes.forEach((node, index) => {
                    node.querySelector('.li-zh').textContent = map.get(segments[index].text) || '暂无译文';
                });
            }).catch(() => {
                nodes.forEach((node) => { node.querySelector('.li-zh').textContent = '译文暂时无法加载'; });
            });
        }

        function seekTo(time) {
            regionLock = false;
            const end = Number.isFinite(audio.duration) ? audio.duration : time;
            audio.currentTime = Math.max(0, Math.min(end, time));
        }

        function play() {
            audio.play().catch(() => noteText('播放失败'));
        }

        function reachEnd() {
            if (regionLock || pointA === null || pointB === null) return;
            regionLock = true;
            audio.currentTime = pointA;
            play();
        }

        function activeIndex(time) {
            let fallback = -1;
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (seg.start == null) continue;
                if (seg.start > time + 0.08) break;
                fallback = i;
            }
            if (fallback < 0) return -1;
            const current = segments[fallback];
            const next = segments.slice(fallback + 1).find((seg) => seg.start != null);
            if (current.end != null && time > current.end + 0.25 && (!next || time < next.start - 0.2)) return -1;
            return fallback;
        }

        function markSentence(time) {
            const index = activeIndex(time);
            if (index === currentIndex) return;
            currentIndex = index;
            nodes.forEach((node, i) => node.classList.toggle('is-current', i === index));
            if (index >= 0 && following && g.getSelection()?.isCollapsed !== false) nodes[index].scrollIntoView({ block: 'nearest' });
        }

        function paintTicks() {
            ticks.replaceChildren();
            const duration = audio.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;
            const marks = segments.filter((seg) => seg.start != null);
            if (!marks.length || marks.length > 160) return;
            marks.forEach((seg) => {
                const tick = document.createElement('i');
                tick.style.left = (seg.start / duration * 100) + '%';
                ticks.append(tick);
            });
        }

        function update() {
            const duration = audio.duration;
            const known = Number.isFinite(duration) && duration > 0;
            page.querySelector('[data-time]').textContent = fmt(audio.currentTime) + ' / ' + fmt(duration);
            page.querySelector('[data-play]').textContent = audio.paused ? '播放' : '暂停';
            page.querySelector('[data-a]').textContent = pointA === null ? '设置 A' : 'A ' + fmt(pointA);
            page.querySelector('[data-b]').textContent = pointB === null ? '设置 B' : 'B ' + fmt(pointB);
            page.querySelector('[data-b]').disabled = pointA === null;
            page.querySelector('[data-clear]').hidden = pointA === null;
            if (!dragging && known) seek.value = String(Math.round(audio.currentTime / duration * SEEK_MAX));
            seek.disabled = !known;
            if (pointA === null || !known) region.hidden = true;
            else {
                const start = pointA / duration * 100;
                const end = (pointB === null ? pointA : pointB) / duration * 100;
                region.hidden = false;
                region.style.left = start + '%';
                region.style.width = Math.max(0.4, end - start) + '%';
            }
            markA.hidden = pointA === null || !known;
            markB.hidden = pointB === null || !known;
            if (!markA.hidden) markA.style.left = (pointA / duration * 100) + '%';
            if (!markB.hidden) markB.style.left = (pointB / duration * 100) + '%';
            if (!noted) note.textContent = '';
            if (known && audio.currentTime > 1 && Date.now() - lastSave > 2000) {
                lastSave = Date.now();
                storeSet(posKey, String(Math.floor(audio.currentTime)));
            }
            if (!dragging) markSentence(audio.currentTime);
        }

        function fillDict(result) {
            dict.querySelector('strong').textContent = result.found ? (result.term || result.requested) : (result.requested || '');
            dictBody.replaceChildren();
            if (!result.found) {
                const empty = document.createElement('p');
                empty.textContent = '本地词典暂未收录。';
                dictBody.append(empty);
                return;
            }
            (result.parts?.length ? result.parts : [result]).forEach((part) => {
                const meta = document.createElement('div');
                meta.className = 'li-dict-meta';
                meta.textContent = [part.term && part !== result ? part.term : '', part.phonetic ? '/' + part.phonetic + '/' : '', part.pos || ''].filter(Boolean).join(' · ');
                if (meta.textContent) dictBody.append(meta);
                if (part.zh) {
                    const zh = document.createElement('p');
                    zh.textContent = part.zh;
                    dictBody.append(zh);
                }
                if (part.en) {
                    const en = document.createElement('p');
                    en.className = 'is-en';
                    en.textContent = part.en;
                    dictBody.append(en);
                }
                if (part.example) {
                    const example = document.createElement('p'); example.className = 'is-en';
                    example.textContent = '例句：' + part.example; dictBody.append(example);
                }
            });
        }

        function placeDict(rect) {
            dict.hidden = false;
            const width = dict.offsetWidth || 320;
            const height = dict.offsetHeight || 160;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
            const below = rect.bottom + 8;
            dict.style.left = left + 'px';
            dict.style.top = (below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 8) : below) + 'px';
        }

        page.querySelector('[data-play]').onclick = () => { if (audio.paused) play(); else audio.pause(); };
        page.querySelector('[data-back]').onclick = () => seekTo(Math.max(pointB === null ? 0 : (pointA ?? 0), audio.currentTime - STEP));
        page.querySelector('[data-forward]').onclick = () => seekTo(audio.currentTime + STEP);
        rateSelect.onchange = () => {
            rateIndex = Math.max(0, RATES.indexOf(Number(rateSelect.value)));
            storeSet('ielts-listening-intensive-rate', String(RATES[rateIndex]));
            audio.playbackRate = RATES[rateIndex];
        };
        page.querySelector('[data-a]').onclick = () => { pointA = audio.currentTime; pointB = null; regionLock = false; noteText(''); update(); };
        page.querySelector('[data-b]').onclick = () => {
            if (pointA === null || audio.currentTime <= pointA + 0.25) {
                noteText('B 要晚于 A');
                return;
            }
            pointB = audio.currentTime;
            noteText('');
            seekTo(pointA);
            update();
            play();
        };
        page.querySelector('[data-clear]').onclick = () => { pointA = pointB = null; regionLock = false; noteText(''); update(); };
        page.querySelector('[data-dict-close]').onclick = () => { dict.hidden = true; };
        seek.addEventListener('pointerdown', () => { dragging = true; });
        seek.addEventListener('input', () => {
            dragging = true;
            if (Number.isFinite(audio.duration)) page.querySelector('[data-time]').textContent = fmt(seek.value / SEEK_MAX * audio.duration) + ' / ' + fmt(audio.duration);
        });
        seek.addEventListener('change', () => {
            dragging = false;
            if (Number.isFinite(audio.duration)) seekTo(seek.value / SEEK_MAX * audio.duration);
        });
        audio.addEventListener('timeupdate', () => {
            if (pointB !== null && audio.currentTime >= pointB - 0.05) reachEnd();
            update();
        });
        audio.addEventListener('seeked', () => { regionLock = false; update(); });
        audio.addEventListener('play', update);
        audio.addEventListener('pause', update);
        audio.addEventListener('loadedmetadata', () => {
            paintTicks();
            if (!restored) {
                restored = true;
                const saved = Number(storeGet(posKey));
                if (saved > 2 && saved < audio.duration - 1) audio.currentTime = saved;
            }
            update();
        });
        audio.addEventListener('ended', () => { if (pointB !== null) reachEnd(); else update(); });
        audio.addEventListener('error', () => noteText('音频加载失败'));
        document.addEventListener('keydown', (event) => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === 'Escape') {
                if (!book.hidden) { book.hidden = true; return; }
                if (!dict.hidden) { dict.hidden = true; return; }
                if (pointA !== null) page.querySelector('[data-clear]').click();
                return;
            }
            const tag = document.activeElement?.tagName;
            const type = document.activeElement?.getAttribute('type');
            if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
            if (tag === 'INPUT' && type !== 'range') return;
            if (event.key === ' ') { event.preventDefault(); page.querySelector('[data-play]').click(); }
            else if (event.key === 'ArrowLeft') { event.preventDefault(); seekTo(Math.max(pointB === null ? 0 : (pointA ?? 0), audio.currentTime - (event.shiftKey ? 10 : STEP))); }
            else if (event.key === 'ArrowRight') { event.preventDefault(); seekTo(audio.currentTime + (event.shiftKey ? 10 : STEP)); }
            else if (event.key === 'a' || event.key === 'A') page.querySelector('[data-a]').click();
            else if (event.key === 'b' || event.key === 'B') page.querySelector('[data-b]').click();
            else if (event.key === '[') { rateIndex = Math.max(0, rateIndex - 1); rateSelect.value = String(RATES[rateIndex]); rateSelect.onchange(); }
            else if (event.key === ']') { rateIndex = Math.min(RATES.length - 1, rateIndex + 1); rateSelect.value = String(RATES[rateIndex]); rateSelect.onchange(); }
        });
        document.addEventListener('selectionchange', () => {
            clearTimeout(selectTimer);
            selectTimer = setTimeout(async () => {
                const selection = g.getSelection();
                if (!selection || selection.isCollapsed || !passages.contains(selection.anchorNode) || !passages.contains(selection.focusNode)) return;
                const term = selection.toString().trim();
                if (!term || term.length > 80 || !/[A-Za-z]/.test(term)) return;
                selectedWord = term;
                selectedContext = selection.anchorNode?.parentElement?.closest('.li-sentence')?.querySelector('.li-en')?.textContent || '';
                const noteForm = page.querySelector('[data-dict-note-form]');
                if (document.activeElement !== page.querySelector('[data-dict-note-input]')) noteForm.hidden = true;
                refreshSaveButton();
                renderDictNotes();
                if (!bookLoaded) bookRequest().then(refreshSaveButton).catch(() => {});
                const id = ++dictSeq;
                const rect = selection.getRangeAt(0).getBoundingClientRect();
                dict.querySelector('strong').textContent = term;
                dictBody.replaceChildren();
                const pending = document.createElement('p');
                pending.textContent = '查询中…';
                dictBody.append(pending);
                placeDict(rect);
                try {
                    const service = await dictionary();
                    if (id !== dictSeq) return;
                    fillDict(service.lookup(term));
                    placeDict(rect);
                } catch (error) {
                    if (id !== dictSeq) return;
                    dictBody.replaceChildren();
                    const fail = document.createElement('p');
                    fail.textContent = error.message;
                    dictBody.append(fail);
                }
            }, 180);
        });
        document.addEventListener('mousedown', (event) => {
            if (!dict.hidden && !dict.contains(event.target)) dict.hidden = true;
        });

        buildScript();
        bookRequest().then(paintVocab).catch(() => {});
        noteRequest().catch(() => {});
        update();
    }

    g.ListeningIntensive = { extract, start };
})(window);
