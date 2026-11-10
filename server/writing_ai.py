"""DeepSeek grammar checking for teacher writing feedback.

The model is only asked to spot grammar / usage mistakes and to quote the
exact offending text. Offsets are resolved here against the real essay so a
model slip can never corrupt a highlight. A second pass then re-reads the
candidates and drops the ones that are not real errors, which keeps teacher
review quiet instead of noisy.
"""
import json
import os
import re
import urllib.error
import urllib.request

API_URL = os.environ.get('DEEPSEEK_BASE_URL') or 'https://api.deepseek.com/chat/completions'
MODEL = os.environ.get('DEEPSEEK_MODEL') or 'deepseek-chat'
TIMEOUT = int(os.environ.get('DEEPSEEK_TIMEOUT') or 60)
MAX_MARKS = 60
MIN_CONFIDENCE = float(os.environ.get('DEEPSEEK_MIN_CONFIDENCE') or 0.7)
VERIFY = (os.environ.get('DEEPSEEK_VERIFY') or '1').strip() not in ('0', 'false', 'False', 'no')

SYSTEM = (
    'You are a senior IELTS writing examiner and a careful English grammar checker. '
    'You only report mistakes that a strict examiner would mark as wrong. '
    'You never rewrite style, never change the argument, and never invent text.'
)

FIND = """Proofread the IELTS essay at the end of this message. Report grammar and usage
errors only. Do not report style, vocabulary choice, organisation, content or
"could be better" suggestions.

Check every sentence against this list before you decide to report:
1. Subject-verb agreement (singular/plural, there is/are, one of the ... are).
2. Verb tense, aspect and form (past vs present, -ed vs -ing, have/has + participle,
   modal + bare infinitive, passive form).
3. Articles (a/an/the/zero) and countable vs uncountable nouns.
4. Noun number (singular/plural, irregular plurals) and quantity words.
5. Pronouns (case, reference, agreement, one/ones, reflexive).
6. Word form (noun/verb/adjective/adverb) and word class after a preposition.
7. Prepositions and dependent verb patterns (depend on, interested in, allow to do).
8. Sentence structure: missing or doubled subject/verb, fragment, run-on,
   wrong relative pronoun, dangling modifier.
9. Comparatives and superlatives (as ... as, more ... than, the most).
10. Spelling that is genuinely wrong (not British vs American variants).

Do not report any of the following:
- correct but formal/informal, long or short sentences;
- British or American spelling variants, both are correct;
- different wording that is grammatical;
- punctuation that is acceptable in an exam essay;
- repeated words for emphasis, or a missing comma that does not confuse meaning;
- anything you are not sure about.

For every error return one object:
{"quote": "...", "kind": "replace" | "delete" | "comment", "replacement": "...",
 "note": "...", "confidence": 0.0-1.0}

Rules for each field:
- "quote": copied character for character from the essay, including original spelling and
  punctuation. Keep it to the smallest span that must change, usually 2-12 words, and
  include the words before or after when needed to make the span unique. Never use "...",
  never paraphrase.
- "kind": "replace" when swapping exactly the quoted text fixes it. "delete" when the
  quoted words must be removed. "comment" only when the fix needs a word that cannot be
  expressed by replacing the quote alone.
- "replacement": the corrected text for "replace", empty for "delete"/"comment". It must
  keep the same meaning, tense and voice, and must fit the surrounding sentence exactly.
- "note": one short Chinese sentence naming the rule, e.g. "主谓一致：主语是复数，动词不加 s。"
- "confidence": your real probability that this is an error an examiner would mark, 0.0-1.0.

If a quoted phrase appears in several places, choose the occurrence that is actually wrong
and add one extra word of context if that disambiguates it.

Return ONLY a JSON array, no markdown fence, no commentary. Return [] when there is no
clear error. Prefer 4-15 high value marks over a long noisy list.

Essay:
"""

VERIFY_PROMPT = """Below is an IELTS essay and a numbered list of candidate grammar
corrections produced by another checker. For each candidate decide whether it is a real
error in this essay and whether the replacement text is fully correct English in that
sentence.

Reject a candidate when:
- the quoted text is not actually in the essay, or is misquoted;
- the original is already acceptable English, including British/American variants;
- it is a style or vocabulary preference rather than an error;
- the replacement is ungrammatical, changes the meaning, or does not fit the sentence;
- the note or the replacement targets a different span than the quote.

Return ONLY JSON: {"reject": [numbers of rejected candidates]}
Use an empty list when every candidate is valid. No commentary.
"""


def _chat(messages, max_tokens=2400):
    key = (os.environ.get('DEEPSEEK_API_KEY') or '').strip()
    if not key:
        raise ValueError('还没有配置 DeepSeek API 密钥')
    body = json.dumps({
        'model': MODEL,
        'messages': messages,
        'temperature': 0,
        'max_tokens': max_tokens,
        'stream': False,
    }, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key,
            'Accept': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        detail = ''
        try:
            detail = error.read().decode('utf-8', 'replace')[:300]
        except Exception:
            pass
        if error.code == 401:
            raise ValueError('DeepSeek 密钥无效或已过期')
        if error.code == 402:
            raise ValueError('DeepSeek 账户余额不足')
        if error.code == 429:
            raise ValueError('DeepSeek 请求太频繁，请稍后再试')
        raise ValueError('DeepSeek 返回错误 %s %s' % (error.code, detail))
    except urllib.error.URLError as error:
        raise ValueError('连不上 DeepSeek：%s' % getattr(error, 'reason', error))
    except TimeoutError:
        raise ValueError('DeepSeek 响应超时，请重试')

    try:
        data = json.loads(raw)
        return data['choices'][0]['message']['content']
    except (ValueError, KeyError, IndexError, TypeError):
        raise ValueError('DeepSeek 返回的内容无法解析')


def _json_block(content):
    text = str(content or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text


def _extract_array(content):
    text = _json_block(content)
    start, end = text.find('['), text.rfind(']')
    if start < 0 or end <= start:
        raise ValueError('AI 没有返回可用的批注')
    try:
        items = json.loads(text[start:end + 1])
    except ValueError:
        raise ValueError('AI 返回的批注格式有误')
    if not isinstance(items, list):
        raise ValueError('AI 返回的批注格式有误')
    return items


def _extract_object(content):
    text = _json_block(content)
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start:end + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _fold_map(text):
    """Lowercase + unify quotes while keeping a map back to original offsets."""
    chars = []
    spots = []
    index = 0
    size = len(text)
    while index < size:
        char = text[index]
        if char.isspace():
            ahead = index
            while ahead < size and text[ahead].isspace():
                ahead += 1
            chars.append(' ')
            spots.append(index)
            index = ahead
            continue
        if char in '\u2019\u2018':
            char = "'"
        elif char in '\u201c\u201d':
            char = '"'
        elif char in '\u2013\u2014':
            char = '-'
        chars.append(char.lower())
        spots.append(index)
        index += 1
    return ''.join(chars), spots


def _locate(text, quote, cursor, taken):
    """Return (from, to) for a quoted fragment, preferring forward matches."""
    quote = str(quote or '').strip().strip('"').strip("'").strip()
    if len(quote) < 2:
        return None
    matches = []
    at = text.find(quote)
    while at >= 0 and len(matches) < 40:
        matches.append((at, at + len(quote)))
        at = text.find(quote, at + 1)
    if not matches:
        folded, spots = _fold_map(text)
        target = _fold_map(quote)[0].strip()
        if not target:
            return None
        at = folded.find(target)
        while at >= 0 and len(matches) < 40:
            start = spots[at]
            boundary = at + len(target)
            end = spots[boundary] if boundary < len(spots) else len(text)
            while end > start and text[end - 1].isspace():
                end -= 1
            while start < end and text[start].isspace():
                start += 1
            if end > start:
                matches.append((start, end))
            at = folded.find(target, at + 1)
    if not matches:
        return None
    free = [spot for spot in matches if not any(item['from'] < spot[1] and item['to'] > spot[0] for item in taken)]
    pool = free or matches
    ahead = [spot for spot in pool if spot[0] >= cursor]
    return (ahead or pool)[0]


def _confidence(item):
    try:
        value = float(item.get('confidence'))
    except (TypeError, ValueError):
        return 1.0
    if value > 1:
        value = value / 100
    return max(0.0, min(1.0, value))


def _verify(source, candidates):
    """Second pass: drop candidates the reviewer would not mark."""
    if not candidates:
        return []
    listing = []
    for index, item in enumerate(candidates, start=1):
        listing.append('%d. quote=%r | kind=%s | replacement=%r | note=%s' % (
            index, item['quote'], item['kind'], item['replacement'], item['note']))
    message = '%s\n\nEssay:\n%s\n\nCandidates:\n%s' % (
        VERIFY_PROMPT, source, '\n'.join(listing))
    try:
        reply = _chat([
            {'role': 'system', 'content': SYSTEM},
            {'role': 'user', 'content': message},
        ], max_tokens=600)
        verdict = _extract_object(reply) or {}
    except ValueError:
        return candidates
    rejected = set()
    for value in verdict.get('reject') or []:
        try:
            rejected.add(int(value))
        except (TypeError, ValueError):
            continue
    if not rejected and verdict.get('keep'):
        kept = set()
        for value in verdict.get('keep') or []:
            try:
                kept.add(int(value))
            except (TypeError, ValueError):
                continue
        return [item for index, item in enumerate(candidates, start=1) if index in kept]
    return [item for index, item in enumerate(candidates, start=1) if index not in rejected]


def grammar_marks(text):
    """Ask DeepSeek for grammar marks and resolve them to essay offsets."""
    source = str(text or '')
    if len(source.strip()) < 20:
        raise ValueError('这篇作文太短，暂时不需要批改')
    if len(source) > 20000:
        source = source[:20000]

    items = _extract_array(_chat([
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': FIND + source},
    ]))

    candidates = []
    for item in items:
        if not isinstance(item, dict):
            continue
        quote = str(item.get('quote') or '').strip()
        if len(quote) < 2 or len(quote) > 200:
            continue
        kind = str(item.get('kind') or 'replace').strip().lower()
        if kind not in ('replace', 'delete', 'comment'):
            kind = 'comment'
        confidence = _confidence(item)
        if confidence < MIN_CONFIDENCE:
            continue
        replacement = re.sub(r'\s+', ' ', str(item.get('replacement') or '')).strip()[:300]
        if kind == 'replace' and not replacement:
            kind = 'comment'
        if kind == 'replace' and replacement == quote:
            continue
        candidates.append(dict(
            quote=quote,
            kind=kind,
            replacement=replacement if kind == 'replace' else '',
            note=re.sub(r'\s+', ' ', str(item.get('note') or '')).strip()[:300],
            confidence=confidence,
        ))
    if not candidates:
        return []

    confirmed = _verify(source, candidates) if VERIFY else candidates

    marks = []
    cursor = 0
    for item in sorted(confirmed, key=lambda entry: -entry['confidence']):
        located = _locate(source, item['quote'], cursor, marks)
        if not located:
            continue
        start, end = located
        if end <= start or end - start > 400:
            continue
        if any(start < mark['to'] and end > mark['from'] for mark in marks):
            continue
        marks.append(dict(
            kind=item['kind'],
            **{'from': start, 'to': end},
            note=item['note'],
            replacement=item['replacement'],
        ))
        cursor = end
        if len(marks) >= MAX_MARKS:
            break

    marks.sort(key=lambda item: item['from'])
    return marks
