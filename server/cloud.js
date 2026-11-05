(() => {
    'use strict';
    const account = window.IELTS_ACCOUNT;
    const prefix = 'account:' + account.id + ':';
    // Keep every legacy cache and preference scoped to the signed-in account.
    for (const kind of ['localStorage', 'sessionStorage']) {
        const native = window[kind];
        const keys = () => Object.keys(native).filter(k => k.startsWith(prefix));
        const api = {
            getItem: key => native.getItem(prefix + key),
            setItem: (key, value) => native.setItem(prefix + key, value),
            removeItem: key => native.removeItem(prefix + key),
            clear: () => keys().forEach(k => native.removeItem(k)),
            key: index => keys()[index]?.slice(prefix.length) ?? null,
            get length() { return keys().length; }
        };
        Object.defineProperty(window, kind, {value: new Proxy(api, {
            get: (obj, key) => key in obj ? obj[key] : typeof key === 'string' ? api.getItem(key) : undefined,
            set: (_, key, value) => { api.setItem(key, value); return true; },
            ownKeys: () => keys().map(k => k.slice(prefix.length)),
            getOwnPropertyDescriptor: () => ({enumerable:true, configurable:true})
        })});
    }
    for (const method of ['open', 'deleteDatabase']) {
        const original = indexedDB[method].bind(indexedDB);
        indexedDB[method] = (name, ...args) => original(prefix + name, ...args);
    }
    const NativeChannel = window.BroadcastChannel;
    if (NativeChannel) window.BroadcastChannel = class extends NativeChannel {
        constructor(name) { super(prefix + name); }
    };
    async function call(method, body, query = '') {
        for (let attempt = 0; attempt < 3; attempt++) {
        try {
        const response = await fetch('/api/state' + query, {
            method, headers: {'Content-Type':'application/json', 'X-IELTS-User':account.id},
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(45000)
        });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = Error(value.error || '服务器连接失败');
            error.status = response.status;
            error.cloudTransient = response.status === 429 || response.status >= 500;
            throw error;
        }
        return value;
        } catch (error) {
            if (!error.status) error.cloudTransient = true;
            if (!error.cloudTransient || attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
        }
    }
    function execute(data, stores, work, operations, loadRows) {
        return new Promise((resolve, reject) => {
            let pending = 0, value, failed = false, scheduled = false;
            const maps = Object.fromEntries(stores.map(store => [store, new Map(
                (data[store] || []).map(row => [row.logicalKey ?? row.recordId, row])
            )]));
            const known = new Set();
            const complete = new Set();
            if (!loadRows) for (const store of stores) complete.add(store);
            function fail(error) { if (!failed) { failed = true; reject(error || Error('数据操作已取消')); } }
            function finish() {
                if (scheduled) return;
                scheduled = true;
                queueMicrotask(() => {
                    scheduled = false;
                    if (pending || failed) return;
                    for (const [store, map] of Object.entries(maps)) data[store] = [...map.values()];
                    resolve(value);
                });
            }
            function deliver(req, row) {
                try {
                    if (failed) return;
                    req.result = row === undefined ? undefined : structuredClone(row);
                    req.onsuccess?.({target:req});
                } catch (error) { fail(error); }
            }
            function answer(req, producer) {
                pending++;
                Promise.resolve().then(producer).then(row => deliver(req, row)).catch(fail).finally(() => { pending--; finish(); });
                return req;
            }
            const bucket = [];
            let bucketPromise = null;
            function remember(rowsByStore, requested) {
                for (const item of requested) {
                    if (item.all) {
                        maps[item.store].clear();
                        complete.add(item.store);
                    }
                }
                for (const [store, rows] of Object.entries(rowsByStore || {})) {
                    const map = maps[store];
                    if (!map) continue;
                    for (const row of rows || []) map.set(row.logicalKey ?? row.recordId, row);
                }
                for (const item of requested) known.add(item.store + '\0' + item.key);
            }
            function loadKey(store, key, all) {
                const id = store + '\0' + (all ? '*' : key);
                if (!all && (complete.has(store) || known.has(id))) return Promise.resolve(maps[store].get(key));
                if (all && complete.has(store)) return Promise.resolve([...maps[store].values()]);
                return new Promise((resolveKey, rejectKey) => {
                    bucket.push({store, key, all, resolve: resolveKey, reject: rejectKey});
                    if (bucketPromise) return;
                    bucketPromise = Promise.resolve().then(() => {
                        const items = bucket.splice(0);
                        bucketPromise = null;
                        return loadRows(items).then(rows => {
                            remember(rows, items);
                            for (const item of items) item.resolve(item.all ? [...maps[item.store].values()] : maps[item.store].get(item.key));
                        }).catch(error => { for (const item of items) item.reject(error); });
                    });
                });
            }
            const tx = {
                abort: () => fail(Error('数据操作已取消')),
                objectStore(store) {
                    const map = maps[store];
                    if (!map) throw Error('无效数据表');
                    return {
                        get: key => answer({}, () => loadRows ? loadKey(store, key, false) : map.get(key)),
                        getAll: () => answer({}, () => loadRows ? loadKey(store, '*', true) : [...map.values()]),
                        put(row) { const next=structuredClone(row); operations.push({store,type:'put',value:next}); const id=next.logicalKey ?? next.recordId; map.set(id, next); known.add(store + '\0' + id); return answer({}, () => id); },
                        delete(key) { operations.push({store,type:'delete',key}); map.delete(key); known.add(store + '\0' + key); return answer({}, () => undefined); },
                        clear() { operations.push({store,type:'clear'}); map.clear(); complete.add(store); return answer({}, () => undefined); }
                    };
                }
            };
            try { work(tx, result => { value = result; }, fail); finish(); }
            catch (error) { fail(error); }
        });
    }
    const transaction = async (stores, mode, work, description) => {
        const query = new URLSearchParams({stores:stores.join(',')});
        if (mode === 'readonly' && stores.length === 1 && ['documents','system'].includes(stores[0])
            && description?.startsWith('read ') && !description.includes('/'))
            query.set('key', description.slice(5));
        if (mode === 'readonly' && description?.startsWith('read practice snapshot/')
            && stores.every(store => ['practiceSummaries','practiceDetails','practiceAnnotations'].includes(store)))
            query.set('key', description.slice('read practice snapshot/'.length));
        for (let attempt = 0; attempt < 12; attempt++) {
            let version = null;
            const loadRows = async items => {
                const data = {};
                const full = [...new Set(items.filter(item => item.all).map(item => item.store))];
                const picked = items.filter(item => !item.all && !full.includes(item.store));
                const take = async params => {
                    const state = await call('GET', undefined, '?' + params);
                    if (version === null) version = state.version;
                    for (const [store, rows] of Object.entries(state.data || {})) data[store] = (data[store] || []).concat(rows || []);
                };
                if (full.length) await take(new URLSearchParams({stores: full.join(',')}));
                if (picked.length) {
                    const params = new URLSearchParams({stores: [...new Set(picked.map(item => item.store))].join(',')});
                    for (const item of picked) params.append('pick', item.store + '::' + item.key);
                    await take(params);
                }
                return data;
            };
            const operations = [];
            const preloaded = mode === 'readonly' ? await call('GET', undefined, '?' + query) : {data:{}};
            const result = await execute(preloaded.data, stores, work, operations, mode === 'readonly' ? null : loadRows);
            if (mode === 'readonly') return result;
            if (version === null) version = (await call('GET', undefined, '?' + new URLSearchParams({stores:stores[0]}))).version;
            try { await call('PUT', {version, operations}); return result; }
            catch (error) {
                if (error.status !== 409 || error.message.includes('账号')) throw error;
                await new Promise(resolve => setTimeout(resolve, 25 + Math.random() * 100));
            }
        }
        throw Object.assign(Error('其他设备正在更新数据，请稍后重试'), {code:'CONFLICT'});
    };
    let writeQueue = Promise.resolve();
    window.IELTSCloudTransaction = (stores, mode, work, description) => {
        const track = promise => window.IELTSActivityTrack ? window.IELTSActivityTrack(promise) : promise;
        if (mode === 'readonly') return track(transaction(stores, mode, work, description));
        // A background Safari tab can suspend while holding a Web Lock.
        // Serialize this tab locally; the server's version check and 409 retry
        // already serialize writes across tabs/devices without a browser lock.
        const run = () => transaction(stores, mode, work, description);
        const result = writeQueue.then(run, run);
        writeQueue = result.catch(() => {});
        return track(result);
    };
    addEventListener('DOMContentLoaded', () => {
        if (window !== window.top) return;
        if (document.getElementById('submit-btn') || document.documentElement.dataset.listeningWrapper === 'true') return;
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;right:16px;bottom:12px;z-index:99999;background:#fff;color:#245940;border:1px solid #cbd8cf;border-radius:10px;padding:8px 12px;font:12px system-ui;box-shadow:0 2px 15px #0001';
        const label = document.createElement('span');
        label.textContent = account.name + ' · 云端保存 ';
        const button = document.createElement('button');
        button.textContent = '退出登录';
        button.style.cssText = 'border:0;background:transparent;color:#245940;cursor:pointer;text-decoration:underline';
        button.onclick = async () => {
            button.disabled = true;
            try {
                const response = await fetch('/api/logout', {method:'POST', headers:{'Content-Type':'application/json','X-IELTS-User':account.id}, body:'{}'});
                if (!response.ok) throw Error('退出失败，请刷新重试');
                location.replace('/login');
            } catch (error) { alert(error.message); button.disabled=false; }
        };
        bar.append(label, button); document.body.append(bar);
    });
})();
