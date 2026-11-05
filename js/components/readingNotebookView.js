(function initReadingNotebookView(global) {
    'use strict';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        if (!value) return '未记录来源';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '未记录来源';
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date);
    }

    function speakWord(word) {
        if (!word || !global.speechSynthesis || typeof global.SpeechSynthesisUtterance !== 'function') return;
        try {
            global.speechSynthesis.cancel();
            const utterance = new global.SpeechSynthesisUtterance(word);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            global.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn('[ReadingNotebookView] 发音朗读异常:', error);
        }
    }

    function crc32(bytes) {
        let crc = -1;
        for (let i = 0; i < bytes.length; i += 1) {
            crc ^= bytes[i];
            for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
        return (~crc) >>> 0;
    }

    function zipStore(files) {
        const encoder = new TextEncoder();
        const locals = [];
        const central = [];
        let offset = 0;
        files.forEach(file => {
            const name = encoder.encode(file.name);
            const data = encoder.encode(file.data);
            const crc = crc32(data);
            const local = new Uint8Array(30 + name.length);
            const view = new DataView(local.buffer);
            view.setUint32(0, 0x04034b50, true);
            view.setUint16(4, 20, true);
            view.setUint32(14, crc, true);
            view.setUint32(18, data.length, true);
            view.setUint32(22, data.length, true);
            view.setUint16(26, name.length, true);
            local.set(name, 30);
            locals.push(local, data);
            const record = new Uint8Array(46 + name.length);
            const recordView = new DataView(record.buffer);
            recordView.setUint32(0, 0x02014b50, true);
            recordView.setUint16(4, 20, true);
            recordView.setUint16(6, 20, true);
            recordView.setUint32(16, crc, true);
            recordView.setUint32(20, data.length, true);
            recordView.setUint32(24, data.length, true);
            recordView.setUint16(28, name.length, true);
            recordView.setUint32(42, offset, true);
            record.set(name, 46);
            central.push(record);
            offset += local.length + data.length;
        });
        const centralSize = central.reduce((sum, part) => sum + part.length, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, offset, true);
        return new Blob([...locals, ...central, end], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    }

    function xmlText(value) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function worksheet(rows) {
        const body = rows.map((row, index) => {
            const cells = row.map((value, column) => {
                const ref = columnName(column) + (index + 1);
                return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
            }).join('');
            return `<row r="${index + 1}">${cells}</row>`;
        }).join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
    }

    function columnName(index) {
        let name = '';
        let n = index + 1;
        while (n) {
            name = String.fromCharCode(64 + (n % 26 || 26)) + name;
            n = Math.floor((n - 1) / 26);
        }
        return name;
    }

    function workbookBlob(rows) {
        return zipStore([
            { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
            { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
            { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="生词本" sheetId="1" r:id="rId1"/></sheets></workbook>` },
            { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
            { name: 'xl/worksheets/sheet1.xml', data: worksheet(rows) }
        ]);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        try { link.click(); } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        }
    }

    const ReadingNotebookView = {
        containerSelector: '#reading-notebook-root',
        state: {
            fromView: 'bookshelf',
            searchQuery: '',
            sortBy: 'recent',
            tab: 'reading',
            listeningWords: [],
            listeningError: null,
            visibleLimit: 100,
            loading: false,
            loaded: false,
            error: null,
            toastTimer: null
        },
        _loadSequence: 0,
        _returnFocus: null,

        open(options = {}) {
            this.state.fromView = options.fromView || global.app?.currentView || 'bookshelf';
            this._returnFocus = options.returnFocus || global.document?.activeElement || null;
            if (global.app && typeof global.app.navigateToView === 'function') {
                global.app.navigateToView('reading-notebook');
            } else {
                this.activateFallbackView();
            }
            return this.mount('#reading-notebook-view', options);
        },

        activateFallbackView() {
            const target = global.document?.getElementById('reading-notebook-view');
            if (!target) return;
            global.document.querySelectorAll('.view').forEach(view => {
                view.classList.remove('active');
                view.setAttribute('hidden', '');
            });
            target.classList.add('active');
            target.removeAttribute('hidden');
            if (global.document.body) global.document.body.classList.add('reading-notebook-open');
        },

        async mount(targetSelector = '#reading-notebook-view', options = {}) {
            if (options.fromView) this.state.fromView = options.fromView;
            const view = global.document?.querySelector(targetSelector);
            if (!view) return;

            let root = view.querySelector(this.containerSelector);
            if (!root) {
                root = global.document.createElement('div');
                root.id = 'reading-notebook-root';
                root.className = 'reading-notebook-view-shell';
                view.appendChild(root);
            }

            this.render();
            if ((this.state.loaded || this.state.loading) && !options.forceReload) return;
            return this.load();
        },

        async load() {
            const sequence = ++this._loadSequence;
            this.state.loading = true;
            this.state.error = null;
            this.render();
            try {
                if (global.AppData?.ready) await global.AppData.ready;
                if (!global.ReadingVocabStore && global.AppLazyLoader?.ensureGroup) await global.AppLazyLoader.ensureGroup('reading-tools');
                if (!global.ReadingVocabStore?.init) throw Error('精读生词本尚未就绪');
                await global.ReadingVocabStore.init();
            } catch (error) { this.state.error = error; }
            try {
                this.state.listeningWords = await this.listeningRequest();
                this.state.listeningError = null;
            } catch (error) { this.state.listeningError = error; }
            if (sequence !== this._loadSequence) return;
            this.state.loaded = true;
            this.state.loading = false;
            this.render();
            this.warmDictionary();
        },

        async warmDictionary() {
            if (this._dictionary) return;
            try {
                await this.ensureDictionary();
                const view = global.document?.getElementById('reading-notebook-view');
                if (view?.classList.contains('active')) this.render();
            } catch (_) {}
        },

        async ensureDictionary() {
            if (this._dictionary) return this._dictionary;
            if (!global.ensureReadingDictionary) {
                this._dictionaryLoaderPromise ||= new Promise((resolve, reject) => {
                    const script = global.document.createElement('script');
                    script.src = '/js/runtime/dictionaryLoader.js?v=' + encodeURIComponent(global.IELTS_ASSET_VERSION || 'notebook');
                    script.onload = resolve;
                    script.onerror = () => { this._dictionaryLoaderPromise = null; reject(Error('词典加载失败')); };
                    global.document.head.append(script);
                });
                await this._dictionaryLoaderPromise;
            }
            this._dictionary = await global.ensureReadingDictionary();
            return this._dictionary;
        },

        dictionaryFields(word) {
            const empty = { phonetic: '', pos: '', zh: '', en: '', example: '' };
            if (!this._dictionary || !word) return empty;
            let result;
            try { result = this._dictionary.lookup(word); } catch (_) { return empty; }
            if (!result?.found) return empty;
            const parts = result.parts?.length ? result.parts : [result];
            const join = key => parts.map(part => part?.[key]).filter(Boolean).join('；');
            return {
                phonetic: parts.map(part => part?.phonetic).filter(Boolean)[0] || result.phonetic || '',
                pos: join('pos'), zh: join('zh'), en: join('en'), example: join('example')
            };
        },

        async listeningRequest(action, payload = {}) {
            const status = await fetch('/api/status', { credentials: 'same-origin' }).then(response => response.json());
            const id = status.user?.id;
            if (!id) throw new Error('请先登录');
            const response = await fetch('/api/listening-vocabulary', {
                credentials: 'same-origin', method: action ? 'POST' : 'GET',
                headers: { 'X-IELTS-User': id, ...(action ? { 'Content-Type': 'application/json' } : {}) },
                ...(action ? { body: JSON.stringify({ action, ...payload }) } : {})
            });
            if (!response.ok) throw new Error('听力生词读取失败，请重试');
            const data = await response.json();
            return Array.isArray(data.words) ? data.words : [];
        },

        getListeningEntries() {
            const query = String(this.state.searchQuery || '').trim().toLowerCase();
            const entries = (this.state.listeningWords || []).filter(item => !query ||
                [item.word, item.title, item.context, this.dictionaryFields(item.word).zh].join(' ').toLowerCase().includes(query));
            return [...entries].sort((a, b) => this.state.sortBy === 'az'
                ? a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })
                : String(b.created_at || '').localeCompare(String(a.created_at || '')) || a.word.localeCompare(b.word, 'en'));
        },

        getAssociatedArticleMetadata(item) {
            const articles = Array.isArray(global.ReadingVocabStore?._state?.snapshot?.reading?.articles)
                ? global.ReadingVocabStore._state.snapshot.reading.articles : [];
            if (this._articleRows !== articles) {
                this._articleRows = articles;
                this._articlesById = new Map(articles
                    .filter(article => article && typeof article === 'object' && article.id)
                    .map(article => [article.id, article]));
            }
            const articlesById = this._articlesById;
            const metadata = [];
            const byId = new Map();
            const byExamId = new Map();

            const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
            const add = (candidate = {}) => {
                const id = firstText(candidate.id, candidate.articleId);
                const examId = firstText(candidate.examId);
                const title = firstText(candidate.title, candidate.examTitle, examId);
                if (!id && !examId && !title) return;
                const existing = id ? byId.get(id) : (examId && byExamId.get(examId));
                if (existing) {
                    if (!existing.examId && examId) existing.examId = examId;
                    if ((!existing.title || existing.title === existing.examId) && title) existing.title = title;
                    existing.searchValues.push(...candidate.searchValues);
                    return existing;
                }
                const row = { id, examId, title, searchValues: [...candidate.searchValues] };
                metadata.push(row);
                if (id) byId.set(id, row);
                if (examId) {
                    if (!byExamId.has(examId)) byExamId.set(examId, row);
                    else if (byExamId.get(examId) !== row) byExamId.set(examId, null);
                }
                return row;
            };

            (item.associations || []).forEach(association => {
                const embedded = association?.article || association?.articleMetadata
                    || association?.metadata?.article || {};
                const article = articlesById.get(association?.articleId) || embedded;
                const articleMetadata = article?.metadata || {};
                add({
                    id: article?.id || association?.articleId,
                    examId: article?.examId || articleMetadata.examId || association?.examId
                        || association?.metadata?.examId || embedded.examId,
                    title: article?.title || article?.examTitle || articleMetadata.examTitle
                        || articleMetadata.title || association?.examTitle || association?.title,
                    searchValues: [
                        association?.examId, association?.examTitle, association?.title,
                        association?.metadata?.examId, association?.metadata?.examTitle,
                        article?.id, article?.examId, article?.title, article?.sourceId,
                        articleMetadata.examId, articleMetadata.examTitle, articleMetadata.title,
                        ...(article?.contentRefs || []), ...(embedded.contentRefs || [])
                    ].filter(Boolean)
                });
            });

            // Keep compatibility with older projections that supplied only the
            // canonical article or occurrence owner on the entry itself.
            add({
                id: item.articleId,
                examId: item.examId,
                title: item.examTitle,
                searchValues: [item.examId, item.examTitle].filter(Boolean)
            });
            (item.highlights || []).forEach(row => add({
                id: row.articleId,
                examId: row.examId,
                title: row.examTitle || row.title,
                searchValues: [row.examId, row.examTitle, row.title, row.text].filter(Boolean)
            }));
            return metadata;
        },

        getEntries() {
            const entries = global.ReadingVocabStore?.getAll?.() || [];
            const query = String(this.state.searchQuery || '').trim().toLowerCase();
            const matching = !query ? entries : entries.filter(item => {
                // Associations are the authoritative many-to-many links. A word
                // can have a secondary/manual article association without an
                // occurrence, so occurrence-derived titles are not sufficient
                // for notebook search. The normalized projection keeps only the
                // article id on each association; resolve that id back to the
                // article metadata when indexing the search text.
                const associationText = this.getAssociatedArticleMetadata(item)
                    .flatMap(article => article.searchValues);
                const sourceText = [item.examTitle, item.examId, item.context,
                    ...associationText,
                    ...(item.highlights || []).map(row => row.text || '')].join(' ').toLowerCase();
                return [item.word, sourceText, this.dictionaryFields(item.word).zh].join(' ').toLowerCase().includes(query);
            });
            const latest = item => (item.associations || []).reduce((value, row) =>
                row.updatedAt && row.updatedAt > value ? row.updatedAt : value, '');
            return [...matching].sort((a, b) => this.state.sortBy === 'az'
                ? a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })
                : latest(b).localeCompare(latest(a)) || a.word.localeCompare(b.word, 'en'));
        },

        getStats() {
            const all = global.ReadingVocabStore?.getAll?.() || [];
            const articleIds = new Set();
            let latest = null;
            all.forEach(item => {
                (item.associations || []).forEach(row => {
                    if (row.articleId) articleIds.add(row.articleId);
                    if (row.updatedAt && (!latest || row.updatedAt > latest)) latest = row.updatedAt;
                });
            });
            return { words: all.length, articles: articleIds.size, latest };
        },

        render() {
            const root = global.document?.querySelector(this.containerSelector);
            if (!root) return;
            const listening = this.state.tab === 'listening';
            const stats = listening ? {
                words: new Set(this.state.listeningWords.map(item => item.word.toLowerCase())).size,
                articles: new Set(this.state.listeningWords.map(item => item.source)).size,
                latest: this.state.listeningWords.reduce((value, item) => item.created_at > value ? item.created_at : value, '')
            } : this.getStats();
            const entries = listening ? this.getListeningEntries() : this.getEntries();
            const hasData = this.state.loaded && !this.state.error;
            const disabled = !hasData || stats.words === 0 ? 'disabled' : '';

            root.innerHTML = `
                <div class="reading-notebook-layout">
                    <header class="reading-notebook-topbar">
                        <div class="reading-notebook-heading">
                            <button type="button" class="shui-glass-btn reading-notebook-back-btn" data-action="notebook-back" title="返回">
                                <span aria-hidden="true">←</span><span>返回</span>
                            </button>
                            <div>
                                <h2 class="reading-notebook-title">我的生词本</h2>
                                <p class="reading-notebook-subtitle">${stats.words} 个词 · ${stats.articles} 篇 · 最近 ${escapeHtml(formatDate(stats.latest))}</p>
                            </div>
                        </div>
                        <div class="reading-notebook-actions">
                            <button type="button" class="shui-glass-btn" data-action="notebook-export" ${disabled}>导出表格</button>
                            <button type="button" class="shui-glass-btn reading-notebook-danger-btn" data-action="notebook-clear" ${listening ? 'hidden' : ''} ${disabled}>清空</button>
                        </div>
                    </header>
                    ${this.state.loading ? '<p class="reading-notebook-status" role="status">正在加载生词本…</p>' : ''}
                    ${!listening && this.state.error ? `
                        <div class="reading-notebook-status reading-notebook-status--error" role="alert">
                            <span>生词本加载失败，请重试。</span>
                            <button type="button" class="shui-glass-btn" data-action="notebook-retry">重试</button>
                        </div>
                    ` : ''}
                    ${listening && this.state.listeningError ? '<p class="reading-notebook-status" role="alert">精听生词暂时无法加载。 <button type="button" class="shui-glass-btn" data-action="notebook-retry">重试</button></p>' : ''}
                    <section class="reading-notebook-surface">
                        <div class="reading-notebook-toolbar">
                            <div class="shui-segmented-control reading-notebook-tabs" role="tablist" aria-label="生词来源">
                                <button type="button" class="shui-segmented-btn" role="tab" data-action="notebook-tab" data-tab="reading" aria-pressed="${!listening}">精读</button>
                                <button type="button" class="shui-segmented-btn" role="tab" data-action="notebook-tab" data-tab="listening" aria-pressed="${listening}">精听</button>
                            </div>
                            <label class="reading-notebook-search">
                                <input type="search" data-action="notebook-search" value="${escapeHtml(this.state.searchQuery)}" placeholder="搜索单词、释义或篇目" aria-label="搜索生词本" />
                            </label>
                            <select data-action="notebook-sort" aria-label="生词排序"><option value="recent" ${this.state.sortBy === 'recent' ? 'selected' : ''}>最近收录</option><option value="az" ${this.state.sortBy === 'az' ? 'selected' : ''}>A–Z</option></select>
                        </div>
                        <div class="reading-notebook-list">
                            ${entries.length ? '<div class="nb-head"><span>单词</span><span>释义</span><span>来源</span><span></span></div>' : ''}
                            ${listening ? this.renderListeningEntries(entries) : this.renderEntries(entries, hasData)}
                        </div>
                    </section>
                </div>
                <div id="reading-notebook-toast" class="reading-notebook-toast" role="status" aria-live="polite"></div>
            `;
            this.bindEvents(root);
        },

        renderEntries(entries, hasData) {
            if (!hasData) return '';
            if (!entries.length) {
                return `
                    <div class="reading-notebook-empty">
                        <div class="reading-notebook-empty__icon">📝</div>
                        <h3>${this.state.searchQuery ? '没有匹配的生词' : '生词本还是空的'}</h3>
                        <p>${this.state.searchQuery ? '换一个关键词试试。' : '在阅读文章或题目中划选单词，就会出现在这里。'}</p>
                    </div>
                `;
            }
            const limit = this.state.visibleLimit || 100;
            return entries.slice(0, limit).map(item => {
                const sources = this.getAssociatedArticleMetadata(item)
                    .map(article => article.title)
                    .filter(Boolean);
                const sourceList = sources.slice(0, 3);
                const extraSources = Math.max(0, sources.length - sourceList.length);
                const gloss = this.dictionaryFields(item.word).zh;
                return `
                    <article class="reading-notebook-entry" data-word-id="${escapeHtml(item.id)}">
                        <div class="nb-word">
                            <h3>${escapeHtml(item.word)}</h3>
                            <button type="button" class="nb-icon" data-action="notebook-speak" data-word="${escapeHtml(item.word)}" title="朗读 ${escapeHtml(item.word)}" aria-label="朗读 ${escapeHtml(item.word)}">读</button>
                        </div>
                        <button type="button" class="nb-gloss" data-action="notebook-definition" data-word="${escapeHtml(item.word)}">${escapeHtml(gloss || item.context || '查看词典')}</button>
                        <div class="reading-notebook-entry__meta">
                            ${sourceList.map(source => `<span>${escapeHtml(source)}</span>`).join('')}
                            ${extraSources ? `<span>+${extraSources} 篇</span>` : ''}
                        </div>
                        <button type="button" class="nb-icon nb-icon--danger" data-action="notebook-delete" data-word-id="${escapeHtml(item.id)}" title="从我的生词本移除">移除</button>
                        <div class="notebook-definition" hidden></div>
                    </article>
                `;
            }).join('') + (entries.length > limit
                ? `<button type="button" class="shui-glass-btn" data-action="notebook-load-more">继续显示（已显示 ${limit} / ${entries.length}）</button>` : '');
        },

        renderListeningEntries(entries) {
            if (!entries.length) return '<div class="reading-notebook-empty"><h3>暂无精听生词</h3><p>在精听原文中划词，查看释义后点击“收录到生词本”。</p></div>';
            const limit = this.state.visibleLimit || 100;
            return entries.slice(0, limit).map(item => {
                const gloss = this.dictionaryFields(item.word).zh;
                return `
                <article class="reading-notebook-entry" data-source="${escapeHtml(item.source)}" data-word="${escapeHtml(item.word)}">
                    <div class="nb-word">
                        <h3>${escapeHtml(item.word)}</h3>
                        <button type="button" class="nb-icon" data-action="notebook-speak" data-word="${escapeHtml(item.word)}" aria-label="朗读 ${escapeHtml(item.word)}">读</button>
                    </div>
                    <button type="button" class="nb-gloss" data-action="notebook-definition" data-word="${escapeHtml(item.word)}">${escapeHtml(gloss || item.context || '查看词典')}</button>
                    <div class="reading-notebook-entry__meta"><span>${escapeHtml(item.title || '听力原文')}</span></div>
                    <button type="button" class="nb-icon nb-icon--danger" data-action="notebook-listening-delete">移除</button>
                    <div class="notebook-definition" hidden></div>
                </article>`;
            }).join('') + (entries.length > limit
                    ? `<button type="button" class="shui-glass-btn" data-action="notebook-load-more">继续显示（已显示 ${limit} / ${entries.length}）</button>` : '');
        },

        async showDefinition(button) {
            const target = button?.closest('.reading-notebook-entry')?.querySelector('.notebook-definition');
            if (!target) return;
            const label = button.textContent;
            if (!target.hidden) { target.hidden = true; button.textContent = label === '收起' ? (button.dataset.gloss || '查看词典') : label; return; }
            button.disabled = true; target.hidden = false; target.textContent = '正在加载本地词典…';
            try {
                const result = (await this.ensureDictionary()).lookup(button.dataset.word);
                target.replaceChildren();
                if (!result.found) { target.textContent = '本地词典暂未收录这个词。'; return; }
                (result.parts?.length ? result.parts : [result]).forEach(part => {
                    const section = global.document.createElement('section');
                    const heading = global.document.createElement('strong');
                    heading.textContent = [part.term || result.term || button.dataset.word, part.phonetic ? '/' + part.phonetic + '/' : '', part.pos || ''].filter(Boolean).join(' · ');
                    section.append(heading);
                    for (const value of [part.zh, part.en, part.example]) if (value) {
                        const p = global.document.createElement('p'); p.textContent = value; section.append(p);
                    }
                    target.append(section);
                });
            } catch (_) { target.textContent = '词典加载失败，请关闭后重试。'; }
            finally { button.disabled = false; if (!target.hidden) { button.dataset.gloss = label; button.textContent = '收起'; } }
        },

        bindEvents(root) {
            root.querySelector('[data-action="notebook-sort"]')?.addEventListener('change', event => {
                this.state.sortBy = event.target.value === 'az' ? 'az' : 'recent';
                this.state.visibleLimit = 100;
                this.render();
            });
            const search = root.querySelector('[data-action="notebook-search"]');
            if (search) {
                search.addEventListener('input', event => {
                    this.state.searchQuery = event.target.value;
                    this.state.visibleLimit = 100;
                    this.render();
                    const next = global.document.querySelector('[data-action="notebook-search"]');
                    if (next) {
                        next.focus();
                        next.setSelectionRange(next.value.length, next.value.length);
                    }
                });
            }
            root.onclick = async event => {
                const action = event.target.closest?.('[data-action]')?.dataset.action;
                if (!action) return;
                if (action === 'notebook-tab') {
                    this.state.tab = event.target.closest('[data-action="notebook-tab"]').dataset.tab === 'listening' ? 'listening' : 'reading';
                    this.state.searchQuery = '';
                    this.state.visibleLimit = 100;
                    this.render();
                    return;
                }
                if (action === 'notebook-definition') {
                    await this.showDefinition(event.target.closest('[data-action="notebook-definition"]'));
                    return;
                }
                if (action === 'notebook-listening-delete') {
                    const button = event.target.closest('[data-action="notebook-listening-delete"]');
                    const entry = button.closest('.reading-notebook-entry');
                    button.disabled = true; button.textContent = '移除中…';
                    try {
                        this.state.listeningWords = await this.listeningRequest('remove', { word: entry.dataset.word, source: entry.dataset.source });
                        this.render(); this.showToast('已移除听力生词');
                    } catch (_) { button.disabled = false; button.textContent = '重试移除'; this.showToast('移除失败，请重试'); }
                    return;
                }
                if (action === 'notebook-load-more') {
                    this.state.visibleLimit = (this.state.visibleLimit || 100) + 100;
                    this.render();
                    return;
                }
                if (action === 'notebook-back') {
                    this.goBack();
                    return;
                }
                if (action === 'notebook-retry') {
                    await this.load();
                    return;
                }
                if (action === 'notebook-speak') {
                    speakWord(event.target.closest('[data-action="notebook-speak"]').dataset.word);
                    return;
                }
                if (action === 'notebook-export') {
                    await this.exportAll(event.target.closest('[data-action="notebook-export"]'));
                    return;
                }
                if (action === 'notebook-clear') {
                    await this.clearAll(event.target.closest('[data-action="notebook-clear"]'));
                    return;
                }
                if (action === 'notebook-delete') {
                    await this.deleteWord(event.target.closest('[data-action="notebook-delete"]'));
                }
            };
        },

        async exportAll(button) {
            if (!button || button.disabled) return;
            const listening = this.state.tab === 'listening';
            const entries = listening ? this.getListeningEntries() : this.getEntries();
            if (!entries.length) { this.showToast('暂无生词可导出'); return; }
            const original = button.textContent;
            button.disabled = true;
            button.textContent = '正在导出…';
            try {
                await this.ensureDictionary();
                const header = ['单词', '音标', '词性', '中文释义', '英文释义', '例句', '来源', '语境', '收录日期'];
                const rows = entries.map(item => {
                    const fields = this.dictionaryFields(item.word);
                    const sources = listening
                        ? [item.title || '听力原文']
                        : this.getAssociatedArticleMetadata(item).map(article => article.title).filter(Boolean);
                    const latest = listening ? item.created_at : (item.associations || []).reduce((value, row) =>
                        row.updatedAt && row.updatedAt > value ? row.updatedAt : value, '');
                    return [item.word, fields.phonetic, fields.pos, fields.zh, fields.en, fields.example,
                        sources.join('、'), item.context || '', latest ? formatDate(latest) : ''];
                });
                const today = new Date();
                const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                downloadBlob(workbookBlob([header, ...rows]), `生词本-${listening ? '精听' : '精读'}-${stamp}.xlsx`);
                this.showToast(`已导出 ${entries.length} 个生词`);
            } catch (_) {
                this.showToast('导出失败，请重试');
            } finally {
                button.disabled = false;
                button.textContent = original;
            }
        },

        async clearAll(button) {
            if (!button || button.disabled || !global.ReadingVocabStore) return;
            if (!(global.ReadingVocabStore.getAll?.() || []).length) {
                this.showToast('生词本已经是空的了');
                return;
            }
            button.disabled = true;
            try {
                await global.ReadingVocabStore.clear();
                this.showToast('全部生词已清空');
            } catch (error) {
                this.showToast(error?.code === 'BACKEND_UNAVAILABLE' ? '存储暂不可用，请刷新页面后重试' : '清空失败，请重试');
            } finally {
                button.disabled = false;
            }
        },

        async deleteWord(button) {
            if (!button || button.disabled || !global.ReadingVocabStore) return;
            const id = button.dataset.wordId;
            button.disabled = true;
            try {
                await global.ReadingVocabStore.remove(id);
                this.showToast('已从我的生词本移除');
            } catch (error) {
                this.showToast(error?.code === 'BACKEND_UNAVAILABLE' ? '存储暂不可用，请刷新页面后重试' : '移除失败，请重试');
                button.disabled = false;
            }
        },

        showToast(message) {
            const toast = global.document?.getElementById('reading-notebook-toast');
            if (!toast) return;
            toast.textContent = message;
            toast.classList.add('is-visible');
            clearTimeout(this.state.toastTimer);
            this.state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
        },

        goBack() {
            const target = this.state.fromView && this.state.fromView !== 'reading-notebook'
                ? this.state.fromView : 'bookshelf';
            if (global.app && typeof global.app.navigateToView === 'function') {
                global.app.navigateToView(target);
            } else {
                const targetView = global.document?.getElementById(`${target}-view`);
                const currentView = global.document?.getElementById('reading-notebook-view');
                currentView?.classList.remove('active');
                currentView?.setAttribute('hidden', '');
                targetView?.classList.add('active');
                targetView?.removeAttribute('hidden');
            }
            const focusTarget = target === 'bookshelf'
                ? global.document?.querySelector('#bookshelf-view [data-action="open-global-notebook"]')
                : this._returnFocus;
            if (focusTarget?.isConnected) setTimeout(() => focusTarget.focus({ preventScroll: true }), 0);
        }
    };

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('reading-vocab-store-updated', () => {
            const view = global.document?.getElementById('reading-notebook-view');
            if (view?.classList.contains('active')) {
                ReadingNotebookView.state.loaded = true;
                ReadingNotebookView.render();
            }
        });
        global.addEventListener('keydown', event => {
            const view = global.document?.getElementById('reading-notebook-view');
            if (event.key === 'Escape' && view?.classList.contains('active')) {
                event.preventDefault();
                ReadingNotebookView.goBack();
            }
        });
    }

    global.ReadingNotebookView = ReadingNotebookView;
})(typeof window !== 'undefined' ? window : globalThis);
