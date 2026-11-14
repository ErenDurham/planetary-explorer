"""Scientific document retrieval. Owner: Engineer 4.

How it works
------------
The chunk store is `data/documents/chunks.jsonl`, written by
`scripts/ingest_documents.py` (one JSON object per line: chunk_id,
document_id, title, institution, url, publication_date, geographic_relevance,
text, char offsets, retrieved_at). `Retriever` loads it once and answers
`retrieve(query, k, geographic_relevance)` with ranked `EvidenceChunk`s.

Two backends sit behind the same interface, chosen by `EMBEDDING_BACKEND`:

* `local` (default, zero downloads, what CI runs): BM25 over a simple
  tokeniser. The index is built in memory at start-up from chunks.jsonl.
* `chroma-default`: the lexical BM25 ranking PLUS a ChromaDB collection
  persisted under `VECTOR_INDEX_DIR`, embedded with ChromaDB's default
  embedding function (a small sentence-transformer that ChromaDB downloads on
  first use). `chromadb` is imported lazily and is NOT in requirements.txt - it
  is in requirements-ai.txt. If the import, the model download or the index
  build fails, the failure is logged once and the retriever silently continues
  with the local backend, so the API never degrades below BM25.

Ranking, in order:

1. Lexical rank list (BM25) and, when available, vector rank list (ChromaDB
   cosine distance) are fused with Reciprocal Rank Fusion:
   score = sum over lists of 1 / (RRF_K + rank). A chunk that appears in only
   one list still scores; one that is near the top of both scores highest.
   Fusion is over ranks, not raw scores, so BM25 and cosine never need to be
   put on a common scale.
2. Metadata boost: a chunk whose `geographic_relevance` intersects the
   caller's `geographic_relevance` (site id, region, Earth candidate id) is
   multiplied by GEO_BOOST. This is what makes a Jezero question prefer
   Jezero documents over an equally wordy Gale page.
3. Cheap reranker: a chunk whose TEXT mentions a distinctive term from the
   requested geography (e.g. "jezero", "isidis") is multiplied by TERM_BOOST.
   This catches chunks whose metadata the ingester did not tag.

Safety rules
------------
Retrieved text is DATA from untrusted public documents. It is quoted back to
the user as evidence (truncated to EXCERPT_CHARS) and handed to the
explanation engine as numbered excerpts. Nothing here or downstream executes
it, evaluates it, or treats it as instructions. The retriever never fetches
from the network at request time: everything it serves was ingested offline
and committed, so a request cannot be used to pull arbitrary content in.
"""
from __future__ import annotations

import json
import logging
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from app.config.settings import get_settings
from app.models import EvidenceChunk

log = logging.getLogger(__name__)

_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{1,}")
RRF_K = 60            # standard reciprocal-rank-fusion constant
GEO_BOOST = 1.25      # metadata match on geographic_relevance
TERM_BOOST = 1.10     # chunk text mentions a distinctive geographic term
EXCERPT_CHARS = 700
BM25_K1 = 1.5
BM25_B = 0.75
CHROMA_COLLECTION = "planetary_explorer_chunks"
# Words that appear in many site ids / regions and carry no geography on their own.
_GENERIC_GEO_WORDS = {"crater", "planum", "planitia", "basin", "rim", "region", "margin", "outlet", "boundary", "valley", "valleys", "desert",
                      "area", "field", "summit", "central", "the", "and", "mars", "earth", "site", "landing", "vallis", "terra", "mons"}


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def geo_terms(geographic_relevance: list[str] | None) -> set[str]:
    """Distinctive lowercase words from site ids / region names, e.g.
    ['jezero_crater', 'Nili Fossae / Isidis basin rim'] -> {'jezero','nili','fossae','isidis'}."""
    terms: set[str] = set()
    for g in geographic_relevance or []:
        for w in re.split(r"[^a-z0-9']+", g.lower()):
            w = w.strip("'")
            if len(w) >= 4 and w not in _GENERIC_GEO_WORDS and not w.isdigit():
                terms.add(w)
    return terms


class _BM25:
    """Okapi BM25 over pre-tokenised documents. Pure Python, no dependencies."""

    def __init__(self, docs: list[list[str]]):
        self.n = len(docs)
        self.df: Counter = Counter()
        self.tf: list[Counter] = []
        self.dl: list[int] = []
        for toks in docs:
            c = Counter(toks)
            self.tf.append(c)
            self.dl.append(len(toks))
            self.df.update(c.keys())
        self.avgdl = (sum(self.dl) / self.n) if self.n else 0.0

    def idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def scores(self, query_tokens: list[str]) -> list[float]:
        out = [0.0] * self.n
        q = Counter(query_tokens)
        for term, qf in q.items():
            if term not in self.df:
                continue
            idf = self.idf(term)
            for i, tf in enumerate(self.tf):
                f = tf.get(term)
                if not f:
                    continue
                denom = f + BM25_K1 * (1 - BM25_B + BM25_B * self.dl[i] / (self.avgdl or 1.0))
                out[i] += idf * (f * (BM25_K1 + 1)) / denom * (1 + math.log(qf))
        return out


class Retriever:
    def __init__(self, chunks_path: Path, backend: str | None = None, index_dir: Path | None = None):
        s = get_settings()
        self.chunks_path = Path(chunks_path)
        self.backend_requested = (backend or s.embedding_backend or "local").lower()
        self.index_dir = Path(index_dir) if index_dir else s.vector_index_dir
        self.chunks: list[dict] = []
        self.backend = "local"
        self.backend_error: str | None = None
        self._collection = None
        if self.chunks_path.exists():
            self.chunks = [json.loads(l) for l in self.chunks_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        self._by_id = {c["chunk_id"]: i for i, c in enumerate(self.chunks)}
        self._bm25 = _BM25([tokenize(c["text"] + " " + c.get("title", "")) for c in self.chunks])
        self._text_lower = [c["text"].lower() for c in self.chunks]
        if self.chunks and self.backend_requested.startswith("chroma"):
            self._init_chroma()

    # ---- optional vector backend ------------------------------------------------
    def _init_chroma(self) -> None:
        try:
            import chromadb  # heavy optional dependency, see requirements-ai.txt
        except Exception as e:  # noqa: BLE001 - ImportError or anything its import machinery raises
            self.backend_error = f"chromadb not importable ({type(e).__name__}); using local BM25"
            log.warning("retrieval: %s", self.backend_error)
            return
        try:
            self.index_dir.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(self.index_dir))
            col = client.get_or_create_collection(CHROMA_COLLECTION, metadata={"hnsw:space": "cosine"})
            have = set(col.get(include=[])["ids"]) if col.count() else set()
            want = {c["chunk_id"] for c in self.chunks}
            stale = sorted(have - want)
            if stale:
                col.delete(ids=stale)
            missing = [c for c in self.chunks if c["chunk_id"] not in have]
            for i in range(0, len(missing), 64):   # batches keep the embedding model's memory flat
                batch = missing[i:i + 64]
                col.upsert(ids=[c["chunk_id"] for c in batch],
                           documents=[c["text"] for c in batch],
                           metadatas=[{"document_id": c["document_id"], "title": c.get("title", "")} for c in batch])
            self._collection = col
            self.backend = "chroma-default"
            log.info("retrieval: chroma index ready at %s (%d chunks, %d embedded now)", self.index_dir, col.count(), len(missing))
        except Exception as e:  # noqa: BLE001 - model download, disk, or version errors all mean "no vectors"
            self.backend_error = f"chroma index unavailable ({type(e).__name__}: {str(e)[:120]}); using local BM25"
            log.warning("retrieval: %s", self.backend_error)
            self._collection = None

    def _vector_ranking(self, query: str, n: int) -> list[int]:
        """Chunk indices ordered by vector similarity, or [] when no vectors."""
        if self._collection is None:
            return []
        try:
            res = self._collection.query(query_texts=[query], n_results=min(n, len(self.chunks)), include=[])
            return [self._by_id[i] for i in res["ids"][0] if i in self._by_id]
        except Exception as e:  # noqa: BLE001 - a failed query degrades to lexical-only, never to an error
            log.warning("retrieval: chroma query failed (%s); lexical only for this request", type(e).__name__)
            return []

    # ---- public interface ----------------------------------------------------------
    def status(self) -> str:
        return "ok" if self.chunks else "unavailable"

    def info(self) -> dict:
        return {"chunks": len(self.chunks), "backend": self.backend, "requested": self.backend_requested, "error": self.backend_error,
                "path": str(self.chunks_path)}

    def retrieve(self, query: str, k: int = 6, geographic_relevance: list[str] | None = None) -> list[EvidenceChunk]:
        if not self.chunks:
            return []
        pool = max(k * 5, 30)
        lex = self._bm25.scores(tokenize(query))
        lex_rank = [i for i in sorted(range(len(self.chunks)), key=lambda i: -lex[i]) if lex[i] > 0][:pool]
        vec_rank = self._vector_ranking(query, pool)

        fused: dict[int, float] = {}
        for ranking in (lex_rank, vec_rank):
            for r, idx in enumerate(ranking, 1):
                fused[idx] = fused.get(idx, 0.0) + 1.0 / (RRF_K + r)
        if not fused:
            return []

        wanted = set(geographic_relevance or [])
        terms = geo_terms(geographic_relevance)
        scored: list[tuple[float, int]] = []
        for idx, s in fused.items():
            c = self.chunks[idx]
            if wanted and wanted & set(c.get("geographic_relevance", [])):
                s *= GEO_BOOST
            if terms and any(t in self._text_lower[idx] for t in terms):
                s *= TERM_BOOST
            scored.append((s, idx))
        scored.sort(key=lambda x: (-x[0], x[1]))
        out = []
        for s, idx in scored[:k]:
            c = self.chunks[idx]
            out.append(EvidenceChunk(chunk_id=c["chunk_id"], document_id=c["document_id"], title=c["title"], institution=c["institution"], url=c["url"],
                                     publication_date=c.get("publication_date"), geographic_relevance=c.get("geographic_relevance", []),
                                     excerpt=c["text"][:EXCERPT_CHARS], score=round(s, 6)))
        return out


@lru_cache
def get_retriever() -> Retriever:
    s = get_settings()
    return Retriever(s.data_dir / "documents" / "chunks.jsonl")
