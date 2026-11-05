"""Teacher-facing aggregates; timestamps are grouped in Asia/Shanghai."""
from datetime import datetime, timezone, timedelta
import json, math, re
TZ = timezone(timedelta(hours=8))
def number(v):
    try:
        v=float(v)
        return max(0,v) if math.isfinite(v) else 0
    except (TypeError,ValueError): return 0

def day(record):
    for field in ('completedAt','endTime','timestamp','date','startTime'):
        v=record.get(field)
        if not v: continue
        try:
            if isinstance(v,(int,float)):
                dt=datetime.fromtimestamp(v/1000 if v>100000000000 else v,TZ)
            else:
                dt=datetime.fromisoformat(str(v).replace('Z','+00:00'))
                if dt.tzinfo is None: dt=dt.replace(tzinfo=TZ)
            return dt.astimezone(TZ).date().isoformat()
        except (ValueError,TypeError,OverflowError,OSError): pass
    return None

def aggregate(records):
    daily={};errors={};total=correct=duration=accuracy_total=accuracy_correct=0; distribution=[0]*5
    by_type={kind:dict(records=0,totalQuestions=0,correctAnswers=0,accuracyTotalQuestions=0) for kind in ('reading','listening')}
    for r in records:
        q=number(r.get('totalQuestions')); c=min(q,number(r.get('correctAnswers')));sec=number(r.get('duration'))
        total+=q;correct+=c;duration+=sec
        if c>0: accuracy_total+=q;accuracy_correct+=c
        raw_type=' '.join(str(r.get(k) or '') for k in ('type','examType','practiceType','pageType')).lower().strip()
        if not raw_type and isinstance(r.get('metadata'),dict):
            raw_type=str(r['metadata'].get('type') or r['metadata'].get('examType') or '').lower()
        if not raw_type:
            raw_type=str(r.get('examId') or r.get('exam_id') or '').lower()
        kind='listening' if 'listen' in raw_type or '听力' in raw_type else 'reading'
        typed=by_type[kind];typed['records']+=1;typed['totalQuestions']+=q;typed['correctAnswers']+=c
        if c>0: typed['accuracyTotalQuestions']+=q
        bucket=min(4,int(c/q*5)) if q else None
        if bucket is not None: distribution[bucket]+=1
        d=day(r)
        if d:
            row=daily.setdefault(d,dict(date=d,records=0,totalQuestions=0,correctAnswers=0,accuracyTotalQuestions=0,duration=0,distribution=[0]*5,errors={}))
            row['records']+=1;row['totalQuestions']+=q;row['correctAnswers']+=c;row['duration']+=sec
            if c>0: row['accuracyTotalQuestions']+=q
            typed_day=row.setdefault('byType',{name:dict(records=0,totalQuestions=0,correctAnswers=0,accuracyTotalQuestions=0) for name in ('reading','listening')})[kind]
            typed_day['records']+=1;typed_day['totalQuestions']+=q;typed_day['correctAnswers']+=c
            if c>0: typed_day['accuracyTotalQuestions']+=q
        if d and bucket is not None: row['distribution'][bucket]+=1
        counts=r.get('questionTypeErrorCounts')
        if isinstance(counts,dict):
            for k,v in counts.items():
                errors[str(k)]=errors.get(str(k),0)+number(v)
                if d: row['errors'][str(k)]=row['errors'].get(str(k),0)+number(v)
    return dict(records=len(records),totalQuestions=total,correctAnswers=correct,accuracyTotalQuestions=accuracy_total,duration=duration,
                accuracy=round(accuracy_correct/accuracy_total*100,1) if accuracy_total else None,
                daily=sorted(daily.values(),key=lambda x:x['date']),errors=errors,byType=by_type,
                lastPractice=max(daily,default=None),distribution=distribution)

TYPE_NAMES={
 'heading-matching':'段落小标题','true-false-not-given':'判断题','yes-no-not-given':'观点判断',
 'multiple-choice':'选择题','summary-completion':'摘要填空','sentence-completion':'句子填空',
 'short-answer':'简答题','diagram-labelling':'图表标注','flow-chart':'流程图','table-completion':'表格填空',
 'matching-information':'信息配对','matching-features':'特征匹配','matching-people-ideas':'人名观点配对',
 'matching':'匹配题','headings':'标题匹配','multiple_choice':'选择题','true_false_not_given':'判断题',
 'gap_fill':'填空题','summary':'摘要填空','sentence_completion':'句子填空','other':'其他题型'}

def _kind(summary):
    raw=' '.join(str(summary.get(k) or '') for k in ('type','examType','practiceType')).lower()
    return 'listening' if 'listen' in raw or '听力' in raw else 'reading'

def _qkey(qid):
    text=str(qid or '').strip()
    if len(text)>1 and text[0] in 'qQ' and text[1:].isdigit(): return 'q'+str(int(text[1:]))
    if text.isdigit(): return 'q'+str(int(text))
    return ''

def _label(qid):
    key=_qkey(qid)
    return '第%s题'%key[1:] if key else str(qid)

def _order(qid):
    key=_qkey(qid)
    return (0,int(key[1:])) if key else (1,str(qid))

def _answer_text(value):
    if isinstance(value,list):
        parts=[_answer_text(item) for item in value if str(item or '').strip()]
        return ' / '.join(parts)[:120]
    return re.sub(r'\s+',' ',str(value or '')).strip()[:120]

def _flag_ok(info):
    return info.get('ok') is True if isinstance(info,dict) else info is True

def _flag_answer(info):
    return _answer_text(info.get('answer')) if isinstance(info,dict) else ''

def detail_index(state):
    found={}
    if not isinstance(state,dict): return found
    for item in state.get('practiceDetails') or []:
        if not isinstance(item,dict): continue
        data=item.get('data') if isinstance(item.get('data'),dict) else None
        if not data: continue
        score=data.get('scoreInfo') if isinstance(data.get('scoreInfo'),dict) else {}
        raw=score.get('details') if isinstance(score.get('details'),dict) else None
        if not raw: continue
        answers=data.get('answers') if isinstance(data.get('answers'),dict) else {}
        flags={}
        for key,value in raw.items():
            if not isinstance(value,dict) or 'isCorrect' not in value: continue
            qid=str(value.get('questionId') or key)
            answer=_answer_text(value.get('userAnswer')) or _answer_text(answers.get(qid) or answers.get(key))
            flags[qid]={'ok':value.get('isCorrect') is True,'answer':answer}
        rid=str(data.get('recordId') or item.get('recordId') or '')
        if rid and flags: found[rid]=flags
    return found

def _pct(correct,total):
    return round(correct/total*100,1) if total else None

def _chart(series_totals, labels):
    axes=list(labels.values())
    keys=list(labels.keys())
    series=[]
    for name, class_name, totals in series_totals:
        values=[_pct(*totals[key]) if key in totals and totals[key][1] else None for key in keys]
        counts=[[int(totals[key][0]),int(totals[key][1])] if key in totals and totals[key][1] else None for key in keys]
        if any(value is not None for value in values):
            series.append(dict(className=class_name,name=name,values=values,counts=counts))
    return dict(axes=axes,series=series)

def listening_type_name(instruction):
    text=' '.join(str(instruction or '').lower().split())
    if any(token in text for token in ('choose two','choose three','which two','which three')): return '多选题'
    if any(token in text for token in ('label the plan','label the map','label the diagram')): return '地图标注'
    if 'flow-chart' in text or 'flow chart' in text: return '流程图'
    if any(token in text for token in ('next to question','where can','match')): return '匹配题'
    if 'correct letter' in text or 'choose the correct' in text: return '单选题'
    if 'table' in text: return '表格填空'
    if 'form' in text: return '表单填空'
    if 'sentence' in text: return '句子填空'
    if 'summary' in text: return '摘要填空'
    if 'note' in text: return '笔记填空'
    if 'one word' in text or 'complete' in text: return '填空题'
    return '填空题'

def _question_numbers(text):
    found=[]
    for start,end in re.findall(r'questions?\s+(\d+)\s*(?:-|–|—|to|and)\s*(\d+)', text or '', flags=re.I):
        found.extend(range(int(start), int(end)+1))
    if not found:
        found=[int(item) for item in re.findall(r'questions?\s+(\d+)', text or '', flags=re.I)]
    return found

def parse_listening_question_types(html):
    events=[]
    for match in re.finditer(r'<h4[^>]*>(.*?)</h4>', html or '', flags=re.I|re.S):
        events.append((match.start(),'heading',re.sub(r'<[^>]+>',' ',match.group(1))))
    for match in re.finditer(r'class="instructions"[^>]*>(.*?)</(?:p|div)>', html or '', flags=re.I|re.S):
        events.append((match.start(),'instruction',re.sub(r'<[^>]+>',' ',match.group(1))))
    assigned={}; pending=[]; instructions=[]
    for pos,kind,text in sorted(events):
        if '${' in text: continue
        if kind=='heading':
            pending=_question_numbers(text)
        else:
            numbers=pending or _question_numbers(text)
            label=listening_type_name(text)
            instructions.append((pos,label))
            for number in numbers: assigned.setdefault(_qkey(number), label)
            pending=[]
    for match in re.finditer(r'(?:data-q|name)\s*=\s*["\']q?(\d+)["\']', html or '', flags=re.I):
        key=_qkey(match.group(1))
        if not key or key in assigned: continue
        label=next((item[1] for item in reversed(instructions) if item[0]<=match.start()), '')
        if label: assigned[key]=label
    return assigned

def _plain(html):
    text=re.sub(r'<[^>]+>',' ',html or '')
    text=re.sub(r'\s+',' ',text.replace('&nbsp;',' ').replace('&amp;','&').replace('&quot;','"').replace('&#39;',"'")).strip()
    return text

def _options_from_html(html):
    found={}
    for match in re.finditer(r'data-option=["\']([^"\']+)["\'][^>]*>(.*?)</div>', html or '', flags=re.I|re.S):
        label=_plain(match.group(2))
        found.setdefault(match.group(1).strip(), re.sub(r'^[A-Z]\s+','',label).strip() or label)
    for match in re.finditer(r'<label[^>]*>(.*?)</label>', html or '', flags=re.I|re.S):
        inner=match.group(1)
        value=re.search(r'value=["\']([^"\']+)["\']', inner, flags=re.I)
        strong=re.search(r'<strong>\s*([^<]+?)\s*</strong>', inner, flags=re.I)
        key=(value.group(1) if value else strong.group(1) if strong else '').strip()
        if not key: continue
        text=_plain(re.sub(r'<input\b[^>]*>','',inner,flags=re.I))
        text=re.sub(r'^'+re.escape(key)+r'\s*','',text).strip()
        found.setdefault(key, text)
    return found

def _questions_from_groups(groups, display_map, answer_key):
    questions={}
    display={_qkey(qid):str(number) for qid,number in (display_map or {}).items() if _qkey(qid)}
    for group in groups or []:
        if not isinstance(group,dict): continue
        body=str(group.get('bodyHtml') or '')
        shared=_options_from_html(body)
        parts=re.split(r'(<strong>\s*\d+\s*</strong>)', body, flags=re.I)
        ids=[_qkey(qid) for qid in group.get('questionIds') or [] if _qkey(qid)]
        found=[]
        for index in range(1,len(parts),2):
            number=re.search(r'\d+', parts[index])
            if not number: continue
            segment=parts[index+1] if index+1<len(parts) else ''
            prompt_html=re.split(r'<input\b|<ul\b|<ol\b|<table\b|class=["\']options|class=["\']tfng|class=["\']options-pool', segment, maxsplit=1, flags=re.I)[0]
            own=_options_from_html(segment)
            found.append((number.group(), _plain(prompt_html)[:240], own or shared))
        used=set()
        for qid in ids:
            wanted=display.get(qid,'')
            match=next((item for item in found if item[0]==wanted and item[0] not in used), None)
            if not match: continue
            used.add(match[0])
            questions[qid]=dict(number=match[0], prompt=match[1], options=match[2], correct=_answer_text((answer_key or {}).get(qid)))
        rest=[item for item in found if item[0] not in used]
        for qid, item in zip([qid for qid in ids if qid not in questions], rest):
            questions[qid]=dict(number=display.get(qid) or item[0], prompt=item[1], options=item[2], correct=_answer_text((answer_key or {}).get(qid)))
    for qid,number in display.items():
        questions.setdefault(qid, dict(number=number, prompt='', options={}, correct=_answer_text((answer_key or {}).get(qid))))
        questions[qid]['number']=questions[qid].get('number') or number
    return questions

def parse_reading_exam_source(text):
    match=re.search(r'register\(\s*"([^"]+)"\s*,', text or '')
    if not match: return {}
    start=text.find('{', match.end()-1)
    if start<0: return {}
    depth=0
    end=None
    for index,char in enumerate(text[start:], start):
        if char=='{': depth+=1
        elif char=='}':
            depth-=1
            if depth==0:
                end=index+1
                break
    if end is None: return {}
    try: payload=json.loads(text[start:end])
    except json.JSONDecodeError: return {}
    display=payload.get('questionDisplayMap') if isinstance(payload.get('questionDisplayMap'),dict) else {}
    answers=payload.get('answerKey') if isinstance(payload.get('answerKey'),dict) else {}
    return {match.group(1): _questions_from_groups(payload.get('questionGroups'), display, answers)}

def load_reading_questions(root):
    root_path=__import__('pathlib').Path(root)
    folder=root_path/'assets'/'generated'/'reading-exams'
    try: stamp=max((item.stat().st_mtime for item in folder.glob('*.js')), default=0)
    except OSError: stamp=0
    cached=getattr(load_reading_questions,'_cache',None)
    if cached and cached[0]==(str(folder),stamp): return cached[1]
    found={}
    try: paths=list(folder.glob('*.js'))
    except OSError: paths=[]
    for path in paths:
        if path.name=='manifest.js': continue
        try: found.update(parse_reading_exam_source(path.read_text(encoding='utf-8', errors='replace')))
        except OSError: continue
    load_reading_questions._cache=((str(folder),stamp),found)
    return found

def load_listening_type_map(root):
    root_path=__import__('pathlib').Path(root)
    cached=getattr(load_listening_type_map,'_cache',None)
    if cached and cached[0]==str(root_path): return cached[1]
    found={}
    manifest=root_path/'assets'/'generated'/'listening-exams'/'manifest.js'
    try: text=manifest.read_text(encoding='utf-8')
    except OSError: text=''
    for exam,folder,filename in re.findall(r'"examId":\s*"([^"]+)"[\s\S]{0,900}?"path":\s*"([^"]+)"[\s\S]{0,300}?"filename":\s*"([^"]+)"', text):
        try: html=(root_path/'ListeningPractice'/folder/filename).read_text(encoding='utf-8', errors='replace')
        except OSError: continue
        found[exam]=parse_listening_question_types(html)
    load_listening_type_map._cache=(str(root_path),found)
    return found

def load_listening_title_map(root):
    manifest=__import__('pathlib').Path(root)/'assets'/'generated'/'listening-exams'/'manifest.js'
    try: text=manifest.read_text(encoding='utf-8')
    except OSError: return {}
    return {exam:title for exam,title in re.findall(r'"examId":\s*"([^"\n]+)"[\s\S]{0,1800}?"title":\s*"([^"\n]+)"',text)}

def _top_wrongs(answers):
    groups={}
    for answer in answers:
        text=str(answer or '').strip()
        if not text: continue
        spellings=groups.setdefault(text.casefold(),{})
        spellings[text]=spellings.get(text,0)+1
    if not groups: return []
    totals={key:sum(spellings.values()) for key,spellings in groups.items()}
    best=max(totals.values())
    rows=[]
    for key,total in totals.items():
        if total!=best: continue
        spellings=groups[key]
        shown=sorted(spellings, key=lambda item:(-spellings[item], item))[0]
        rows.append((key, shown, total))
    rows.sort(key=lambda item:item[0])
    return [dict(answer=shown,count=total) for _,shown,total in rows]

def _person_key(summary, user_id):
    return str(user_id or summary.get('id') or id(summary))

def _when(summary):
    return str(summary.get('completedAt') or summary.get('endTime') or summary.get('timestamp') or summary.get('date') or '')

def class_charts(grouped, days=0, grade='', listening_types=None, reading_questions=None, listening_titles=None):
    cutoff=None
    if days:
        cutoff=(datetime.now(TZ).date()-timedelta(days=days-1)).isoformat()
    reading={}; listening={}; passage_attempts=[]
    def class_name_of(key):
        if grade in ('Pre','English Dept.'): return grade
        return f'{key} 班' if key else '未分班'
    ordered=sorted(grouped, key=lambda key:(0,int(key)) if str(key).isdigit() else (1,str(key)))
    for class_name in ordered:
        bucket_reading=reading.setdefault(class_name,{})
        bucket_listening=listening.setdefault(class_name,{})
        for entry in grouped.get(class_name) or []:
            summary, flags = entry[0], entry[1]
            user_id = entry[2] if len(entry)>2 else ''
            if not isinstance(summary,dict): continue
            stamped=day(summary)
            if cutoff and (not stamped or stamped<cutoff): continue
            questions=number(summary.get('totalQuestions'))
            correct=min(questions,number(summary.get('correctAnswers')))
            if correct<=0: continue
            kind=_kind(summary)
            target=bucket_listening if kind=='listening' else bucket_reading
            analytics=summary.get('readingAnalytics') if isinstance(summary.get('readingAnalytics'),dict) else {}
            typed=analytics.get('questionTypes') if isinstance(analytics.get('questionTypes'),dict) else {}
            used_types=False
            for name,metrics in typed.items():
                if not isinstance(metrics,dict): continue
                possible=number(metrics.get('possible'))
                earned=min(possible,number(metrics.get('earned')))
                if possible<=0: continue
                used_types=True
                slot=target.setdefault(str(name),[0,0])
                slot[0]+=earned; slot[1]+=possible
            if kind=='listening' and not used_types and isinstance(flags,dict):
                table=(listening_types or {}).get(str(summary.get('examId') or ''),{})
                for qid,info in flags.items():
                    slot=target.setdefault(table.get(_qkey(qid)) or '未标注题型',[0,0])
                    slot[1]+=1
                    if _flag_ok(info): slot[0]+=1
            if not isinstance(flags,dict) or not flags: continue
            exam=str(summary.get('examId') or summary.get('title') or '未命名')
            title=str(summary.get('title') or '')
            if kind=='listening' and (not title or title in ('无标题','未命名',exam)):
                title=(listening_titles or {}).get(str(summary.get('examId') or ''), title or exam)
            if not title: title=exam
            passage_attempts.append(dict(className=class_name,user=_person_key(summary,user_id),when=_when(summary),
                exam=exam,examId=str(summary.get('examId') or ''),title=title,kind=kind,flags=flags))
    def series_for(bucket):
        labels={}
        for totals in bucket.values():
            for key in totals:
                labels.setdefault(key, TYPE_NAMES.get(key,key))
        ordered_labels=dict(sorted(labels.items(), key=lambda item:item[1]))
        rows=[]
        for class_name in ordered:
            rows.append((class_name_of(class_name), class_name, bucket.get(class_name,{})))
        return _chart(rows, ordered_labels)
    latest={}
    for attempt in passage_attempts:
        key=(attempt['className'], attempt['user'], attempt['exam'])
        previous=latest.get(key)
        if previous is None or attempt['when']>=previous['when']: latest[key]=attempt
    passages={}
    for attempt in latest.values():
        passage=passages.setdefault(attempt['exam'], dict(examId=attempt['examId'],title=attempt['title'],kind=attempt['kind'],attempts=0,classes={},wrongs={}))
        passage['attempts']+=1
        klass=passage['classes'].setdefault(attempt['className'],{})
        wrongs=passage['wrongs'].setdefault(attempt['className'],{})
        for qid, info in attempt['flags'].items():
            slot=klass.setdefault(qid,[0,0])
            slot[1]+=1
            if _flag_ok(info): slot[0]+=1
            else:
                wrongs.setdefault(qid,[]).append(_flag_answer(info))
    passage_rows=[]
    bank=reading_questions or {}
    for exam, passage in sorted(passages.items(), key=lambda item:(-item[1]['attempts'], item[1]['title'])):
        meta=bank.get(passage['examId']) or bank.get(exam) or {}
        qids=[]
        seen=set()
        for totals in passage['classes'].values():
            for qid in totals:
                if qid not in seen:
                    seen.add(qid); qids.append(qid)
        def sort_key(qid):
            number=str((meta.get(_qkey(qid)) or meta.get(qid) or {}).get('number') or '')
            return (0,int(number),_order(qid)) if number.isdigit() else (1,_order(qid))
        qids.sort(key=sort_key)
        labels={}
        questions=[]
        for qid in qids:
            item=meta.get(_qkey(qid)) or meta.get(qid) or {}
            label=str(item.get('number') or _label(qid))
            labels[qid]=label
            questions.append(dict(number=label,prompt=item.get('prompt') or '',options=item.get('options') or {},correct=item.get('correct') or ''))
        rows=[(class_name_of(class_name), class_name, passage['classes'].get(class_name,{})) for class_name in ordered]
        chart=_chart(rows, labels)
        if not chart['axes']: continue
        keys=list(labels.keys())
        for series in chart['series']:
            bag=passage['wrongs'].get(series['className'],{})
            series['wrongs']=[_top_wrongs(bag.get(key) or []) for key in keys]
        passage_rows.append(dict(examId=passage['examId'],title=passage['title'],kind=passage['kind'],attempts=passage['attempts'],questions=questions,**chart))
    return dict(readingTypes=series_for(reading),listeningTypes=series_for(listening),passages=passage_rows[:80])

def install_class_charts(app, db, is_admin):
    import json
    from flask import jsonify, request
    @app.get('/api/admin/class-charts')
    def class_charts_api():
        if not is_admin(): return jsonify(error='仅管理员可以查看'), 403
        grade=request.args.get('grade') or ''
        if grade not in ('Pre','G10','G11','G12','English Dept.'):
            return jsonify(error='请选择年级'), 400
        try: days=int(request.args.get('days') or 0)
        except ValueError: days=0
        if days<0 or days>3660: days=0
        with db() as con:
            rows=con.execute("SELECT p.user_id AS user_id, p.class_name AS class_name, s.data AS data FROM profiles p LEFT JOIN states s ON s.user_id=p.user_id WHERE p.school=? AND p.grade=?",('sample_school',grade)).fetchall()
        grouped={}
        for row in rows:
            class_name=row['class_name'] or ''
            records=grouped.setdefault(class_name,[])
            if not row['data']: continue
            try: state=json.loads(row['data'])
            except json.JSONDecodeError: continue
            details=detail_index(state)
            for item in state.get('practiceSummaries') or []:
                if not isinstance(item,dict): continue
                summary=item.get('data')
                if not isinstance(summary,dict): continue
                rid=str(summary.get('id') or item.get('recordId') or '')
                records.append((summary, details.get(rid), row['user_id']))
        root=__import__('pathlib').Path(__file__).resolve().parents[1]
        return jsonify(class_charts(grouped, days, grade, load_listening_type_map(root), load_reading_questions(root), load_listening_title_map(root)))
