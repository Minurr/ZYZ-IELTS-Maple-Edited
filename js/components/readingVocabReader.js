(function initReadingVocabReader(global) {
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

    const DEFAULT_SOURCE = { kind: 'builtin', id: 'default' };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function recordBookshelfExamDirect(examId, examTitle = '', category = '', source = DEFAULT_SOURCE, contentRef = null) {
        if (!examId) return;
        return ReadingVocabStore.mutate('recordVisit', {
            source, article: { examId: String(examId), title: examTitle, category, ...(contentRef ? { contentRef } : {}) },
            at: new Date().toISOString()
        });
    }

    // This cache is a view of acknowledged AppData state, never a storage authority.
    const ReadingVocabStore = {
        _state: null,
        _commitBound: false,
        _loadSequence: 0,
        _projectionSnapshot: null,
        _projections: new Map(),

        async resolveSource(options = {}) {
            if (options.source) return { ...options.source };
            const id = Object.prototype.hasOwnProperty.call(options, 'libraryConfigurationId')
                ? options.libraryConfigurationId
                : await global.AppData.library.getActive();
            return id == null || id === '' ? { ...DEFAULT_SOURCE } : { kind: 'imported', id: String(id) };
        },

        getAll() { return this.project(); },

        project(articleId = null) {
            if (!this._state) return [];
            const snapshot = this._state.snapshot;
            if (this._projectionSnapshot !== snapshot) {
                this._projectionSnapshot = snapshot;
                this._projections.clear();
            }
            if (this._projections.has(articleId)) return JSON.parse(JSON.stringify(this._projections.get(articleId)));
            const model = global.AppData.vocab.readingModel;
            const articles = new Map(snapshot.reading.articles.map(row => [row.id, row]));
            const result = model.query(snapshot, articleId ? { articleId } : {}).terms.map(entry => {
                const associations = entry.associations;
                const byAssociation = new Map(associations.map(row => [row.id, row]));
                const article = articles.get(associations[0]?.articleId);
                return {
                    ...entry.word, id: entry.term.id, word: entry.word.word,
                    examId: article?.examId || '', examTitle: article?.title || '',
                    context: entry.word.example || entry.word.context || '',
                    associations, occurrences: entry.occurrences,
                    highlights: entry.occurrences.map(occurrence => {
                        const relation = byAssociation.get(occurrence.associationId);
                        const owner = articles.get(relation?.articleId);
                        return { ...occurrence, examId: owner?.examId, scope: occurrence.scopeId, text: occurrence.quote };
                    })
                };
            });
            // Keep only the current article and the global notebook projection.
            if (this._projections.size >= 2) this._projections.clear();
            this._projections.set(articleId, result);
            return JSON.parse(JSON.stringify(result));
        },

        getByExam(examId, source = DEFAULT_SOURCE) {
            if (!examId || !this._state) return [];
            return this.project(global.AppData.vocab.readingModel.articleId(source, String(examId)));
        },

        getOccurrenceOwner(occurrence) {
            const reading = this._state?.snapshot.reading;
            if (this._ownerReading !== reading) {
                this._ownerReading = reading;
                this._ownerAssociations = new Map((reading?.associations || []).map(row => [row.id, row]));
                this._ownerArticles = new Map((reading?.articles || []).map(row => [row.id, row]));
                this._ownerSources = new Map((reading?.sources || []).map(row => [row.id, row]));
            }
            const association = this._ownerAssociations?.get(occurrence.associationId);
            const article = this._ownerArticles?.get(association?.articleId);
            const source = this._ownerSources?.get(article?.sourceId);
            if (!article || !source) return null;
            return { articleId: article.id,
                contentAmbiguous: (article.contentRefs || []).length > 1,
                source: { kind: source.kind, id: source.libraryId },
                article: { examId: article.examId, title: article.title,
                    ...(article.contentRefs?.length === 1 ? { contentRef: article.contentRefs[0] } : {}) } };
        },

        adopt(state) {
            if (this._state?.generation === state.generation && this._state.revision > state.revision) return;
            this._state = state;
            if (typeof global.dispatchEvent === 'function') {
                global.dispatchEvent(new CustomEvent('reading-vocab-store-updated'));
            }
        },

        async reload() {
            const sequence = ++this._loadSequence;
            await global.AppData.ready;
            const state = await global.AppData.vocab.getReadingSnapshot();
            if (sequence === this._loadSequence) this.adopt(state);
            return state;
        },

        async mutate(type, command, observedState = null) {
            if (!this._state) await this.init();
            const observed = observedState || this._state;
            let result;
            try {
                result = await global.AppData.vocab.mutateReading(type, command, {
                    observedRevision: observed.revision, observedGeneration: observed.generation
                });
            } catch (error) {
                // The next explicit retry must use the new deletion/replace fence.
                await this.reload().catch(() => {});
                throw error;
            }
            if (!result || result.saved !== true) throw new Error('Reading save was not acknowledged');
            ++this._loadSequence;
            this.adopt(result);
            return result;
        },

        // Compatibility flush methods only read authoritative state.
        async syncToAppData() { return this.reload(); },
        async flushToAppData() { return this.reload(); },

        async add(rawWord, examId, examTitle, context = '', highlight = null, source = DEFAULT_SOURCE, contentRef = null) {
            const word = this.cleanWord(rawWord);
            if (!word || word.length > 50) return { added: false, reason: 'invalid_word' };
            if (!this._state) await this.init();
            const duplicate = this.getByExam(examId, source).some(item => item.word.toLowerCase() === word.toLowerCase());
            const occurrence = highlight ? {
                scopeId: highlight.scopeId || highlight.scope,
                contentVersion: highlight.contentVersion || 'legacy-reader-v1',
                startOffset: highlight.startOffset, endOffset: highlight.endOffset,
                quote: highlight.quote || highlight.text || word, before: highlight.before || '', after: highlight.after || ''
            } : undefined;
            const dictionaryEntry = global.DictionaryService?.lookup(word);
            const meaning = dictionaryEntry?.found ? (dictionaryEntry.zh || dictionaryEntry.en || dictionaryEntry.parts?.map(part => `${part.term}: ${part.zh || part.en || ''}`).join('; ')) : '';
            const result = await this.mutate('collect', {
                source, article: { examId: String(examId), title: examTitle || '', ...(contentRef ? { contentRef } : {}) },
                word: { word, meaning: meaning || '待补充释义', example: String(context || '').trim().slice(0, 150) },
                ...(occurrence ? { occurrence } : { manual: true }),
                at: new Date().toISOString()
            });
            return { ...result, added: result.added !== false, isDuplicate: duplicate,
                item: this.getByExam(examId, source).find(item => item.word.toLowerCase() === word.toLowerCase()) };
        },

        async remove(wordOrId, examId = null, source = DEFAULT_SOURCE) {
            if (!this._state) await this.init();
            const target = String(wordOrId).trim().toLowerCase();
            const item = this.getAll().find(row => row.id === wordOrId || row.word.toLowerCase() === target);
            if (!item) return false;
            await this.mutate(examId ? 'removeArticleTerm' : 'removeTermAssociations', {
                termId: item.id,
                ...(examId ? { articleId: global.AppData.vocab.readingModel.articleId(source, String(examId)) } : {})
            });
            return true;
        },

        async clear(examId = null, source = DEFAULT_SOURCE) {
            await this.mutate(examId ? 'clearArticle' : 'clearReading', examId
                ? { articleId: global.AppData.vocab.readingModel.articleId(source, String(examId)) } : {});
            return true;
        },


        cleanWord(str) {
            if (!str) return '';
            return str
                .replace(/^[\s"'“”‘’(（[<{《/\\#]+|[\s"'“”‘’）)\]>}》,.:;!?！？，。；：/\\#]+$/g, '')
                .trim();
        },

        async exportTxt(examId = null, customFilename = null, fallbackTitle = '', source = DEFAULT_SOURCE) {
            // A later background refresh can supersede this read's cache update
            // while still pending. Export the fetched durable snapshot itself.
            const { snapshot } = await this.init();
            const model = global.AppData.vocab.readingModel;
            const articleId = examId ? model.articleId(source, String(examId)) : null;
            const result = model.toPlainText(snapshot, articleId ? { articleId } : {});
            if (result.count === 0) return false;

            let filename = customFilename;
            if (!filename) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                const article = snapshot.reading.articles.find((row) => row.id === articleId);
                const rawTitle = fallbackTitle || article?.title || examId || '全部精读生词';
                const safeTitle = String(rawTitle).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
                filename = `${dateStr}_${safeTitle}.txt`;
            }

            const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            try {
                a.click();
            } finally {
                document.body.removeChild(a);
                // Let the browser start consuming the object URL before release.
                setTimeout(() => URL.revokeObjectURL(url), 0);
            }
            return { filename, count: result.count };
        },

        async init() {
            this.bindCommitListener();
            return this.reload();
        },

        bindCommitListener() {
            if (this._commitBound || !global.AppData?.backups?.onDataCommitted) return;
            this._commitBound = true;
            global.AppData.backups.onDataCommitted(event => {
                if (!event?.targets?.some(target => target.logicalKey?.startsWith('vocab.'))) return;
                this.reload().catch(error => {
                    console.warn('[ReadingVocabStore] Unable to refresh committed data:', error);
                    if (global.ReadingVocabReader?.currentExamId) {
                        global.ReadingVocabReader.showToast('数据刷新失败，请重新打开生词本重试');
                    }
                });
            });
        }
    };

    // ============================================================================
    // 语音朗读
    // ============================================================================
    function speakWord(word) {
        if (!('speechSynthesis' in window) || !word) {
            return;
        }
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('[ReadingVocabReader] 朗读失败:', e);
        }
    }

    // ============================================================================
    // 异步加载试卷与解析数据
    // ============================================================================
    function getExamRegistry() {
        const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global);
        if (!root.__READING_EXAM_DATA__ || typeof root.__READING_EXAM_DATA__.register !== 'function') {
            const store = new Map();
            function deepClone(value) {
                if (value == null) return value;
                return JSON.parse(JSON.stringify(value));
            }
            root.__READING_EXAM_DATA__ = {
                register(id, payload) {
                    if (!id || !payload || typeof payload !== 'object') {
                        throw new Error('reading_exam_payload_invalid');
                    }
                    store.set(String(id), deepClone(payload));
                },
                get(id) {
                    if (!id) return null;
                    return store.has(String(id)) ? deepClone(store.get(String(id))) : null;
                },
                has(id) {
                    return !!id && store.has(String(id));
                },
                keys() {
                    return Array.from(store.keys());
                },
                clear() {
                    store.clear();
                }
            };
        }
        return root.__READING_EXAM_DATA__;
    }

    function getExplanationRegistry() {
        const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global);
        if (!root.__READING_EXPLANATION_DATA__ || typeof root.__READING_EXPLANATION_DATA__.register !== 'function') {
            const store = new Map();
            function deepClone(value) {
                if (value == null) return value;
                return JSON.parse(JSON.stringify(value));
            }
            root.__READING_EXPLANATION_DATA__ = {
                register(id, payload) {
                    if (!id || !payload || typeof payload !== 'object') {
                        throw new Error('reading_explanation_payload_invalid');
                    }
                    store.set(String(id), deepClone(payload));
                },
                get(id) {
                    if (!id) return null;
                    return store.has(String(id)) ? deepClone(store.get(String(id))) : null;
                },
                has(id) {
                    return !!id && store.has(String(id));
                },
                keys() {
                    return Array.from(store.keys());
                },
                clear() {
                    store.clear();
                }
            };
        }
        return root.__READING_EXPLANATION_DATA__;
    }

    async function loadReadingExamPayload(examId) {
        if (!examId) return null;

        const examRegistry = getExamRegistry();
        const manifest = (typeof window !== 'undefined' && window.__READING_EXAM_MANIFEST__) || global.__READING_EXAM_MANIFEST__ || {};
        const entry = manifest[examId] || Object.values(manifest).find(e => e && (e.examId === examId || e.dataKey === examId || e.id === examId));

        // 1. 检查已注册数据
        if (examRegistry && typeof examRegistry.get === 'function') {
            const cached = examRegistry.get(examId) || (entry && (examRegistry.get(entry.dataKey) || examRegistry.get(entry.examId)));
            if (cached) return cached;
        }

        // 2. 检查 manifest
        if (!entry || !entry.script) {
            console.warn('[ReadingVocabReader] 未找到试卷元信息:', examId);
            return null;
        }

        const isExamPage = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/reading-exams/');
        let scriptSrc;
        if (isExamPage) {
            scriptSrc = entry.script.startsWith('./') ? entry.script : `./${entry.script}`;
        } else {
            scriptSrc = `assets/generated/reading-exams/${entry.script.replace(/^\.\//, '')}`;
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptSrc;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load reading exam: ' + scriptSrc));
            document.head.appendChild(script);
        });

        const registryAfterLoad = getExamRegistry();
        return registryAfterLoad.get(examId) || (entry && (registryAfterLoad.get(entry.dataKey) || registryAfterLoad.get(entry.examId))) || null;
    }

    function manifestEntryFor(examId) {
        const manifest = global.__READING_EXAM_MANIFEST__ || {};
        return manifest[examId] || Object.values(manifest).find(entry => entry &&
            [entry.examId, entry.id, entry.dataKey].some(id => String(id) === String(examId))) || null;
    }

    async function resolveReadingArticle(examId, source) {
        if (source.kind === 'builtin' && source.id === 'default') {
            return { exam: manifestEntryFor(examId) || {}, sourceLabel: '内置题库', generatedKey: examId };
        }
        if (source.kind !== 'imported') throw new Error('原题库来源不可用，已保存的生词仍可查看或导出');
        const [index, storedConfigurations] = await Promise.all([
            global.AppData.library.getIndex(source.id),
            global.AppData.library.listConfigurations()
        ]);
        const configurations = storedConfigurations.map(item => {
            const id = typeof item === 'string' ? item
                : [item?.id, item?.key, item?.configId].find(value => value != null && value !== '');
            return { ...(typeof item === 'object' && item ? item : {}), id: id == null ? '' : String(id) };
        }).filter(item => item.id);
        const configuration = configurations.find(item => item.id === source.id);
        const matches = index.filter(item => item && String(item.id || item.examId) === String(examId));
        const sourceLabel = `${configuration?.name || configuration?.title || '导入题库'} · ${source.id}`;
        if (!configuration || matches.length !== 1) {
            return { exam: null, sourceLabel };
        }
        const exam = matches[0];
        if (exam.sourceKind === 'file-picker' && exam.importKey) {
            // Session blobs predate library-scoped identities. When the same
            // import key exists in another library the blob cannot prove which
            // source it belongs to, so keep the saved vocabulary available only.
            const otherIndexes = await Promise.all(configurations
                .filter(item => item.id !== source.id)
                .map(item => global.AppData.library.getIndex(item.id)));
            if (otherIndexes.some(rows => rows.some(row => row?.sourceKind === 'file-picker' && row.importKey === exam.importKey))) {
                return { exam: null, sourceLabel, unavailableReason: '多个题库使用同名会话文件，无法确认原文来源；已保存的生词仍可查看或导出' };
            }
        }
        // Only an explicit generated-reading reference may use the built-in
        // registry. A coincidentally identical examId is never a content link.
        const generatedKey = exam.sourceKind === 'generated-reading' && exam.dataKey && manifestEntryFor(exam.dataKey)
            ? exam.dataKey : null;
        return { exam, sourceLabel, generatedKey };
    }

    async function loadImportedReadingPayload(exam) {
        let url = '';
        if (exam.sourceKind === 'file-picker') {
            // File-picker resources disappear when their session ends. Do not
            // fall back to another imported entry with the same examId.
            url = exam.importKey && global.LibraryDiscovery?.resolveRuntimeResource({ importKey: exam.importKey }, 'html');
        } else if (exam.filename) {
            const base = global.location.pathname.includes('/reading-exams/')
                ? new URL('../../../', global.location.href) : new URL('./', global.location.href);
            const filename = String(exam.filename).replace(/\\/g, '/');
            const path = String(exam.path || '').replace(/\\/g, '/');
            url = new URL(/^[a-z][a-z\d+.-]*:/i.test(filename) || filename.startsWith('/')
                ? filename : `${path.replace(/\/?$/, '/')}${filename}`.replace(/^\//, ''), base).href;
        }
        if (!url || !/^(?:https?:|file:|blob:)/i.test(url)) {
            throw new Error('原题库文件不可用，请重新载入原题库；已保存的生词仍可查看或导出');
        }
        const response = await global.fetch(url);
        if (!response.ok) throw new Error('原题库文件无法读取，已保存的生词仍可查看或导出');
        // Parse and sanitize before the content normalizer creates any regular
        // DOM nodes: even detached images can dispatch load/error handlers.
        const template = document.createElement('template');
        template.innerHTML = await response.text();
        const passage = template.content.querySelector('#passage, #reading-passage, .reading-passage, #left, .passage');
        const questions = template.content.querySelector('#questions, #question-panel, .questions-container, #right');
        if (!passage || !passage.textContent.trim()) {
            throw new Error('原题库文章结构已更改或不支持，已保存的生词仍可查看或导出');
        }
        const assetBase = response.url || url;
        return { meta: { title: exam.title || template.content.querySelector('title')?.textContent || '', category: exam.category },
            passage: { blocks: [{ html: sanitizeImportedReadingHtml(passage.innerHTML, assetBase, 'imported-passage') }] },
            questionGroups: questions ? [{ bodyHtml: sanitizeImportedReadingHtml(questions.innerHTML, assetBase, 'imported-questions') }] : [] };
    }

    function sanitizeImportedReadingHtml(html, baseUrl, namespace) {
        const template = document.createElement('template');
        template.content.appendChild(createReadOnlyQuestionContent(html, namespace));
        template.content.querySelectorAll('base, meta').forEach(node => node.remove());
        const resolveAsset = value => {
            try {
                const url = new URL(value, baseUrl);
                if (/^(?:https?:|file:|blob:)$/.test(url.protocol)
                    || (url.protocol === 'data:' && /^data:image\/(?:png|gif|jpe?g|webp|avif|svg\+xml)[;,]/i.test(url.href))) return url.href;
            } catch (_) {}
            return '';
        };
        const resolveSrcset = value => {
            const candidates = [];
            let remaining = value.trim();
            while (remaining) {
                remaining = remaining.replace(/^[\s,]+/, '');
                const match = remaining.match(/^\S+/);
                if (!match) break;
                const token = match[0];
                remaining = remaining.slice(token.length);
                let descriptor = '';
                if (!token.endsWith(',')) {
                    const end = remaining.indexOf(',');
                    descriptor = (end < 0 ? remaining : remaining.slice(0, end)).trim();
                    remaining = end < 0 ? '' : remaining.slice(end + 1);
                }
                const url = resolveAsset(token.replace(/,+$/, ''));
                if (url && (!descriptor || /^(?:\d+w|(?:\d+(?:\.\d+)?|\.\d+)x)$/.test(descriptor))) {
                    candidates.push(url + (descriptor ? ` ${descriptor}` : ''));
                }
            }
            return candidates.join(', ');
        };
        template.content.querySelectorAll('[src], [srcset], [poster]').forEach(node => {
            for (const name of ['src', 'srcset', 'poster']) {
                if (!node.hasAttribute(name)) continue;
                const value = name === 'srcset' ? resolveSrcset(node.getAttribute(name)) : resolveAsset(node.getAttribute(name));
                if (value) node.setAttribute(name, value);
                else node.removeAttribute(name);
            }
        });
        return template.innerHTML;
    }

    async function loadReadingExplanationPayload(examId) {
        if (!examId) return null;

        const expRegistry = getExplanationRegistry();
        const isExamPage = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/reading-exams/');

        // 确保 explanation manifest 存在
        if (!global.__READING_EXPLANATION_MANIFEST__ && !(typeof window !== 'undefined' && window.__READING_EXPLANATION_MANIFEST__)) {
            const manifestSrc = isExamPage ? '../reading-explanations/manifest.js' : 'assets/generated/reading-explanations/manifest.js';
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = manifestSrc;
                    script.onload = () => resolve();
                    script.onerror = () => resolve();
                    document.head.appendChild(script);
                });
            } catch (_) {}
        }

        const expManifest = (typeof window !== 'undefined' && window.__READING_EXPLANATION_MANIFEST__) || global.__READING_EXPLANATION_MANIFEST__ || {};
        const entry = expManifest[examId] || Object.values(expManifest).find(e => e && (e.examId === examId || e.dataKey === examId || e.id === examId));

        if (expRegistry && typeof expRegistry.get === 'function') {
            const cached = expRegistry.get(examId) || (entry && (expRegistry.get(entry.dataKey) || expRegistry.get(entry.examId)));
            if (cached) return cached;
        }

        if (!entry || !entry.script) {
            return null;
        }

        try {
            const cleanScript = entry.script.replace(/^(\.\/|\.\.\/reading-explanations\/)/, '');
            const scriptSrc = isExamPage
                ? `../reading-explanations/${cleanScript}`
                : `assets/generated/reading-explanations/${cleanScript}`;
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = scriptSrc;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load explanation'));
                document.head.appendChild(script);
            });
            const expRegistryAfterLoad = getExplanationRegistry();
            return expRegistryAfterLoad.get(examId) || (entry && (expRegistryAfterLoad.get(entry.dataKey) || expRegistryAfterLoad.get(entry.examId))) || null;
        } catch (e) {
            return null;
        }
    }

    // ============================================================================
    // 阅读文本与段落清洗器
    // ============================================================================
    // Content and Range rules are shared with the real-browser regression suite.
    function getTextNodes(root) { return global.ReadingVocabAnchors.textNodes(root); }

    // ============================================================================
    // Parse in an inert template: even a pre-checked radio must never join a
    // live practice answer group while the reader content is being prepared.
    function createReadOnlyQuestionContent(html, namespace, retainQuestionIds = false) {
        const template = document.createElement('template');
        template.innerHTML = html || '';
        const content = template.content;
        content.querySelectorAll('script, style, link, iframe, object, embed, template').forEach(node => node.remove());

        const questionIds = new Map();
        if (retainQuestionIds) content.querySelectorAll('*').forEach(node => {
            const value = node.getAttribute('name') || node.getAttribute('data-question-id') || node.getAttribute('data-id') || node.id || '';
            const match = value.match(/^q?(\d+)(?:[-_].*)?$/i);
            if (match) questionIds.set(node, 'q' + match[1]);
        });
        const identities = new Map();
        content.querySelectorAll('[id]').forEach((node, index) => {
            const originalId = node.id;
            node.id = `${namespace}-content-${index + 1}`;
            if (!identities.has(originalId)) identities.set(originalId, node.id);
        });

        content.querySelectorAll('*').forEach(node => {
            for (const attribute of [...node.attributes]) {
                const name = attribute.name.toLowerCase();
                if (name.startsWith('on') || name.startsWith('data-') || [
                    'name', 'form', 'for', 'list', 'href', 'xlink:href', 'action', 'formaction',
                    'contenteditable', 'draggable', 'tabindex', 'autofocus', 'accesskey', 'role',
                    'aria-controls', 'aria-activedescendant', 'aria-checked', 'aria-selected'
                ].includes(name)) {
                    node.removeAttribute(attribute.name);
                }
            }
            ['aria-labelledby', 'aria-describedby', 'headers'].forEach(name => {
                if (!node.hasAttribute(name)) return;
                const references = node.getAttribute(name).split(/\s+/).map(id => identities.get(id)).filter(Boolean);
                if (references.length) node.setAttribute(name, references.join(' '));
                else node.removeAttribute(name);
            });
            // Drop practice drag/drop hooks but retain the surrounding layout.
            ['dropzone', 'match-dropzone', 'paragraph-dropzone', 'drop-target-summary'].forEach(className => {
                if (!node.classList.contains(className)) return;
                node.classList.remove(className);
                if (!node.textContent.trim()) {
                    node.textContent = '________';
                    node.classList.add('vocab-answer-blank');
                }
            });
            ['drag-item', 'draggable-word', 'card'].forEach(className => {
                if (node.classList.contains(className)) {
                    node.classList.remove(className);
                    node.classList.add('vocab-question-option');
                }
            });
            ['pool-items', 'options-pool', 'option-pool', 'cardpool', 'headings-pool', 'pool'].forEach(className => {
                if (node.classList.contains(className)) {
                    node.classList.remove(className);
                    node.classList.add('vocab-question-pool');
                }
            });
        });

        content.querySelectorAll('input, textarea, select, button').forEach(control => {
            const type = (control.getAttribute('type') || '').toLowerCase();
            if (['hidden', 'submit', 'reset', 'image'].includes(type) ||
                (control.tagName === 'BUTTON' && (!type || type === 'submit'))) {
                control.remove();
                return;
            }
            const replacement = document.createElement('span');
            if (control.id) replacement.id = control.id;
            replacement.className = 'vocab-answer-blank';
            if (questionIds.has(control)) {replacement.dataset.readerQuestion = questionIds.get(control);replacement.dataset.readerControl = type || control.tagName.toLowerCase();}
            if (control.tagName === 'SELECT') {
                replacement.className = 'vocab-question-options';
                replacement.textContent = [...control.options].map(option => option.textContent.trim()).filter(Boolean).join(' / ');
            } else if (control.tagName === 'BUTTON') {
                replacement.textContent = control.textContent;
            } else if (type === 'radio' || type === 'checkbox') {
                replacement.textContent = type === 'radio' ? '○' : '□';
                replacement.setAttribute('aria-hidden', 'true');
            } else {
                replacement.textContent = '________';
                replacement.setAttribute('aria-label', 'Answer blank');
            }
            control.replaceWith(replacement);
        });
        content.querySelectorAll('label, form, fieldset, legend, a').forEach(node => {
            const replacement = document.createElement(['FORM', 'FIELDSET'].includes(node.tagName) ? 'div' : 'span');
            for (const attribute of [...node.attributes]) replacement.setAttribute(attribute.name, attribute.value);
            replacement.append(...node.childNodes);
            node.replaceWith(replacement);
        });
        questionIds.forEach((id,node) => { if (content.contains(node)) node.dataset.readerQuestion = id; });
        return content;
    }

    // 阅读器主控制器 (ReadingVocabReader)
    // ============================================================================
    const ReadingVocabReader = {
        currentExamId: null,
        currentSource: DEFAULT_SOURCE,
        currentSourceLabel: '内置题库',
        currentContentRef: null,
        _sourceReady: false,
        _openOptions: null,
        currentExam: null,
        currentPayload: null,
        currentExplanation: null,
        activeTab: 'all', // 'all', 'questions', or paragraph letter e.g. 'A'
        showTranslation: false,
        modalTab: 'current', // 'current' or 'all'
        modalOpen: false,
        toastTimer: null,
        _openRequestId: 0,
        _eventOverlay: null,
        _eventCleanups: [],
        _pendingTimers: new Set(),
        _returnFocus: null,
        _modalReturnFocus: null,
        // Durable writes survive closing/reopening; release only when they settle.
        _selectionPending: new Set(),
        _undoOccurrence: null,
        _occurrenceBusy: false,
        unresolvedOccurrences: [],

        clearPendingWork(overlay) {
            this._pendingTimers.forEach(timer => clearTimeout(timer));
            this._pendingTimers.clear();
            this.toastTimer = null;
            const collect = overlay?.querySelector('#reader-collect-selection');
            if (collect) collect.hidden = true;
            const popover = overlay?.querySelector('#reader-word-popover');
            if (popover) popover.hidden = true;
            this._dictionaryKey = null;
            this._collectPointer = null;
            this._undoOccurrence = null;
            this.unresolvedOccurrences = [];
            this._occurrenceBusy = false;
            overlay?.querySelector('#vocab-occurrence-actions')?.replaceChildren();
            overlay?.querySelector('#vocab-occurrence-undo')?.replaceChildren();
            overlay?.querySelector('#vocab-anchor-status')?.replaceChildren();
            const toast = overlay?.querySelector('#vocab-toast');
            if (toast) {
                toast.classList.remove('show');
                toast.textContent = '';
            }
            overlay?.querySelectorAll('.vocab-highlight--pulse').forEach(mark => mark.classList.remove('vocab-highlight--pulse'));
            const selection = window.getSelection();
            if (selection && overlay?.contains(selection.anchorNode)) selection.removeAllRanges();
        },

        defer(callback, delay) {
            const requestId = this._openRequestId;
            const timer = setTimeout(() => {
                if (!this._pendingTimers.delete(timer) || requestId !== this._openRequestId) return;
                callback();
            }, delay);
            this._pendingTimers.add(timer);
            return timer;
        },

        unbindEvents() {
            this._eventCleanups.splice(0).forEach(cleanup => cleanup());
            this._eventOverlay = null;
        },

        ensureOverlay() {
            if (!document.getElementById('reader-note-style')) {
                const style = document.createElement('style');
                style.id = 'reader-note-style';
                style.textContent = '#reader-note-form[hidden]{display:none!important}#reader-note-form{display:grid;gap:8px;margin-top:10px}#reader-note-text{width:100%;box-sizing:border-box;min-height:72px;resize:vertical;border:1px solid #d7ddd7;border-radius:8px;padding:8px;font:14px/1.5 system-ui;color:#222;background:#fff}#reader-word-popover #reader-note-selection,#reader-word-popover #reader-note-save{position:static;transform:none;padding:8px 12px;border:1px solid #ccc;border-radius:3px;background:#f8f8f8;color:#222;font:13px/1.4 system-ui;cursor:pointer}#reader-note-form #reader-note-save{justify-self:end}#reader-note-current:empty{display:none}#reader-note-current p{margin:0;padding:8px 0;border-top:1px solid #eee;white-space:pre-wrap;font:14px/1.5 system-ui}#reader-note-list{padding:16px 24px 24px}#reader-note-list .vocab-item{display:flex;align-items:flex-start;gap:16px;padding:18px 0;border-bottom:1px solid #e2e8f0}#reader-note-list .vocab-item__main{flex:1;min-width:0}#reader-note-list .vocab-item__word{color:#174b86;font-size:17px;overflow-wrap:anywhere}#reader-note-list .vocab-item__context{line-height:1.75;overflow-wrap:anywhere;margin:10px 0;max-height:none;overflow:visible;display:block}#reader-note-list .reader-note-heading{margin:12px 0 4px;font-size:15px;font-weight:700;color:#1e293b}#reader-note-list .vocab-item__context{font-style:normal;white-space:pre-wrap;color:#334155}#reader-word-term{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-width:0;flex:1;white-space:normal;overflow-wrap:anywhere}';
                document.head.append(style);
            }
            let overlay = document.getElementById('reading-vocab-reader-overlay');
            if (overlay) {
                return overlay;
            }

            overlay = document.createElement('div');
            overlay.id = 'reading-vocab-reader-overlay';
            overlay.className = 'vocab-reader-overlay is-hidden';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-label', '阅读生词本');
            overlay.setAttribute('aria-hidden', 'true');

            overlay.innerHTML = `
                <div class="vocab-reader-container">
                    <!-- 顶部吸顶导航栏 -->
                    <header class="vocab-reader-header">
                        <div class="vocab-reader-header__left">
                            <button type="button" class="vocab-reader-back-btn" id="vocab-reader-back-btn" title="返回题库浏览">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                                </svg>
                                <span>返回</span>
                            </button>
                            <div class="vocab-reader-title-wrap">
                                <h2 class="vocab-reader-title" id="vocab-reader-title">阅读文章与题目</h2>
                                <div class="vocab-reader-badges" id="vocab-reader-badges"></div>
                            </div>
                        </div>

                        <div class="vocab-reader-header__center">
                            <div class="vocab-reader-tabs" id="vocab-reader-tabs" role="tablist">
                                <!-- 动态插入段落与题目标签，完全平铺陈列展开 -->
                            </div>
                        </div>
                    </header>

                    <!-- 沉浸式提示栏 -->
                    <div class="vocab-reader-banner">
                        <span class="vocab-banner-icon">✨</span>
                        <span class="vocab-banner-text"><strong>划词收录</strong>：在文章或题目中用鼠标、触屏或 Shift＋方向键选择生词或短语（最多 45 字符）。保存后以<strong>黄色高亮</strong>标注；点击高亮可移除这一处。</span>
                    </div>

                    <div class="reader-controls" aria-label="阅读设置">
                        <div class="reader-font-controls"><span>字号</span><button type="button" data-reader-size="-1" aria-label="缩小字号">A−</button><output id="reader-font-size">18</output><button type="button" data-reader-size="1" aria-label="放大字号">A＋</button></div>
                        <span id="reader-progress" role="status">阅读进度 0%</span>
                        <button type="button" id="reader-answer-split" aria-pressed="false">分屏题目</button><button type="button" id="reader-answer-history" aria-pressed="false">展示作答</button><button type="button" id="reader-top">回到顶部</button>
                    </div>
                    <!-- 独立滚动主体区域（确保顶部 header 永远固定在视口顶部） -->
                    <div class="vocab-reader-scroll-area" id="vocab-reader-scroll-area">
                        <!-- 阅读核心主内容区 -->
                        <main class="vocab-reader-body" id="vocab-reader-body" data-vocab-source-root>
                            <!-- 文章区域 -->
                            <section class="vocab-passage-section" id="vocab-passage-section">
                                <div class="vocab-passage-header">
                                    <h3 class="vocab-passage-title" id="vocab-passage-title">Reading Passage</h3>
                                    <div class="vocab-passage-intro" id="vocab-passage-intro"></div>
                                </div>
                                <div class="vocab-passage-content" id="vocab-passage-content">
                                    <!-- 段落内容 -->
                                </div>
                            </section>

                            <!-- 题目区域 -->
                            <section class="vocab-questions-section" id="vocab-questions-section">
                                <div class="vocab-questions-header">
                                    <h3 class="vocab-questions-title">📝 题目与问题 (Questions)</h3>
                                    <p class="vocab-questions-subtitle">选择词语后点击“收录”，保存至生词本</p>
                                </div>
                                <div class="vocab-questions-content" id="vocab-questions-content">
                                    <!-- 题目内容 -->
                                </div>
                            </section>
                        </main>
                    </div>

                    <!-- 悬浮生词本 FAB 按钮 -->
                    <div class="vocab-fab" id="vocab-fab" role="button" tabindex="0" title="打开生词本">
                        <span class="vocab-fab-icon">📝</span>
                        <span class="vocab-fab-label">生词本</span>
                        <span class="vocab-fab-count" id="vocab-fab-count">0</span>
                    </div>

                    <div id="reader-word-popover" hidden role="region" aria-label="选词释义">
                        <div class="reader-word-heading"><strong id="reader-word-term"></strong><button type="button" id="reader-word-close" aria-label="关闭释义">×</button></div>
                        <div id="reader-word-definition" role="status" aria-live="polite"></div>
                        <div class="reader-word-buttons"><button type="button" id="reader-word-retry" hidden>重试查词</button><button type="button" id="reader-collect-selection" hidden>收录到生词本</button><button type="button" id="reader-note-selection" hidden>添加笔记</button></div>
                        <form id="reader-note-form" hidden><textarea id="reader-note-text" maxlength="500" placeholder="写下这一处的笔记"></textarea><button type="button" id="reader-note-save">保存笔记</button></form>
                        <div id="reader-note-current"></div>
                    </div>
                    <!-- 划词收录 Toast 提示 -->
                    <div class="vocab-toast-msg" id="vocab-toast" role="status" aria-live="polite"></div>
                    <div class="vocab-occurrence-actions" id="vocab-occurrence-actions" aria-live="polite"></div>
                    <div class="vocab-occurrence-undo" id="vocab-occurrence-undo" role="status" aria-live="polite"></div>
                    <div class="vocab-anchor-status" id="vocab-anchor-status" role="status" aria-live="polite"></div>

                    <!-- 生词本弹窗 Modal -->
                    <div class="vocab-modal" id="vocab-modal" role="dialog" aria-modal="false" aria-hidden="true">
                        <div class="vocab-modal-content">
                            <div class="vocab-modal-header">
                                <div class="vocab-modal-title-wrap">
                                    <h3>生词与笔记</h3>
                                    <div class="vocab-modal-tabs">
                                        <button type="button" class="v-tab-btn active" id="v-tab-current">本篇 (<span id="v-count-current">0</span>)</button>
                                        <button type="button" class="v-tab-btn" id="v-tab-all">全部文章 (<span id="v-count-all">0</span>)</button>
                                    </div>
                                </div>
                                <div class="vocab-modal-header-actions">
                                    <button type="button" class="shui-glass-btn vocab-modal-bookshelf-btn" id="vocab-modal-bookshelf-btn" title="查看阅读书架">书架</button>
                                    <button type="button" class="vocab-modal-close" id="vocab-modal-close" title="关闭">×</button>
                                </div>
                            </div>

                            <!-- 手动添加生词栏 -->
                            <div class="vocab-modal-add-row">
                                <input type="text" id="vocab-manual-input" placeholder="手动添加生词..." maxlength="50" />
                                <button type="button" id="vocab-manual-add-btn">收录</button>
                            </div>

                            <!-- 生词列表 -->
                            <div class="vocab-list" id="vocab-list">
                                <!-- 动态插入 -->
                            </div>
                            <div id="reader-note-list"></div>

                            <!-- 底部操作栏 -->
                            <div class="vocab-modal-footer">
                                <button type="button" class="v-action-btn v-export-btn" id="vocab-export-btn">
                                    <span>导出本篇 TXT</span>
                                </button>
                                <button type="button" class="v-action-btn v-clear-btn" id="vocab-clear-btn">
                                    <span>清空生词</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.bindEvents(overlay);
            return overlay;
        },

        bindEvents(overlay) {
            if (this._eventOverlay === overlay) return;
            this.unbindEvents();
            this._eventOverlay = overlay;
            const on = (element, type, callback, options) => {
                element.addEventListener(type, callback, options);
                this._eventCleanups.push(() => element.removeEventListener(type, callback, options));
            };
            // 返回按钮
            const backBtn = overlay.querySelector('#vocab-reader-back-btn');
            if (backBtn) {
                on(backBtn, 'click', () => this.close());
            }

            // 开启生词本弹窗
            const openModalBtn = overlay.querySelector('#vocab-open-modal-btn');
            const fab = overlay.querySelector('#vocab-fab');
            if (openModalBtn) {
                on(openModalBtn, 'click', () => this.openModal());
            }
            if (fab) {
                on(fab, 'click', () => this.openModal());
                on(fab, 'keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.openModal();
                    }
                });
            }

            // 关闭生词本弹窗
            const closeModalBtn = overlay.querySelector('#vocab-modal-close');
            const modal = overlay.querySelector('#vocab-modal');
            if (closeModalBtn) {
                on(closeModalBtn, 'click', () => this.closeModal());
            }
            if (modal) {
                on(modal, 'click', (e) => {
                    if (e.target === modal) {
                        this.closeModal();
                    }
                });
            }

            // 前往阅读书架
            const bookshelfBtn = overlay.querySelector('#vocab-modal-bookshelf-btn');
            if (bookshelfBtn) {
                on(bookshelfBtn, 'click', async () => {
                    this.closeModal();
                    this.close();
                    if (global.opener && !global.opener.closed) {
                        try {
                            if (typeof global.opener.AppActions?.openBookshelf === 'function') {
                                await global.opener.AppActions.openBookshelf({ fromView: global.opener.app?.currentView || 'browse' });
                                global.opener.focus();
                                return;
                            }
                            if (global.opener.app && typeof global.opener.app.navigateToView === 'function') {
                                global.opener.app.navigateToView('bookshelf');
                                global.opener.focus();
                                return;
                            } else if (typeof global.opener.switchView === 'function') {
                                global.opener.switchView('bookshelf');
                                global.opener.focus();
                                return;
                            }
                        } catch (_) {}
                    }
                    if (typeof global.AppActions?.openBookshelf === 'function') {
                        await global.AppActions.openBookshelf({ fromView: global.app?.currentView || 'browse' });
                    } else if (global.app && typeof global.app.navigateToView === 'function') {
                        global.app.navigateToView('bookshelf');
                    } else if (typeof global.switchView === 'function') {
                        global.switchView('bookshelf');
                    }
                });
            }

            // 生词本切换标签 (本篇 / 全部)
            const tabCurrent = overlay.querySelector('#v-tab-current');
            const tabAll = overlay.querySelector('#v-tab-all');
            if (tabCurrent) {
                on(tabCurrent, 'click', () => {
                    this.modalTab = 'current';
                    tabCurrent.classList.add('active');
                    tabAll.classList.remove('active');
                    this.renderVocabList();
                });
            }
            if (tabAll) {
                on(tabAll, 'click', () => {
                    this.modalTab = 'all';
                    tabAll.classList.add('active');
                    tabCurrent.classList.remove('active');
                    this.renderVocabList();
                });
            }

            const readerTabs = overlay.querySelector('#vocab-reader-tabs');
            if (readerTabs) {
                on(readerTabs, 'click', event => {
                    const button = event.target.closest('.vocab-tab-btn');
                    if (button && readerTabs.contains(button)) this.switchViewTab(button.dataset.para);
                });
            }

            const vocabList = overlay.querySelector('#vocab-list');
            if (vocabList) {
                on(vocabList, 'click', async event => {
                    const speakButton = event.target.closest('.vocab-speak-btn');
                    const deleteButton = event.target.closest('.vocab-delete-btn');
                    if (speakButton && vocabList.contains(speakButton)) {
                        event.stopPropagation();
                        speakWord(speakButton.dataset.speakWord);
                    } else if (deleteButton && vocabList.contains(deleteButton)) {
                        event.stopPropagation();
                        if (deleteButton.disabled) return;
                        const requestId = this._openRequestId;
                        const id = deleteButton.dataset.delId;
                        const item = ReadingVocabStore.getAll().find(word => word.id === id);
                        const word = item?.word;
                        deleteButton.disabled = true;
                        this.showToast('正在保存…');
                        try {
                            await ReadingVocabStore.remove(id, this.modalTab === 'current' ? this.currentExamId : null, this.currentSource);
                            if (requestId !== this._openRequestId) return;
                            this.updateCounts();
                            this.renderVocabList();
                            if (word) this.removeVocabHighlightForWord(word);
                            this.showToast('已从生词本删除');
                        } catch (error) {
                            if (requestId === this._openRequestId) this.showSaveError(error, '删除失败，请再次点击删除重试');
                        } finally {
                            deleteButton.disabled = false;
                        }
                    }
                });
            }

            // 手动收录
            const manualInput = overlay.querySelector('#vocab-manual-input');
            const manualAddBtn = overlay.querySelector('#vocab-manual-add-btn');
            const handleManualAdd = async () => {
                if (!manualInput || manualAddBtn?.disabled || !this.currentPayload) return;
                const val = manualInput.value.trim();
                if (!val) return;
                const requestId = this._openRequestId;
                if (manualAddBtn) manualAddBtn.disabled = true;
                this.showToast('正在保存…');
                try {
                    const result = await ReadingVocabStore.add(
                        val,
                        this.currentExamId,
                        this.currentExam?.title || '',
                        '', null, this.currentSource, this.currentContentRef
                    );
                    if (requestId !== this._openRequestId) return;
                    if (result.added) {
                        manualInput.value = '';
                        this.updateCounts();
                        this.renderVocabList();
                        this.showToast(result.isDuplicate ? `"${val}" 已在生词本中` : `✅ "${val}" 已收录`);
                    } else {
                        this.showToast('未保存，请检查输入后重试');
                    }
                } catch (error) {
                    if (requestId === this._openRequestId) this.showSaveError(error, '保存失败，请再次点击收录重试');
                } finally {
                    if (manualAddBtn) manualAddBtn.disabled = false;
                }
            };
            if (manualAddBtn) {
                on(manualAddBtn, 'click', handleManualAdd);
            }
            if (manualInput) {
                on(manualInput, 'keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleManualAdd();
                    }
                });
            }

            // 导出与清空
            const exportBtn = overlay.querySelector('#vocab-export-btn');
            if (exportBtn) {
                on(exportBtn, 'click', async () => {
                    if (exportBtn.disabled) return;
                    const requestId = this._openRequestId;
                    const isCurrent = this.modalTab === 'current';
                    const examId = isCurrent ? this.currentExamId : null;
                    const title = isCurrent ? (this.currentExam?.title || this.examData?.title || '当前文章') : '全部精读生词';
                    exportBtn.disabled = true;
                    try {
                        const result = await ReadingVocabStore.exportTxt(examId, null, title, this.currentSource);
                        if (requestId !== this._openRequestId) return;
                        this.showToast(result ? `✅ 已导出 ${result.count} 个生词（${result.filename}）`
                            : '⚠️ 当前生词本为空，暂无可导出内容');
                    } catch (error) {
                        if (requestId !== this._openRequestId) return;
                        this.showToast(error?.code === 'BACKEND_UNAVAILABLE'
                            ? '⚠️ 生词读取失败，请刷新页面后重试导出' : '⚠️ 生词读取失败，请重试导出');
                    } finally {
                        if (requestId === this._openRequestId) exportBtn.disabled = false;
                    }
                });
            }

            const clearBtn = overlay.querySelector('#vocab-clear-btn');
            if (clearBtn) {
                on(clearBtn, 'click', async () => {
                    if (clearBtn.disabled) return;
                    const requestId = this._openRequestId;
                    const isCurrent = this.modalTab === 'current';
                    const examId = isCurrent ? this.currentExamId : null;
                    const count = isCurrent
                        ? ReadingVocabStore.getByExam(this.currentExamId, this.currentSource).length
                        : ReadingVocabStore.getAll().length;

                    if (count === 0) {
                        this.showToast('生词本已经是空的了');
                        return;
                    }

                    clearBtn.disabled = true;
                    this.showToast('正在保存…');
                    try {
                        await ReadingVocabStore.clear(examId, this.currentSource);
                        if (requestId !== this._openRequestId) return;
                        this.updateCounts();
                        this.renderVocabList();
                        const passageContent = overlay.querySelector('#vocab-passage-content');
                        const questionsContent = overlay.querySelector('#vocab-questions-content');
                        this.removeVocabHighlights(passageContent);
                        this.removeVocabHighlights(questionsContent);
                        this.showToast(isCurrent ? '✅ 本篇生词已清空' : '✅ 全部生词已清空');
                    } catch (error) {
                        if (requestId === this._openRequestId) this.showSaveError(error, '清空失败，请再次点击清空重试');
                    } finally {
                        clearBtn.disabled = false;
                    }
                });
            }

            const readerBody = overlay.querySelector('#vocab-reader-body');
            if (readerBody) {
                const capture = event => {
                    if (event?.target?.closest('button, input, textarea, select, .vocab-translation-card, .vocab-paragraph-tag')) return;
                    this.offerSelection();
                };
                on(readerBody, 'pointerdown', event => {
                    if (event.button !== 0) return;
                    this._wordGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
                });
                on(readerBody, 'pointermove', event => {
                    const gesture = this._wordGesture;
                    if (!gesture || gesture.id !== event.pointerId || gesture.dragged) return;
                    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.dragged = true;
                });
                on(readerBody, 'mouseup', capture);
                on(readerBody, 'touchend', capture);
                on(document, 'selectionchange', () => {
                    this.offerSelection();
                });
                on(overlay, 'keyup', event => {
                    if (event.key === 'Shift') capture(event);
                });
                on(readerBody, 'click', event => {
                    const mark = event.target.closest('mark.vocab-highlight');
                    const selectedText = window.getSelection()?.toString().trim();
                    if (mark && !selectedText) {
                        this.showOccurrenceActions(mark);
                        return;
                    }
                    // A drag already owns the selection. Click only fills a caret.
                    if (this._wordGesture?.dragged || selectedText) return;
                    this.selectWordAtClick(event);
                });
                on(readerBody, 'keydown', event => {
                    const mark = event.target.closest('mark.vocab-highlight');
                    if (mark && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        this.showOccurrenceActions(mark);
                    } else {
                        this.moveKeyboardSelection(event);
                    }
                });
            }
            on(overlay, 'click', event => {
                const button = event.target.closest('[data-action]');
                if (!button || button.disabled) return;
                if (button.dataset.action === 'remove-occurrence') {
                    event.stopPropagation();
                    this.removeOccurrence(button.dataset.occurrenceId);
                } else if (button.dataset.action === 'undo-occurrence') {
                    this.undoOccurrence();
                } else if (button.dataset.action === 'retry-anchors') {
                    this.open(this.currentExamId, { ...this._openOptions, source: this.currentSource });
                }
            });

            on(overlay.querySelector('#vocab-reader-scroll-area'), 'scroll', () => {
                this.updateReadingProgress();
                this.offerSelection();
                if (this._activeOccurrenceMark?.isConnected) this.positionWordPanel(overlay.querySelector('#vocab-occurrence-actions'), this._activeOccurrenceMark.getBoundingClientRect());
            }, { passive: true });
            overlay.querySelectorAll('[data-reader-size]').forEach(button => on(button, 'click', () => {
                this._readerFontSize = Math.min(24, Math.max(16, (this._readerFontSize || 18) + Number(button.dataset.readerSize)));
                this.applyReadingSize();
                this.updateReadingProgress();
            }));
            for (const [selector, history] of [['#reader-answer-split', false], ['#reader-answer-history', true]]) {
                const button = overlay.querySelector(selector);button.type = 'button';
                let down = null, handledAt = 0;
                const activate = () => Promise.resolve(this.toggleAnswerPanel(history)).catch(() => this.showToast('题目面板打开失败，请重试'));
                on(button, 'pointerdown', event => { if(event.button===0)down={id:event.pointerId,x:event.clientX,y:event.clientY}; });
                on(button, 'pointercancel', () => {down=null;});
                on(button, 'pointerup', event => {
                    const start=down;down=null;
                    if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;
                    event.preventDefault();handledAt=Date.now();activate();
                });
                on(button, 'click', event => {event.preventDefault();if(event.detail>0&&Date.now()-handledAt<600)return;activate();});
            }
            on(overlay.querySelector('#reader-top'), 'click', () => {
                overlay.querySelector('#vocab-reader-scroll-area').scrollTop = 0;
                this.updateReadingProgress();
            });
            // preventDefault on pointerdown keeps the text selection, but desktop
            // browsers then drop the click. Touch still emits click, so a mouse
            // press on 收录 often did nothing. Activate from pointerup and keep
            // click for keyboard and programmatic use.
            const pressButton = (button, action, holdSelection = false) => {
                let pointerId = null;
                let originX = 0;
                let originY = 0;
                let actedAt = 0;
                on(button, 'pointerdown', event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    pointerId = event.pointerId;
                    originX = event.clientX;
                    originY = event.clientY;
                    if (holdSelection) {
                        this._collectPointer = pointerId;
                        const selection = window.getSelection();
                        this._collectRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                    }
                    try { button.setPointerCapture(event.pointerId); } catch (error) {}
                });
                on(button, 'pointerup', event => {
                    if (pointerId !== event.pointerId) return;
                    pointerId = null;
                    if (holdSelection) this._collectPointer = null;
                    if (Math.hypot(event.clientX - originX, event.clientY - originY) > 28) return;
                    actedAt = performance.now();
                    if (holdSelection) this.restoreCollectRange();
                    action();
                });
                on(button, 'pointercancel', event => {
                    if (pointerId !== event.pointerId) return;
                    pointerId = null;
                    if (holdSelection) this._collectPointer = null;
                });
                on(button, 'click', () => {
                    if (performance.now() - actedAt < 700) return;
                    action();
                });
            };
            pressButton(overlay.querySelector('#reader-collect-selection'), () => this.captureSelection(), true);
            pressButton(overlay.querySelector('#reader-note-selection'), () => this.openNoteForm(), true);
            pressButton(overlay.querySelector('#reader-note-save'), () => this.saveSelectionNote());
            on(overlay.querySelector('#reader-word-popover'), 'pointerdown', event => { if (event.target.closest('button')) event.preventDefault(); });
            pressButton(overlay.querySelector('#reader-word-close'), () => {
                window.getSelection()?.removeAllRanges();
                overlay.querySelector('#reader-word-popover').hidden = true;
            });
            pressButton(overlay.querySelector('#reader-word-retry'), () => { this._dictionaryKey = null; this.offerSelection(); });
            on(window, 'resize', () => this.offerSelection());
            on(overlay, 'pointerdown', event => {
                if (!event.target.closest('mark.vocab-highlight, #vocab-occurrence-actions')) {
                    overlay.querySelector('#vocab-occurrence-actions').replaceChildren();
                    this._activeOccurrenceMark = null;
                }
            });
            // ESC 键监听
            on(window, 'keydown', (e) => {
                if (e.key === 'Escape' && !overlay.classList.contains('is-hidden')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.modalOpen) {
                        this.closeModal();
                    } else if (overlay && !overlay.classList.contains('is-hidden')) {
                        this.close();
                    }
                }
            }, true);
        },

        async open(examId, options = {}) {
            if (!examId && !options.notebook) return;

            const overlay = this.ensureOverlay();
            const requestId = ++this._openRequestId;
            this._openOptions = { ...options };
            const initiatingElement = options.returnFocus || document.activeElement;
            if (initiatingElement && !overlay.contains(initiatingElement)) this._returnFocus = initiatingElement;
            this.unbindEvents();
            this.bindEvents(overlay);
            this.clearPendingWork(overlay);
            this._tabScrollPositions = {};
            this.activeTab = null;
            this.applyReadingSize();
            this.currentExamId = examId;
            this.currentSource = options.source ? { ...options.source } : { ...DEFAULT_SOURCE };
            this.currentSourceLabel = options.source?.kind === 'imported' ? `导入题库 · ${options.source.id}` : '内置题库';
            this._sourceReady = false;
            this.currentExam = null;
            this.currentContentRef = null;
            this.ensureOverlay().querySelector('#reader-answer-panel')?.remove();
            this.ensureOverlay().classList.remove('reader-answer-open');
            this.currentPayload = null;
            this.currentExplanation = null;
            this.closeModal(false);
            this.modalTab = 'current';
            overlay.querySelector('#v-tab-current')?.classList.add('active');
            overlay.querySelector('#v-tab-all')?.classList.remove('active');
            overlay.querySelector('#v-tab-current').disabled = !examId;
            ['#vocab-manual-input', '#vocab-manual-add-btn', '#vocab-export-btn', '#vocab-clear-btn'].forEach(selector => {
                overlay.querySelector(selector).disabled = true;
            });
            const manualInput = overlay.querySelector('#vocab-manual-input');
            if (manualInput) manualInput.value = '';

            // 根据来源动态调整返回按钮提示
            const backBtn = overlay.querySelector('#vocab-reader-back-btn');
            const backBtnText = overlay.querySelector('#vocab-reader-back-btn span');
            if (options && options.fromPractice) {
                if (backBtnText) backBtnText.textContent = '返回练习';
                if (backBtn) backBtn.title = '返回练习试卷';
            } else if (options.fromView === 'bookshelf') {
                if (backBtnText) backBtnText.textContent = '返回书架';
                if (backBtn) backBtn.title = '返回阅读书架';
            } else {
                if (backBtnText) backBtnText.textContent = '返回题库';
                if (backBtn) backBtn.title = '返回题库浏览';
            }

            // 显示加载状态
            overlay.classList.remove('is-hidden');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('vocab-reader-open');
            backBtn?.focus({ preventScroll: true });

            const titleEl = overlay.querySelector('#vocab-reader-title');
            const badgesEl = overlay.querySelector('#vocab-reader-badges');
            const passageContent = overlay.querySelector('#vocab-passage-content');
            const questionsContent = overlay.querySelector('#vocab-questions-content');

            if (titleEl) titleEl.textContent = '正在加载试卷全文...';
            if (badgesEl) badgesEl.innerHTML = '';
            if (passageContent) passageContent.innerHTML = '<div class="vocab-loading-spinner">正在解析文章结构与题目...</div>';
            if (questionsContent) questionsContent.innerHTML = '';
            ['#vocab-passage-title', '#vocab-passage-intro', '#vocab-reader-tabs'].forEach(selector => {
                const element = overlay.querySelector(selector);
                if (element) element.textContent = '';
            });
            this.switchViewTab('all');
            this.updateCounts();

            try {
                if (options.notebook) {
                    await ReadingVocabStore.init();
                    if (requestId !== this._openRequestId) return;
                    this._sourceReady = true;
                    this.currentExam = { title: '全部精读生词' };
                    titleEl.textContent = '全部精读生词';
                    passageContent.textContent = '查看、删除或导出全部文章的精读生词。';
                    this.modalTab = 'all';
                    overlay.querySelector('#v-tab-current').classList.remove('active');
                    overlay.querySelector('#v-tab-all').classList.add('active');
                    overlay.querySelector('#vocab-export-btn').disabled = false;
                    overlay.querySelector('#vocab-clear-btn').disabled = false;
                    this.openModal();
                    return;
                }
                // 加载试卷数据
                const source = await ReadingVocabStore.resolveSource(options);
                if (requestId !== this._openRequestId) return;
                this.currentSource = source;
                this.currentSourceLabel = source.kind === 'imported' ? `导入题库 · ${source.id}` : '内置题库';
                const articleId = global.AppData.vocab.readingModel.articleId(source, String(examId));
                if (options.articleId && options.articleId !== articleId) {
                    throw new Error('文章与题库来源不匹配，请从原书架条目重新打开');
                }
                this._sourceReady = true;
                this.currentExam = { title: options.title || examId };
                await ReadingVocabStore.init();
                if (requestId !== this._openRequestId) return;
                const storedArticle = ReadingVocabStore._state.snapshot.reading.articles.find(article => article.id === articleId);
                const resolved = await resolveReadingArticle(examId, source);
                if (requestId !== this._openRequestId) return;
                this.currentSourceLabel = resolved.sourceLabel;
                this.currentExam = { ...this.currentExam, ...(resolved.exam || {}) };
                this.renderIdentity();
                if (!resolved.exam) throw new Error(resolved.unavailableReason || '原题库或文章已移除，已保存的生词仍可查看或导出');
                const contentRef = global.AppData.vocab.readingModel.contentRef(source.kind === 'builtin'
                    ? { sourceKind: 'generated-reading', dataKey: resolved.generatedKey } : resolved.exam);
                const storedRefs = storedArticle?.contentRefs || [];
                if (storedRefs.length > 1 || (storedRefs.length === 1 && storedRefs[0] !== contentRef)
                    || (options.contentRef && options.contentRef !== contentRef)) {
                    throw new Error('原题库的文章文件已更改或来源记录冲突，已保存的生词仍可查看或导出');
                }
                this.currentContentRef = contentRef;
                const normalizeTitle = title => String(title || '').trim().replace(/\s+/g, ' ');
                const resolvedTitle = normalizeTitle(resolved.exam.title);
                if (resolvedTitle && [storedArticle?.title, options.title].some(title =>
                    normalizeTitle(title) && normalizeTitle(title) !== resolvedTitle)) {
                    throw new Error('原题库中的文章已更改，已保存的生词仍可查看或导出');
                }
                const payload = resolved.generatedKey
                    ? await loadReadingExamPayload(resolved.generatedKey)
                    : await loadImportedReadingPayload(resolved.exam);
                if (requestId !== this._openRequestId) return;
                if (!payload) {
                    throw new Error('未找到该试卷的数据文件');
                }
                this.currentPayload = payload;
                this.currentSource = source;

                // 异步加载解析（不阻塞主内容）
                if (resolved.generatedKey) loadReadingExplanationPayload(resolved.generatedKey).then(exp => {
                    if (requestId !== this._openRequestId) return;
                    this.currentExplanation = exp;
                    this.enhanceWithExplanation(exp);
                }).catch(() => {});

                // 获取 Exam Meta
                this.currentExam = Object.assign({}, payload.meta || {}, resolved.exam);

                // Article/source checks have passed. Paint the original before
                // the bookshelf bookkeeping; controls remain disabled until
                // the normal acknowledged-save path below finishes.
                this.renderContent();
                this.switchViewTab(this.activeTab || 'all');
                this.updateCounts();
                if (typeof global.requestAnimationFrame === 'function') {
                    await new Promise(resolve => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve)));
                    if (requestId !== this._openRequestId) return;
                }

                // 记录至阅读书架
                const examTitle = this.currentExam.title || this.currentExam.name || examId;
                const examCategory = this.currentExam.category || this.currentExam.type || '雅思阅读';
                let saveError = null;
                try {
                    await recordBookshelfExamDirect(examId, examTitle, examCategory, source, contentRef);
                } catch (error) {
                    saveError = error;
                }
                if (requestId !== this._openRequestId) return;
                const committedRefs = ReadingVocabStore._state?.snapshot.reading.articles.find(article => article.id === articleId)?.contentRefs || [];
                if (committedRefs.length > 1 || (committedRefs.length === 1 && committedRefs[0] !== contentRef)) {
                    throw new Error('原题库的来源记录已更改，已保存的生词仍可查看或导出');
                }

                // 渲染界面
                this.renderContent();
                this.switchViewTab(this.activeTab || 'all');
                this.updateCounts();
                ['#vocab-manual-input', '#vocab-manual-add-btn', '#vocab-export-btn', '#vocab-clear-btn'].forEach(selector => {
                    overlay.querySelector(selector).disabled = false;
                });
                if (saveError) this.showSaveError(saveError, '书架记录保存失败，请重新打开文章重试');
            } catch (err) {
                if (requestId !== this._openRequestId) return;
                console.error('[ReadingVocabReader] 加载失败:', err);
                this.currentPayload = null;
                await ReadingVocabStore.init().catch(() => {});
                if (requestId !== this._openRequestId) return;
                if (this._sourceReady) {
                    const articleId = global.AppData.vocab.readingModel.articleId(this.currentSource, String(examId));
                    const stored = ReadingVocabStore._state?.snapshot.reading.articles.find(article => article.id === articleId);
                    this.currentExam = { ...(this.currentExam || {}), title: stored?.title || options.title || this.currentExam?.title || examId };
                    overlay.querySelector('#vocab-export-btn').disabled = false;
                    overlay.querySelector('#vocab-clear-btn').disabled = false;
                }
                this.renderIdentity();
                this.applyVocabHighlights();
                this.updateCounts();
                if (passageContent) {
                    const errorState = document.createElement('div');
                    errorState.className = 'vocab-error-state';
                    const message = document.createElement('p');
                    errorState.setAttribute('role', 'status');
                    errorState.dataset.sourceUnavailable = 'true';
                    message.textContent = `⚠️ 载入文章数据失败：${err.message || '请检查网络或试卷配置'}`;
                    const retry = document.createElement('button');
                    retry.type = 'button';
                    retry.className = 'btn btn-primary';
                    retry.textContent = '重试';
                    const handleRetry = () => {
                        if (requestId === this._openRequestId && retry.isConnected && !overlay.classList.contains('is-hidden')) {
                            this.open(examId, options);
                        }
                    };
                    retry.addEventListener('click', handleRetry);
                    this._eventCleanups.push(() => retry.removeEventListener('click', handleRetry));
                    errorState.append(message, retry);
                    const review = document.createElement('button');
                    review.type = 'button';
                    review.textContent = '查看已保存生词';
                    const handleReview = () => this.openModal();
                    review.addEventListener('click', handleReview);
                    this._eventCleanups.push(() => review.removeEventListener('click', handleReview));
                    errorState.append(review);
                    passageContent.replaceChildren(errorState);
                }
            }
        },

        openNotebook(options = {}) {
            // The global notebook is a first-class app view. Keep the legacy
            // reader modal only as a fallback for isolated reader contexts
            // where the app shell has not loaded the notebook view yet.
            if (global.ReadingNotebookView && typeof global.ReadingNotebookView.open === 'function') {
                return global.ReadingNotebookView.open({
                    ...options,
                    fromView: options.fromView || global.app?.currentView || 'bookshelf'
                });
            }
            if (global.AppLazyLoader && typeof global.AppLazyLoader.ensureGroup === 'function') {
                return Promise.resolve(global.AppLazyLoader.ensureGroup('reading-library'))
                    .then(() => global.ReadingNotebookView && typeof global.ReadingNotebookView.open === 'function'
                        ? global.ReadingNotebookView.open({
                            ...options,
                            fromView: options.fromView || global.app?.currentView || 'bookshelf'
                        })
                        : this.open(null, { ...options, notebook: true }));
            }
            return this.open(null, { ...options, notebook: true });
        },

        renderIdentity() {
            const overlay = this.ensureOverlay();
            const exam = this.currentExam || {};
            // 标题与标签（紧凑精致）
            const titleEl = overlay.querySelector('#vocab-reader-title');
            const badgesEl = overlay.querySelector('#vocab-reader-badges');
            if (titleEl) {
                const titleText = exam.title || '阅读文章与题目';
                titleEl.textContent = titleText;
                titleEl.title = titleText;
            }
            if (badgesEl) {
                badgesEl.innerHTML = `
                    <span class="vocab-badge vocab-badge--cat">${escapeHtml(exam.category || '阅读')}</span>
                    <span class="vocab-badge vocab-badge--source">${escapeHtml(this.currentSourceLabel)}</span>
                    ${exam.frequency ? `<span class="vocab-badge vocab-badge--freq">${escapeHtml(exam.frequency)}</span>` : ''}
                `;
            }
        },

        renderContent() {
            const overlay = this.ensureOverlay();
            const exam = this.currentExam;
            const payload = this.currentPayload;
            this.renderIdentity();

            // 解析文章大标题、考试指导语与真实段落
            const passageData = global.ReadingVocabContent.normalizePassage(payload?.passage, exam.title || '');
            const blocks = passageData.blocks;
            const instructionHtml = passageData.instructionHtml;
            const passageTitle = passageData.passageTitle || exam.title || 'Reading Passage';

            // 设置文章标题
            const passageTitleEl = overlay.querySelector('#vocab-passage-title');
            if (passageTitleEl) {
                passageTitleEl.textContent = passageTitle;
            }

            // 渲染前置说明指导语（如 "You should spend about 20 minutes on questions 1 to 30..."）
            // 关键：作为文章头部的说明提示条展现，不赋予任何段落标签（没有段落A标签）
            const passageIntroEl = overlay.querySelector('#vocab-passage-intro');
            if (passageIntroEl) {
                passageIntroEl.replaceChildren();
                if (instructionHtml) {
                    const instruction = document.createElement('div');
                    instruction.className = 'vocab-passage-instruction';
                    instruction.setAttribute('role', 'note');
                    instruction.appendChild(createReadOnlyQuestionContent(instructionHtml, 'vocab-passage-instruction'));
                    passageIntroEl.appendChild(instruction);
                }
                if (passageData.subtitleHtml) {
                    const subtitle = document.createElement('div');
                    subtitle.className = 'vocab-passage-subtitle';
                    subtitle.appendChild(createReadOnlyQuestionContent(passageData.subtitleHtml, 'vocab-passage-subtitle'));
                    passageIntroEl.appendChild(subtitle);
                }
                passageIntroEl.style.display = passageIntroEl.childNodes.length ? 'block' : 'none';
            }

            // 渲染顶部段落切换 Tabs（完全平铺展开：全文、Para A、Para B、Para C...与题目）
            const tabsContainer = overlay.querySelector('#vocab-reader-tabs');
            if (tabsContainer) {
                let tabsHtml = `<button type="button" class="vocab-tab-btn active" data-para="all">全文</button>`;
                blocks.forEach(b => {
                    tabsHtml += `<button type="button" class="vocab-tab-btn" data-para="${b.id}">Para ${b.letter}</button>`;
                });
                tabsHtml += `<button type="button" class="vocab-tab-btn vocab-tab-btn--questions" data-para="questions">📝 Questions</button>`;
                tabsContainer.innerHTML = tabsHtml;
            }

            // 渲染文章段落
            const passageContent = overlay.querySelector('#vocab-passage-content');
            if (passageContent) {
                if (blocks.length > 0) {
                    let passageHtml = '';
                    blocks.forEach(b => {
                        passageHtml += `
                            <div class="vocab-paragraph-card" id="vocab-card-${b.id}" data-paragraph-id="${b.id}" data-letter="${b.letter}">
                                <div class="vocab-paragraph-tag">
                                    <span class="vocab-para-letter">Para ${b.letter}</span>
                                </div>
                                <div class="vocab-paragraph-text" data-content-id="${b.id}"></div>
                                <div class="vocab-translation-card" id="vocab-trans-${b.id}" style="display: ${this.showTranslation ? 'block' : 'none'};">
                                    <div class="vocab-trans-label">中文参考译文：</div>
                                    <div class="vocab-trans-text" id="vocab-trans-text-${b.id}">加载中...</div>
                                </div>
                            </div>
                        `;
                    });
                    passageContent.innerHTML = passageHtml;
                    blocks.forEach(block => {
                        const text = passageContent.querySelector('[data-content-id="' + block.id + '"]');
                        text.appendChild(createReadOnlyQuestionContent(block.html, 'vocab-' + block.id));
                        this.assignTextScopes(text, 'passage/' + block.id);
                    });
                } else {
                    // 原生清洗后渲染
                    passageContent.innerHTML = '<p class="vocab-empty-tip">本篇暂无可用正文</p>';
                }
            }

            this._passageNotes = [];
            this.noteRequest().catch(() => {});

            // 渲染题目
            const questionsContent = overlay.querySelector('#vocab-questions-content');
            if (questionsContent) {
                const questionGroups = payload?.questionGroups || [];
                if (questionGroups.length > 0) {
                    const groups = document.createDocumentFragment();
                    questionGroups.forEach((g, idx) => {
                        const group = document.createElement('div');
                        group.className = 'vocab-question-group';
                        group.id = `vocab-qgroup-${idx + 1}`;
                        group.dataset.sectionId = 'q-' + (idx + 1);
                        const html = (g.leadHtml || '') + (g.bodyHtml || g.html || '');
                        group.appendChild(createReadOnlyQuestionContent(html, group.id));
                        this.assignTextScopes(group, 'questions/q-' + (idx + 1), true);
                        groups.appendChild(group);
                    });
                    questionsContent.replaceChildren(groups);
                } else {
                    questionsContent.innerHTML = '<p class="vocab-empty-tip">本篇无额外题目数据</p>';
                }
            }

            // 如果已有解析数据，填充中文译文
            if (this.currentExplanation) {
                this.enhanceWithExplanation(this.currentExplanation);
            }

            // 应用生词黄色高亮
            this.applyVocabHighlights();
        },

        assignTextScopes(root, prefix, alwaysNumber = false) {
            const boundaries = 'p, li, td, th, dt, dd, h1, h2, h3, h4, h5, h6, blockquote, div, section, table, ul, ol';
            const scopes = [];
            const visit = element => {
                if (!element.querySelector(boundaries)) {
                    if (global.ReadingVocabAnchors.text(element).trim()) scopes.push(element);
                    return;
                }
                let run = [];
                const flush = () => {
                    if (!run.length) return;
                    if (run.some(node => node.textContent.trim())) {
                        const span = document.createElement('span');
                        element.insertBefore(span, run[0]);
                        span.append(...run);
                        scopes.push(span);
                    }
                    run = [];
                };
                [...element.childNodes].forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.matches(boundaries) || node.querySelector(boundaries))) {
                        flush();
                        visit(node);
                    } else run.push(node);
                });
                flush();
            };
            visit(root);
            scopes.forEach((scope, index) => {
                scope.dataset.vocabScope = alwaysNumber || scopes.length > 1 ? prefix + '/p-' + (index + 1) : prefix;
                scope.dataset.vocabSourceVersion = global.ReadingVocabAnchors.hashText(JSON.stringify(this.currentPayload));
                scope.tabIndex = 0;
            });
        },

        calculateRangeLocation(scopeElement, range) {
            return global.ReadingVocabAnchors.calculateLocation(scopeElement, range);
        },

        moveKeyboardSelection(event) {
            if (this.modalOpen || !/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(event.key)) return;
            const scope = event.target.closest('[data-vocab-scope]');
            if (!scope || event.target.closest('button, input, textarea, select, [role="button"]')) return;
            const selection = window.getSelection();
            if (!selection || typeof selection.modify !== 'function') return;
            const nodes = getTextNodes(scope);
            if (!nodes.length) return;
            if (!scope.contains(selection.anchorNode) || !scope.contains(selection.focusNode)) {
                selection.collapse(nodes[0], 0);
            }
            const previous = { anchor: selection.anchorNode, start: selection.anchorOffset,
                focus: selection.focusNode, end: selection.focusOffset };
            const forward = /^(ArrowRight|ArrowDown|End)$/.test(event.key);
            let unit = /^(ArrowUp|ArrowDown)$/.test(event.key) ? 'line' : 'character';
            if (event.ctrlKey || event.metaKey) unit = 'word';
            if (event.key === 'Home' || event.key === 'End') unit = 'lineboundary';
            event.preventDefault();
            // Static selectable text has no native caret navigation in some
            // supported browsers unless their global caret-browsing mode is on.
            selection.modify(event.shiftKey ? 'extend' : 'move', forward ? 'forward' : 'backward', unit);
            if (!scope.contains(selection.anchorNode) || !scope.contains(selection.focusNode)) {
                selection.setBaseAndExtent(previous.anchor, previous.start, previous.focus, previous.end);
            }
        },

        positionWordPanel(panel, rect) {
            if (!panel || !rect) return;
            const width = Math.min(320, window.innerWidth - 24);
            panel.style.width = `${width}px`;
            panel.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))}px`;
            const height = panel.offsetHeight;
            const below = rect.bottom + 8;
            const top = below + height <= window.innerHeight - 12 ? below : rect.top - height - 8;
            panel.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, top))}px`;
        },

        async lookupSelectedWord(word, key, requestId) {
            const overlay = this.ensureOverlay();
            const definition = overlay.querySelector('#reader-word-definition');
            const retry = overlay.querySelector('#reader-word-retry');
            definition.textContent = '正在查词…';
            retry.hidden = true;
            try {
                if (!global.ensureReadingDictionary) {
                    if (!this._dictionaryLoaderPromise) this._dictionaryLoaderPromise = new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = '/js/runtime/dictionaryLoader.js?v=' + encodeURIComponent(global.IELTS_ASSET_VERSION || 'reader-dictionary');
                        script.onload = resolve;
                        script.onerror = () => { script.remove(); this._dictionaryLoaderPromise = null; reject(new Error('dictionary unavailable')); };
                        document.head.appendChild(script);
                    });
                    await this._dictionaryLoaderPromise;
                }
                const dictionary = await global.ensureReadingDictionary();
                const entry = dictionary.lookup(word);
                if (requestId !== this._openRequestId || key !== this._dictionaryKey) return;
                const entries = entry.parts?.length ? entry.parts : [entry];
                definition.textContent = entry.found ? entries.map(item => [item.parts ? '' : item.term, item.phonetic ? `/${item.phonetic}/` : '', item.zh || item.en || '暂无释义'].filter(Boolean).join(' ')).join('\n') : '词典暂未收录这个词或短语，仍可加入生词本。';
            } catch (error) {
                if (requestId !== this._openRequestId || key !== this._dictionaryKey) return;
                definition.textContent = '词典暂时无法加载，请重试。';
                retry.hidden = false;
            }
            const selection = window.getSelection();
            if (selection?.rangeCount && key === this._dictionaryKey) this.positionWordPanel(overlay.querySelector('#reader-word-popover'), selection.getRangeAt(0).getBoundingClientRect());
        },

        noteSource() {
            return 'reading:' + String(this.currentExamId || '');
        },

        async noteRequest(action, payload) {
            const accountId = global.IELTS_ACCOUNT?.id;
            if (!accountId) throw new Error('请先登录');
            const source = this.noteSource();
            const query = action ? '' : '?subject=reading&source=' + encodeURIComponent(source);
            const response = await fetch('/api/selection-notes' + query, {
                credentials: 'same-origin',
                method: action ? 'POST' : 'GET',
                headers: { 'X-IELTS-User': accountId, ...(action ? { 'Content-Type': 'application/json' } : {}) },
                ...(action ? { body: JSON.stringify({ action, subject: 'reading', source, title: this.currentExam?.title || '', ...payload }) } : {})
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || '笔记保存失败');
            if (source !== this.noteSource()) return [];
            this._passageNotes = data.notes || [];
            paintSavedNotes(this.ensureOverlay().querySelector('#vocab-passage-content'), this._passageNotes);
            return this._passageNotes;
        },

        openNoteForm() {
            const overlay = this.ensureOverlay();
            const form = overlay.querySelector('#reader-note-form');
            const panel = overlay.querySelector('#reader-word-popover');
            form.hidden = false;
            const selection = window.getSelection();
            if (selection?.rangeCount) this.positionWordPanel(panel, selection.getRangeAt(0).getBoundingClientRect());
            overlay.querySelector('#reader-note-text').focus();
        },

        async saveSelectionNote() {
            const overlay = this.ensureOverlay();
            const input = overlay.querySelector('#reader-note-text');
            const text = input.value.trim();
            const quote = String(this._noteQuote || overlay.querySelector('#reader-word-term').textContent || '').trim();
            if (!quote || !text) return;
            const button = overlay.querySelector('#reader-note-save');
            button.disabled = true;
            button.textContent = '保存中…';
            try {
                await this.noteRequest('add', { quote, note: text });
                input.value = '';
                overlay.querySelector('#reader-note-form').hidden = true;
                this.showToast('笔记已保存');
                this.showCurrentNotes();
                if (this.modalOpen) this.renderSavedNotes();
            } catch (error) {
                this.showToast(error.message || '笔记保存失败');
            } finally {
                button.disabled = false;
                button.textContent = '保存笔记';
            }
        },

        showCurrentNotes() {
            const overlay = this.ensureOverlay();
            const list = overlay.querySelector('#reader-note-current');
            const quote = String(this._noteQuote || '');
            const paint = () => {
                list.replaceChildren();
                (this._passageNotes || []).filter(item => item.quote === quote).forEach(item => {
                    const block = document.createElement('p');
                    block.textContent = item.note;
                    block.style.margin = '0';
                    list.append(block);
                });
            };
            paint();
            this.noteRequest().then(paint).catch(() => {});
        },

        async renderSavedNotes() {
            const overlay = this.ensureOverlay();
            const list = overlay.querySelector('#reader-note-list');
            if (!list) return;
            list.textContent = '正在加载笔记…';
            try { await this.noteRequest(); }
            catch (error) { list.textContent = error.message || '笔记加载失败'; return; }
            list.replaceChildren();
            const heading = document.createElement('h3');
            heading.className = 'reader-note-heading';
            heading.textContent = '本篇笔记 · ' + this._passageNotes.length;
            list.append(heading);
            if (!this._passageNotes.length) {
                const empty = document.createElement('p');
                empty.className = 'vocab-item__context';
                empty.textContent = '这篇还没有笔记。划词后可添加。';
                list.append(empty);
                return;
            }
            this._passageNotes.forEach(item => {
                const row = document.createElement('article');
                row.className = 'vocab-item reader-note-card';
                const main = document.createElement('div');
                main.className = 'vocab-item__main';
                const word = document.createElement('div');
                word.className = 'vocab-item__word';
                word.textContent = item.quote;
                word.setAttribute('aria-label', '原文摘录');
                const text = document.createElement('p');
                text.className = 'vocab-item__context';
                text.textContent = item.note;
                const meta = document.createElement('small');
                meta.textContent = [item.title || this.currentExam?.title, item.created_at].filter(Boolean).join(' · ');
                meta.style.cssText = 'display:block;color:#64748b;margin-top:10px';
                main.append(word, text, meta);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'vocab-delete-btn';
                remove.textContent = '删除';
                remove.onclick = async () => {
                    remove.disabled = true;
                    try { await this.noteRequest('remove', { id: item.id }); this.renderSavedNotes(); this.showCurrentNotes(); }
                    catch (error) { remove.disabled = false; this.showToast(error.message || '删除失败'); }
                };
                const actions = document.createElement('div'); actions.className = 'reader-note-actions';
                const locate = document.createElement('button'); locate.type = 'button'; locate.textContent = '查看原文';
                locate.onclick = () => { if (window.innerWidth < 1100) this.closeModal(false); const target = [...overlay.querySelectorAll('[data-vocab-scope]')].find(el => el.textContent.includes(item.quote)); if (target) target.scrollIntoView({behavior:'smooth', block:'center'}); };
                actions.append(locate, remove); row.append(main, actions);
                list.append(row);
            });
        },

        async toggleAnswerPanel(history) {
            const overlay = this.ensureOverlay();
            let panel = overlay.querySelector('#reader-answer-panel');
            const showHistory = history ? panel?.dataset.history !== 'true' : panel?.dataset.history === 'true';
            if (!history && panel) {
                panel.remove();overlay.classList.remove('reader-answer-open');
                overlay.querySelectorAll('#reader-answer-split,#reader-answer-history').forEach(button=>button.setAttribute('aria-pressed','false'));
                return;
            }
            panel?.remove();
            if (this.activeTab === 'questions') this.switchViewTab('all');
            const request = this._openRequestId, examId = String(this.currentExamId);
            panel = document.createElement('aside');panel.id='reader-answer-panel';panel.dataset.history=String(showHistory);panel.setAttribute('aria-label','题目与作答');
            const header=document.createElement('header');const title=document.createElement('h3');title.textContent='题目';
            const close=document.createElement('button');close.type='button';close.textContent='关闭分屏';close.onclick=()=>this.toggleAnswerPanel(false);header.append(title,close);
            const content=document.createElement('div');content.className='reader-split-questions';
            panel.append(header,content);overlay.querySelector('#vocab-reader-scroll-area').append(panel);
            content.addEventListener('pointerup', () => setTimeout(() => this.offerSelection(), 0));overlay.classList.add('reader-answer-open');
            overlay.querySelector('#reader-answer-split').setAttribute('aria-pressed','true');overlay.querySelector('#reader-answer-history').setAttribute('aria-pressed',String(showHistory));
            const key=this.currentPayload?.answerKey||{};
            for(const [index,group] of (this.currentPayload?.questionGroups||[]).entries()) {
                const section=document.createElement('section');section.className='reader-split-group';
                section.append(createReadOnlyQuestionContent((group.leadHtml||'')+(group.bodyHtml||group.html||''),'reader-split-'+index,true));
                this.assignTextScopes(section, 'questions/q-' + (index + 1), true);content.append(section);
            }
            if(!content.childNodes.length)content.textContent='本篇暂无题目。';
            if(!showHistory)return;
            const status=document.createElement('p');status.className='reader-answer-status';status.textContent='正在读取最新历史作答…';content.prepend(status);
            try {
                const records=await global.AppData.practice.list({projection:'summary'});
                const rows=records.filter(row=>String(row.examId)===examId && row.type!=='listening');
                const timestamp=row=>{const value=row.completedAt||row.endTime||row.timestamp||row.date;const num=new Date(value||0).getTime();return Number.isFinite(num)?num:0;};
                rows.sort((a,b)=>timestamp(b)-timestamp(a));
                const record=rows[0]?await global.AppData.practice.get(rows[0].id):null;
                if(request!==this._openRequestId||!panel.isConnected)return;
                status.textContent=record?'最新作答 · '+String(record.completedAt||record.endTime||record.timestamp||''):'暂无历史作答，显示正确答案。';
                const comparison=record?.answerComparison||record?.rawData?.answerComparison||{};
                const answers=record?.answers||record?.userAnswers||record?.rawData?.answers||{};
                const display=value=>Array.isArray(value)?value.join(' / '):value==null||value===''?'未作答':typeof value==='object'?String(value.answer??value.correctAnswer??value.value??'—'):String(value);
                for(const id of [...new Set([...Object.keys(key),...Object.keys(comparison)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))) {
                    const saved=comparison[id];const note=document.createElement('span');note.className='reader-inline-answer';
                    const user=document.createElement('span');user.textContent='你的作答：'+display(saved?.userAnswer??answers[id]);
                    const correct=document.createElement('span');correct.textContent='正确答案：'+display(saved?.correctAnswer??key[id]);
                    note.append(user,correct);if(typeof saved?.isCorrect==='boolean')note.dataset.correct=String(saved.isCorrect);
                    note.dataset.question = id;
                    const number = this.currentPayload?.questionDisplayMap?.[id] || id.replace(/^q/i,'');
                    const label = document.createElement('strong');label.textContent = '第 ' + number + ' 题';note.prepend(label);
                    const anchors=[...content.querySelectorAll('[data-reader-question]')].filter(node=>node.dataset.readerQuestion===id);
                    const anchor=anchors.find(node=>node.classList.contains('vocab-answer-blank'))||anchors.find(node=>node.dataset.readerControl)||anchors[0];
                    if(anchor){
                        const control=anchor.dataset.readerControl;
                        if((control && !['radio','checkbox','button'].includes(control)) || anchor.classList.contains('vocab-answer-blank')) {
                            anchor.textContent=display(saved?.userAnswer??answers[id]);
                            anchor.classList.add('reader-filled-answer');
                        }
                        // Keep feedback within its question, after the complete stem/options.
                        if (((control && !['radio','checkbox','button'].includes(control)) || anchor.classList.contains('vocab-answer-blank')) && anchor.closest('[class*=summary],.notes-section')) {
                            // Summary blanks are inline; a full feedback card forces the answer below the sentence.
                            const inline=document.createElement('span');inline.className='reader-summary-answer';
                            inline.dataset.correct=String(saved?.isCorrect);
                            inline.textContent='正确：'+display(saved?.correctAnswer??key[id]);
                            anchor.after(inline);continue;
                        }
                        const target=anchor.closest('.question-item,.question-row') || anchor.closest('td,th,li,p') || anchor;
                        let feedback=[...target.children].find(node=>node.classList.contains('reader-question-feedback'));
                        if(!feedback){feedback=document.createElement('span');feedback.className='reader-question-feedback';target.append(feedback);}
                        feedback.append(note);
                    }
                    else {const fallback=document.createElement('div');fallback.className='reader-answer-unmapped';fallback.append(document.createTextNode('第 '+id.replace(/^q/i,'')+' 题 · '),note);content.append(fallback);}
                }
            }catch(error){if(panel.isConnected)status.textContent='读取历史作答失败，请再次点击“展示作答”重试。';}
        },

        offerSelection() {
            if (this._collectPointer != null || document.activeElement?.id === 'reader-note-text') return;
            const overlay = this.ensureOverlay();
            const button = overlay.querySelector('#reader-collect-selection');
            const panel = overlay.querySelector('#reader-word-popover');
            const noteButton = overlay.querySelector('#reader-note-selection');
            const hide = () => { panel.hidden = true; button.hidden = true; noteButton.hidden = true; overlay.querySelector('#reader-note-form').hidden = true; this._dictionaryKey = null; };
            if (overlay.classList.contains('is-hidden') || !this.currentPayload) { hide(); return; }
            const selection = window.getSelection();
            const range = selection?.rangeCount === 1 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
            const start = range?.startContainer;
            const scope = (start?.nodeType === Node.ELEMENT_NODE ? start : start?.parentElement)?.closest('[data-vocab-scope]');
            const captured = scope && (overlay.querySelector('#vocab-reader-body').contains(scope) || overlay.querySelector('#reader-answer-panel')?.contains(scope)) ? global.ReadingVocabAnchors.capture(scope, range) : null;
            if (!captured) {
                const body = overlay.querySelector('#vocab-passage-content');
                const split = overlay.querySelector('#reader-answer-panel');
                const quote = selection?.toString().trim();
                if (!range || !quote || quote.length > 4000 || !(body.contains(range.startContainer) && body.contains(range.endContainer)) && !(split?.contains(range.startContainer) && split?.contains(range.endContainer))) {hide();return;}
                panel.hidden=false;button.hidden=true;noteButton.hidden=false;this._noteQuote=quote;
                const term=overlay.querySelector('#reader-word-term');term.textContent=quote;term.title=quote;overlay.querySelector('#reader-word-definition').textContent='选中文字可添加笔记';
                this.showCurrentNotes();this.positionWordPanel(panel,range.getBoundingClientRect());return;
            }
            const pending = [...this._selectionPending].some(item => item.articleId === global.AppData.vocab.readingModel.articleId(this.currentSource, String(this.currentExamId)) && item.scopeId === captured.scopeId && captured.startOffset < item.endOffset && captured.endOffset > item.startOffset);
            panel.hidden = false;
            button.hidden = false;
            noteButton.hidden = false;
            overlay.querySelector('#reader-note-form').hidden = true;
            button.disabled = pending;
            button.textContent = pending ? '保存中…' : '收录到生词本';
            this._noteQuote = captured.word;
            this.showCurrentNotes();
            const term = overlay.querySelector('#reader-word-term');
            term.textContent = captured.word;
            term.title = captured.word;
            const key = `${this._openRequestId}:${captured.scopeId}:${captured.startOffset}:${captured.endOffset}`;
            if (key !== this._dictionaryKey) {
                this._dictionaryKey = key;
                this.lookupSelectedWord(captured.word, key, this._openRequestId);
            }
            this.positionWordPanel(panel, range.getBoundingClientRect());
        },

        selectWordAtClick(event) {
            if (event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest('button, a, input, textarea, select, summary, mark.vocab-highlight, #reader-word-popover, #vocab-occurrence-actions')) return;
            const body = event.currentTarget instanceof Element ? event.currentTarget : null;
            if (!body?.contains(target)) return;
            const selection = window.getSelection();
            if (selection?.isCollapsed && event.detail === 1) {
                const ranges = window.__ieltsNoteRanges?.get(this.ensureOverlay().querySelector('#vocab-passage-content')) || [];
                const hit = ranges.find(range => [...range.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
                if (hit) {selection.removeAllRanges();selection.addRange(hit.cloneRange());this.offerSelection();return;}
            }
            if (!selection || (selection.rangeCount === 1 && !selection.isCollapsed && selection.toString().trim())) return;
            const doc = body.ownerDocument;
            let node = null;
            let offset = 0;
            const point = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
            if (point) {
                node = point.startContainer;
                offset = point.startOffset;
            } else if (doc.caretPositionFromPoint) {
                const position = doc.caretPositionFromPoint(event.clientX, event.clientY);
                node = position?.offsetNode || null;
                offset = position?.offset || 0;
            }
            if (!node || node.nodeType !== Node.TEXT_NODE || !body.contains(node)) return;
            const text = node.nodeValue || '';
            const isWord = character => /[A-Za-z\u00C0-\u024F'’-]/.test(character);
            if (offset > 0 && offset < text.length && !isWord(text[offset]) && isWord(text[offset - 1])) offset -= 1;
            if (offset >= text.length) offset = text.length - 1;
            if (offset < 0 || !isWord(text[offset] || '')) return;
            let start = offset;
            let end = offset + 1;
            while (start > 0 && isWord(text[start - 1])) start -= 1;
            while (end < text.length && isWord(text[end])) end += 1;
            const range = doc.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            selection.removeAllRanges();
            selection.addRange(range);
            this.offerSelection();
        },

        restoreCollectRange() {
            const range = this._collectRange;
            if (!range) return;
            const selection = window.getSelection();
            if (!selection) return;
            if (selection.rangeCount === 1 && !selection.isCollapsed && selection.toString().trim()) return;
            selection.removeAllRanges();
            try { selection.addRange(range); } catch (error) {}
        },

        async captureSelection() {
            const overlay = this.ensureOverlay();
            if (overlay.classList.contains('is-hidden') || !this.currentPayload) return;
            const selection = window.getSelection();
            if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
            const range = selection.getRangeAt(0);
            const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
            const scope = start?.closest('[data-vocab-scope]');
            if (!scope || !(overlay.querySelector('#vocab-reader-body')?.contains(scope) || overlay.querySelector('#reader-answer-panel')?.contains(scope))) return;
            const captured = global.ReadingVocabAnchors.capture(scope, range);
            if (!captured) return;
            const requestId = this._openRequestId;
            // Pending saves have no paint yet, so reserve their text intervals
            // until acknowledgement to prevent invisible overlapping captures.
            const articleId = global.AppData.vocab.readingModel.articleId(this.currentSource, String(this.currentExamId));
            const pendingSelection = { articleId, scopeId: captured.scopeId,
                startOffset: captured.startOffset, endOffset: captured.endOffset };
            if ([...this._selectionPending].some(pending => pending.articleId === articleId &&
                pending.scopeId === captured.scopeId && captured.startOffset < pending.endOffset &&
                captured.endOffset > pending.startOffset)) return;
            this._selectionPending.add(pendingSelection);
            this.offerSelection();
            this.showToast('正在保存…');
            try {
                const result = await ReadingVocabStore.add(captured.word, this.currentExamId,
                    this.currentExam?.title || '', captured.context, captured, this.currentSource, this.currentContentRef);
                if (requestId !== this._openRequestId) return;
                if (!result.added) throw new Error('Selection was not saved');
                // Clear only this submitted selection; a later selection belongs to the user.
                const current = selection.rangeCount === 1 ? selection.getRangeAt(0) : null;
                const currentCapture = current && scope.isConnected ? global.ReadingVocabAnchors.capture(scope, current) : null;
                if (currentCapture?.scopeId === captured.scopeId && currentCapture.startOffset === captured.startOffset && currentCapture.endOffset === captured.endOffset) selection.removeAllRanges();
                this.applyVocabHighlights();
                this.updateCounts();
                if (this.modalOpen) this.renderVocabList();
                this.showToast('✅ "' + captured.word + '" 已收录并黄色高亮');
            } catch (error) {
                if (requestId === this._openRequestId) this.showSaveError(error, '保存失败，请重新划选重试');
            } finally {
                this._selectionPending.delete(pendingSelection);
                if (requestId === this._openRequestId) this.offerSelection();
            }
        },

        wrapRangeWithHighlight(range, word, occurrenceId) {
            if (!range || range.collapsed) return false;
            // Wrap each text fragment separately so repeated restore never splits,
            // extracts, or rewrites the source's inline formatting or annotations.
            const fragments = getTextNodes(range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer)
                .filter(node => range.intersectsNode(node)).map(node => ({ node,
                    start: node === range.startContainer ? range.startOffset : 0,
                    end: node === range.endContainer ? range.endOffset : node.length
                })).filter(fragment => fragment.end > fragment.start);
            for (const fragment of fragments.reverse()) {
                const selected = document.createRange();
                selected.setStart(fragment.node, fragment.start);
                selected.setEnd(fragment.node, fragment.end);
                const mark = document.createElement('mark');
                mark.className = 'vocab-highlight';
                mark.dataset.word = word;
                mark.dataset.occurrenceId = occurrenceId;
                mark.tabIndex = 0;
                mark.setAttribute('role', 'button');
                mark.title = '生词本: ' + word + '（查看或移除这一处）';
                selected.surroundContents(mark);
            }
            return fragments.length > 0;
        },

        applyVocabHighlights() {
            const overlay = this.ensureOverlay();
            const selection = window.getSelection();
            const selected = selection?.rangeCount === 1 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
            const node = selected?.startContainer;
            const scope = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('[data-vocab-scope]');
            const savedSelection = scope && overlay.contains(scope) ? global.ReadingVocabAnchors.capture(scope, selected) : null;
            this.removeVocabHighlights(overlay.querySelector('#vocab-reader-body'));
            this.unresolvedOccurrences = [];
            if (this.currentExamId) {
                ReadingVocabStore.getByExam(this.currentExamId, this.currentSource).forEach(item => {
                    item.occurrences.forEach(occurrence => {
                        if (!this.restoreVocabHighlight(overlay, occurrence, item.word)) {
                            this.unresolvedOccurrences.push({ ...occurrence, word: item.word });
                        }
                    });
                });
            }
            paintSavedNotes(overlay.querySelector('#vocab-passage-content'), this._passageNotes || []);
            this.renderAnchorStatus();
            if (savedSelection) {
                const restored = this.resolveRangeForHighlight(overlay.querySelector('#vocab-reader-body'), savedSelection);
                if (restored) { selection.removeAllRanges(); selection.addRange(restored); }
            }
        },

        restoreVocabHighlight(overlay, occurrence, word) {
            if (!this.currentPayload) return false;
            const range = this.resolveRangeForHighlight(overlay.querySelector('#vocab-reader-body'), occurrence);
            return !!range && this.wrapRangeWithHighlight(range, word || occurrence.quote, occurrence.id);
        },

        resolveRangeForHighlight(root, occurrence) {
            return global.ReadingVocabAnchors.resolve(root, occurrence);
        },

        showOccurrenceActions(mark) {
            const actions = this.ensureOverlay().querySelector('#vocab-occurrence-actions');
            actions.innerHTML = '<span>' + escapeHtml(mark.dataset.word) + '</span> <button type="button" data-action="remove-occurrence" data-occurrence-id="'
                + escapeHtml(mark.dataset.occurrenceId) + '">取消此处高亮</button>';
            this._activeOccurrenceMark = mark;
            this.positionWordPanel(actions, mark.getBoundingClientRect());
            actions.querySelector('button').focus({ preventScroll: true });
        },

        renderAnchorStatus() {
            const status = this.ensureOverlay().querySelector('#vocab-anchor-status');
            if (!status) return;
            status.replaceChildren();
            if (!this.unresolvedOccurrences.length) return;
            const message = document.createElement('span');
            message.textContent = this.unresolvedOccurrences.length + ' 处原文暂时无法定位，生词仍保留。可重试加载，或在生词本移除旧位置后重新划选。';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.dataset.action = 'retry-anchors';
            retry.textContent = '重试定位';
            status.append(message, retry);
        },

        async removeOccurrence(occurrenceId) {
            if (this._occurrenceBusy) return;
            const item = ReadingVocabStore.getAll()
                .find(row => row.occurrences.some(occurrence => occurrence.id === occurrenceId));
            const occurrence = item?.occurrences.find(row => row.id === occurrenceId);
            if (!occurrence) return;
            const owner = ReadingVocabStore.getOccurrenceOwner(occurrence);
            if (!owner) return;
            const requestId = this._openRequestId;
            const undo = { source: owner.source, article: owner.article,
                word: { word: item.word, meaning: item.meaning || '待补充释义', example: item.context || '' },
                occurrence: { ...occurrence }, manual: false };
            const observed = { revision: ReadingVocabStore._state.revision, generation: ReadingVocabStore._state.generation };
            this._occurrenceBusy = true;
            this.showToast('正在保存…');
            try {
                const result = await ReadingVocabStore.mutate('removeOccurrence', { occurrenceId }, observed);
                if (requestId !== this._openRequestId) return;
                // Keep the acknowledged deletion fence: a later clear/replace must
                // reject this undo instead of resurrecting deleted relationships.
                const committedRevision = result.revisions?.['vocab.readingState'];
                this._undoOccurrence = !owner.contentAmbiguous && result.changed !== false && Number.isInteger(committedRevision)
                    ? { command: undo, observed: { revision: committedRevision, generation: observed.generation } } : null;
                const actionPanel = this.ensureOverlay().querySelector('#vocab-occurrence-actions');
                const actionRect = actionPanel.getBoundingClientRect();
                actionPanel.replaceChildren();
                this.ensureOverlay().querySelector('#vocab-occurrence-undo').innerHTML =
                    this._undoOccurrence ? '<span>已移除这一处高亮</span> <button type="button" data-action="undo-occurrence">撤销</button>' : '';
                const undoPanel = this.ensureOverlay().querySelector('#vocab-occurrence-undo');
                this.positionWordPanel(undoPanel, { left: actionRect.left, top: actionRect.top, bottom: actionRect.top - 8 });
                this.applyVocabHighlights();
                this.updateCounts();
                if (this.modalOpen) this.renderVocabList();
                this.showToast('已取消高亮，可点击撤销恢复');
            } catch (error) {
                if (requestId === this._openRequestId) this.showSaveError(error, '移除失败，请重试');
            } finally {
                if (requestId === this._openRequestId) this._occurrenceBusy = false;
            }
        },

        async undoOccurrence() {
            if (this._occurrenceBusy || !this._undoOccurrence) return;
            const requestId = this._openRequestId;
            const undo = this._undoOccurrence;
            this._occurrenceBusy = true;
            this.showToast('正在保存…');
            try {
                await ReadingVocabStore.mutate('collect', { ...undo.command, at: new Date().toISOString() }, undo.observed);
                if (requestId !== this._openRequestId) return;
                this._undoOccurrence = null;
                this.ensureOverlay().querySelector('#vocab-occurrence-undo').replaceChildren();
                this.applyVocabHighlights();
                this.updateCounts();
                if (this.modalOpen) this.renderVocabList();
                this.showToast('已撤销移除');
            } catch (error) {
                if (requestId === this._openRequestId) this.showSaveError(error, '撤销失败，数据可能已更改；可重试或重新划选');
            } finally {
                if (requestId === this._openRequestId) this._occurrenceBusy = false;
            }
        },

        removeVocabHighlights(container) {
            if (!container) return;
            const marks = container.querySelectorAll('mark.vocab-highlight');
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    while (mark.firstChild) {
                        parent.insertBefore(mark.firstChild, mark);
                    }
                    parent.removeChild(mark);
                    parent.normalize();
                }
            });
        },

        removeVocabHighlightForWord(word) {
            const overlay = this.ensureOverlay();
            if (!overlay || !word) return;
            const lower = String(word).trim().toLowerCase();
            const marks = overlay.querySelectorAll('mark.vocab-highlight');
            marks.forEach(mark => {
                const markWord = (mark.dataset.word || mark.textContent || '').trim().toLowerCase();
                if (markWord === lower) {
                    const parent = mark.parentNode;
                    if (parent) {
                        while (mark.firstChild) {
                            parent.insertBefore(mark.firstChild, mark);
                        }
                        parent.removeChild(mark);
                        parent.normalize();
                    }
                }
            });
        },

        enhanceWithExplanation(explanation) {
            if (!explanation || !Array.isArray(explanation.passageNotes)) return;
            const overlay = this.ensureOverlay();
            explanation.passageNotes.forEach(note => {
                const match = note.label ? note.label.match(/Paragraph\s+([A-Z])/i) : null;
                if (match) {
                    const letter = match[1].toUpperCase();
                    const cards = [...overlay.querySelectorAll('.vocab-paragraph-card')].filter(card => card.dataset.letter === letter);
                    const transEl = cards.length === 1 ? cards[0].querySelector('.vocab-trans-text') : null;
                    if (transEl) {
                        transEl.textContent = note.text || '';
                    }
                }
            });
        },

        applyReadingSize() {
            const overlay = this.ensureOverlay();
            const size = this._readerFontSize || 18;
            overlay.style.setProperty('--reader-text-size', `${size}px`);
            overlay.querySelector('#reader-font-size').textContent = size;
            overlay.querySelector('[data-reader-size="-1"]').disabled = size <= 16;
            overlay.querySelector('[data-reader-size="1"]').disabled = size >= 24;
        },

        updateReadingProgress() {
            const overlay = this.ensureOverlay();
            const area = overlay.querySelector('#vocab-reader-scroll-area');
            const range = area.scrollHeight - area.clientHeight;
            const progress = range > 0 ? Math.min(100, Math.round(area.scrollTop / range * 100)) : 100;
            overlay.querySelector('#reader-progress').textContent = `阅读进度 ${progress}%`;
        },

        switchViewTab(target) {
            const overlay = this.ensureOverlay();
            const area = overlay.querySelector('#vocab-reader-scroll-area');
            this._tabScrollPositions ||= {};
            if (this.activeTab) this._tabScrollPositions[this.activeTab] = area.scrollTop;
            this.activeTab = target;
            overlay.querySelectorAll('.vocab-tab-btn').forEach(button => {
                const active = button.dataset.para === target;
                button.classList.toggle('active', active);
                button.setAttribute('role', 'tab');
                button.setAttribute('aria-selected', String(active));
            });
            overlay.querySelector('#vocab-passage-section').style.display = target === 'questions' ? 'none' : 'block';
            overlay.querySelector('#vocab-questions-section').style.display = target === 'all' || target === 'questions' ? 'block' : 'none';
            overlay.querySelectorAll('.vocab-paragraph-card').forEach(card => {
                card.style.display = target === 'all' || target === 'questions' || card.dataset.paragraphId === target ? 'block' : 'none';
            });
            area.scrollTop = this._tabScrollPositions[target] || 0;
            this.updateReadingProgress();
        },

        updateCounts() {
            const overlay = this.ensureOverlay();
            const examId = this.currentExamId;
            const currentList = this._sourceReady ? ReadingVocabStore.getByExam(examId, this.currentSource) : [];
            const allList = ReadingVocabStore.getAll();

            const headerCount = overlay.querySelector('#vocab-header-count');
            const fabCount = overlay.querySelector('#vocab-fab-count');
            const tabCurrentCount = overlay.querySelector('#v-count-current');
            const tabAllCount = overlay.querySelector('#v-count-all');

            const countToShow = currentList.length;
            if (headerCount) headerCount.textContent = countToShow;
            if (fabCount) fabCount.textContent = countToShow;
            if (tabCurrentCount) tabCurrentCount.textContent = currentList.length;
            if (tabAllCount) tabAllCount.textContent = allList.length;
        },

        renderVocabList() {
            const overlay = this.ensureOverlay();
            const listEl = overlay.querySelector('#vocab-list');
            if (!listEl) return;

            const isCurrent = this.modalTab === 'current';
            const exportLabel = overlay.querySelector('#vocab-export-btn span');
            if (exportLabel) exportLabel.textContent = isCurrent ? '导出本篇 TXT' : '导出全部 TXT';
            const list = isCurrent
                ? (this._sourceReady ? ReadingVocabStore.getByExam(this.currentExamId, this.currentSource) : [])
                : ReadingVocabStore.getAll();

            if (!list || list.length === 0) {
                listEl.innerHTML = `
                    <div class="vocab-empty-box">
                        <div class="vocab-empty-icon">📝</div>
                        <p class="vocab-empty-title">暂无生词</p>
                        <p class="vocab-empty-desc">在正文中选择词语，查看释义后点击“收录到生词本”。</p>
                    </div>
                `;
                return;
            }

            let html = '';
            const unresolved = new Set(this.unresolvedOccurrences.map(row => row.id));
            const currentArticleId = this.currentExamId
                ? global.AppData.vocab.readingModel.articleId(this.currentSource, String(this.currentExamId)) : null;
            list.forEach(item => {
                const occurrenceRows = item.occurrences.map(occurrence => {
                    const owner = ReadingVocabStore.getOccurrenceOwner(occurrence);
                    const status = owner?.articleId === currentArticleId
                        ? (unresolved.has(occurrence.id) ? 'unresolved' : 'resolved') : 'unverified';
                    return '<div class="vocab-occurrence-row" data-occurrence-id="'
                        + escapeHtml(occurrence.id) + '" data-anchor-status="' + status + '">'
                        + (!isCurrent && owner ? '<span class="vocab-item__source">'
                            + escapeHtml(owner.article.title || owner.article.examId) + '</span>' : '')
                        + '<span>' + escapeHtml(occurrence.before + occurrence.quote + occurrence.after) + '</span>'
                        + (status === 'unresolved' ? '<strong>原文位置无法定位，生词已保留</strong>' : '')
                        + '<button type="button" data-action="remove-occurrence" data-occurrence-id="' + escapeHtml(occurrence.id)
                        + '">移除这一处</button></div>';
                }).join('');
                html += `
                    <div class="vocab-item" data-word-id="${escapeHtml(item.id)}">
                        <div class="vocab-item__main">
                            <div class="vocab-item__header">
                                <span class="vocab-item__word">${escapeHtml(item.word)}</span>
                                <button type="button" class="vocab-speak-btn" data-speak-word="${escapeHtml(item.word)}" title="发音">🔊</button>
                            </div>
                            ${item.meaning && item.meaning !== '待补充释义' ? `<p class="vocab-item__meaning">${escapeHtml(item.meaning)}</p>` : ''}
                            ${!item.occurrences.length && item.context ? `<p class="vocab-item__context">"${escapeHtml(item.context)}"</p>` : ''}
                            ${occurrenceRows}
                            ${!isCurrent && item.examTitle ? `<span class="vocab-item__source">${escapeHtml(item.examTitle)}</span>` : ''}
                        </div>
                        <button type="button" class="vocab-delete-btn" data-del-id="${escapeHtml(item.id)}" title="移出生词本">删除</button>
                    </div>
                `;
            });

            listEl.innerHTML = html;

        },

        openModal() {
            const overlay = this.ensureOverlay();
            this.bindEvents(overlay);
            const modal = overlay.querySelector('#vocab-modal');
            if (modal) {
                if (!this.modalOpen) this._modalReturnFocus = document.activeElement;
                this.modalOpen = true;
                this.updateCounts();
                this.renderVocabList();
                this.renderSavedNotes();
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
                modal.querySelector('#vocab-modal-close')?.focus({ preventScroll: true });
                overlay.querySelector('#reader-word-popover').hidden = true;
            }
        },

        closeModal(restoreFocus = true) {
            const overlay = document.getElementById('reading-vocab-reader-overlay');
            const modal = overlay?.querySelector('#vocab-modal');
            const wasOpen = this.modalOpen;
            this.modalOpen = false;
            if (modal) {
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
            }
            if (wasOpen && restoreFocus && this._modalReturnFocus?.isConnected) {
                this._modalReturnFocus.focus({ preventScroll: true });
            }
            this._modalReturnFocus = null;
        },

        showSaveError(error, retryMessage) {
            this.showToast(error?.code === 'BACKEND_UNAVAILABLE'
                ? '存储暂不可用，请刷新页面后重试' : retryMessage);
        },

        showToast(msg) {
            const overlay = this.ensureOverlay();
            const toast = overlay.querySelector('#vocab-toast');
            if (!toast) return;

            toast.textContent = msg;
            toast.classList.add('show');

            clearTimeout(this.toastTimer);
            this._pendingTimers.delete(this.toastTimer);
            this.toastTimer = this.defer(() => {
                toast.classList.remove('show');
            }, 2000);
        },

        close() {
            ++this._openRequestId;
            const overlay = document.getElementById('reading-vocab-reader-overlay');
            this.clearPendingWork(overlay);
            this.closeModal(false);
            this.unbindEvents();
            if (overlay) {
                overlay.classList.add('is-hidden');
                overlay.setAttribute('aria-hidden', 'true');
            }
            document.body.classList.remove('vocab-reader-open');
            if (this._returnFocus?.isConnected) this._returnFocus.focus({ preventScroll: true });
            else if (this._openOptions?.fromView === 'bookshelf') {
                const card = [...document.querySelectorAll('[data-article-id]')]
                    .find(element => element.dataset.articleId === this._openOptions.articleId);
                (card?.querySelector('button[data-action="open-reading-vocab"]')
                    || document.querySelector('[data-action="open-global-notebook"]'))?.focus({ preventScroll: true });
            }
            this._returnFocus = null;
        }
    };

    // 监听生词更新事件以即时刷新打开的视图
    if (typeof window !== 'undefined') {
        window.addEventListener('reading-vocab-store-updated', () => {
            if (ReadingVocabReader._sourceReady && !document.getElementById('reading-vocab-reader-overlay')?.classList.contains('is-hidden')) {
                ReadingVocabReader.updateCounts();
                ReadingVocabReader.applyVocabHighlights();
                if (ReadingVocabReader.modalOpen) ReadingVocabReader.renderVocabList();
            }
        });
    }

    // 暴露全局命名空间
    global.ReadingVocabStore = ReadingVocabStore;
    global.ReadingVocabReader = ReadingVocabReader;
    global.openReadingVocabReader = function(examId, options = {}) {
        return ReadingVocabReader.open(examId, options);
    };

    // Data is loaded by open()/notebook mount, never by script evaluation.

})(typeof window !== 'undefined' ? window : globalThis);
