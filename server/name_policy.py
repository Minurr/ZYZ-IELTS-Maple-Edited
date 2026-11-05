"""Reject abusive usernames and school names before they are stored."""

import re
import unicodedata

_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i",
})

# Distinctive fragments. Short ordinary words are intentionally absent so pinyin
# names such as Shi Tao and words such as classic are not rejected.
_FRAGMENTS = (
    "nigg", "faggot", "wetback", "tranny", "retard", "chink", "bitch", "fuck",
    "尼哥", "尼格", "黑鬼", "支那", "傻逼", "煞笔", "脑残", "死全家", "操你妈", "草泥马", "杂种", "贱人",
)
_TOKENS = ("kike", "spic", "gook", "fag", "slut", "twat", "paki")


def blocked_display_text(value):
    text = unicodedata.normalize("NFKC", str(value)).casefold().translate(_LEET)
    collapsed = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)
    if any(term in collapsed for term in _FRAGMENTS):
        return True
    return any(token in _TOKENS for token in re.findall(r"[0-9a-z\u4e00-\u9fff]+", text))
