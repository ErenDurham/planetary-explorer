"""Turn a cut-off JSON answer into the largest valid object it contains.

A streamed model answer that is stopped early ends mid-value, for example
`{"weights": {"a": 40, "b": 2` or `..."reasons": {"a": "Gentle sl`. This
keeps every complete value, drops the unfinished one, and closes the open
objects and arrays. It never invents values."""
from __future__ import annotations

import json


def parse_partial(text: str) -> dict:
    """The largest valid JSON object at the start of `text` ({} if none)."""
    text = text.strip()
    try:
        out = json.loads(text)
        return out if isinstance(out, dict) else {}
    except ValueError:
        pass
    # One pass records, for every position where a value has just ended, the
    # brackets still open there. Candidates are tried from the longest.
    stack: list[str] = []
    in_str = esc = False
    ends: list[tuple[int, str]] = []
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
                ends.append((i + 1, "".join(reversed(stack))))
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack:
                stack.pop()
            ends.append((i + 1, "".join(reversed(stack))))
        elif ch.isalnum():
            # End of a number, true, false or null, but only once the next
            # character shows it is finished: a cut-off "25" reads as "2".
            nxt = text[i + 1] if i + 1 < len(text) else ""
            if nxt and not (nxt.isalnum() or nxt in ".-+"):
                ends.append((i + 1, "".join(reversed(stack))))
    for end, closers in reversed(ends):
        try:
            out = json.loads(text[:end] + closers)
        except ValueError:
            continue
        if isinstance(out, dict):
            return out
    return {}
