(() => {
    let current = null, next = 0;
    const tracked = new WeakMap();
    function render() {
        let toast = document.getElementById('ielts-action-loading');
        if (!toast && document.body) {
            toast = document.createElement('div');
            toast.id = 'ielts-action-loading';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);z-index:100010;padding:12px 20px;border-radius:12px;background:#245940;color:#fff;box-shadow:0 4px 25px #0002;pointer-events:none;font:14px system-ui';
            document.body.appendChild(toast);
        }
        if (toast) {
            toast.hidden = !current;
            toast.textContent = current ? '◌ ' + current.label : '';
        }
    }
    function finish(action) {
        clearTimeout(action.timer);
        action.timer = setTimeout(() => {
            if (action.pending || current !== action) return;
            action.element?.removeAttribute('aria-busy');
            current = null; render();
        }, 400);
    }
    function watch(value, action = current) {
        if (!action || !value || typeof value.then !== 'function') return value;
        action.pending++; clearTimeout(action.timer);
        Promise.resolve(value).then(() => {}, () => {}).finally(() => {
            action.pending--; finish(action);
        });
        return value;
    }
    function wrap(fn) {
        if (tracked.has(fn)) return tracked.get(fn);
        const wrapped = function(...args) {
            const action = current;
            const result = fn.apply(this, args);
            return watch(result, action);
        };
        tracked.set(fn, wrapped); tracked.set(wrapped, wrapped);
        return wrapped;
    }
    function wrapActions() {
        for (const [name, fn] of Object.entries(window)) {
            if (/^(delete|bulkDelete|clearPractice|export|import|refresh|loadMore)/.test(name) && typeof fn === 'function') {
                try { window[name] = wrap(fn); } catch (_) {}
            }
        }
        if (window.AppActions) {
            for (const [name, fn] of Object.entries(window.AppActions)) {
                if (typeof fn === 'function') { try { window.AppActions[name] = wrap(fn); } catch (_) {} }
            }
        }
    }
    const nativeFetch = window.fetch.bind(window);
    window.IELTSActivityTrack = watch;
    window.fetch = (...args) => watch(nativeFetch(...args));
    addEventListener('click', event => {
        const element = event.target.closest?.('button,[role="button"],a[data-action],input[type="button"],input[type="submit"]');
        if (!element || element.disabled) return;
        if (current?.element === element && current.pending) {
            event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        current?.element?.removeAttribute('aria-busy');
        const label = (element.textContent || element.getAttribute('aria-label') || '').trim();
        current = { id: ++next, element, pending:0, label: /删除|清除/.test(label) ? '正在删除，请稍等…'
            : /导出/.test(label) ? '正在导出，请稍等…' : /导入/.test(label) ? '正在导入，请稍等…' : '加载中，请稍等…' };
        element.setAttribute('aria-busy','true');
        wrapActions(); render(); finish(current);
    }, true);
    addEventListener('DOMContentLoaded', wrapActions);
    new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
            if (node.tagName !== 'SCRIPT' || !node.src) continue;
            const task = new Promise(resolve => {
                node.addEventListener('load', () => {wrapActions();resolve();},{once:true});
                node.addEventListener('error', resolve,{once:true});
            });
            watch(task);
        }
    }).observe(document.documentElement,{childList:true,subtree:true});
})();
