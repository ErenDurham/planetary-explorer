"""Scientific document retrieval. Owner: Engineer 4.

BASELINE IMPLEMENTATION (Phase 1): a dependency-free TF-IDF retriever over
the JSONL chunk store written by scripts/ingest_documents.py. Engineer 4
replaces/extends this with ChromaDB embeddings + hybrid search + reranking
behind the same `Retriever` interface. The API only calls `retrieve()` and
`status()`, so swapping the implementation does not touch routes.

Retrieved text is DATA from untrusted documents: it is quoted, never executed
and never treated as instructions.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from app.config.settings import get_settings
from app.models import EvidenceChunk

_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{1,}")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class Retriever:
    def __init__(self, chunks_path: Path):
        self.chunks_path = chunks_path
        self.chunks: list[dict] = []
        self.df: Counter = Counter()
        self.vectors: list[dict[str, float]] = []
        if chunks_path.exists():
            self.chunks = [json.loads(l) for l in chunks_path.read_text().splitlines() if l.strip()]
            toks = [tokenize(c["text"] + " " + c.get("title", "")) for c in self.chunks]
            for t in toks:
                self.df.update(set(t))
            n = len(toks)
            for t in toks:
                tf = Counter(t)
                vec = {w: (1 + math.log(c)) * math.log((1 + n) / (1 + self.df[w])) for w, c in tf.items()}
                norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
                self.vectors.append({w: v / norm for w, v in vec.items()})

    def status(self) -> str:
        return "ok" if self.chunks else "unavailable"

    def retrieve(self, query: str, k: int = 6, geographic_relevance: list[str] | None = None) -> list[EvidenceChunk]:
        if not self.chunks:
            return []
        q = Counter(tokenize(query))
        n = len(self.chunks)
        qv = {w: (1 + math.log(c)) * math.log((1 + n) / (1 + self.df[w])) for w, c in q.items()}
        scored = []
        for c, v in zip(self.chunks, self.vectors):
            s = sum(qv[w] * v.get(w, 0.0) for w in qv)
            if geographic_relevance and set(c.get("geographic_relevance", [])) & set(geographic_relevance):
                s *= 1.25  # metadata boost for site/region-aware selection
            if s > 0:
                scored.append((s, c))
        scored.sort(key=lambda x: -x[0])
        return [EvidenceChunk(chunk_id=c["chunk_id"], document_id=c["document_id"], title=c["title"], institution=c["institution"], url=c["url"],
                              publication_date=c.get("publication_date"), geographic_relevance=c.get("geographic_relevance", []),
                              excerpt=c["text"][:700], score=round(s, 4)) for s, c in scored[:k]]


@lru_cache
def get_retriever() -> Retriever:
    s = get_settings()
    return Retriever(s.data_dir / "documents" / "chunks.jsonl")
