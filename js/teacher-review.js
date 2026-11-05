(async function () {
    'use strict';
    const params = new URLSearchParams(location.search);
    const userId = params.get('teacherUser'), recordId = params.get('teacherRecord');
    if (!userId || !recordId) return;
    const panel = document.createElement('section');
    panel.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f3f6f3;display:flex;flex-direction:column';
    const bar = document.createElement('header');
    bar.style.cssText = 'padding:12px 20px;display:flex;gap:20px;align-items:center;background:#245940;color:white';
    const back = document.createElement('a');
    back.href='/adminset';back.textContent='返回教师后台';back.style.color='white';
    const status = document.createElement('span');status.textContent='学生作答加载中，请稍等…';
    bar.append(back,status);panel.append(bar);document.body.append(panel);
    try {
        const response = await fetch('/api/admin/data?user='+encodeURIComponent(userId), {headers:{'X-IELTS-User':window.IELTS_ACCOUNT?.id || ''}});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '无法读取学生记录');
        const student = data.users[0];
        const summary = student.practice.find(r=>String(r.id)===recordId);
        if (!summary) throw new Error('这条练习记录已不存在');
        const detail = student.details.find(r=>String(r.recordId)===recordId) || {};
        const annotations = student.annotations.find(r=>String(r.recordId)===recordId) || {};
        const record = {...summary,...detail,...annotations,id:recordId};
        const deadline = Date.now()+60000;
        while (!window.AppLazyLoader?.ensureGroup) {
            if (Date.now()>deadline) throw new Error('题库加载超时，请刷新重试');
            await new Promise(resolve=>setTimeout(resolve,200));
        }
        await window.AppLazyLoader.ensureGroup('browse-runtime');
        while (!window.app?.isInitialized || !window.app?.openPracticeRecordReplay || !window.resolveExamForPracticeRecord) {
            if (Date.now()>deadline) throw new Error('题库加载超时，请刷新重试');
            await new Promise(resolve=>setTimeout(resolve,200));
        }
        const frame = document.createElement('iframe');
        frame.title = '学生作答只读回放';frame.style.cssText='flex:1;width:100%;border:0;background:white';
        panel.append(frame);
        await window.app.openPracticeRecordReplay(record,{teacherReview:true,reuseWindow:frame.contentWindow});
        status.textContent=student.name+' · '+(record.title||record.examId)+' · 只读作答回放';
    } catch (error) {
        status.textContent=error.message+'；请返回后台重试。';
    }
})();
