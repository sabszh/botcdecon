from __future__ import annotations

import hashlib
import json
import math
import re
import threading
from functools import lru_cache
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
  import numpy as np
except Exception:  # pragma: no cover - numpy is expected but not required for fallback behavior
  np = None  # type: ignore[assignment]

try:
  from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - import guard for optional dependency
  SentenceTransformer = None  # type: ignore[assignment]

try:
  import faiss  # type: ignore
except Exception:  # pragma: no cover - optional dependency
  faiss = None  # type: ignore[assignment]

from ..settings import settings


@lru_cache(maxsize=2)
def _load_embedding_model(model_name: str):
  if SentenceTransformer is None:
    return None
  return SentenceTransformer(model_name)


@lru_cache(maxsize=4)
def get_local_corpus(data_json_path: str, repo_root: Optional[str] = None) -> "LocalCorpus":
  resolved_root = Path(repo_root).expanduser().resolve() if repo_root else None
  return LocalCorpus(data_json_path, repo_root=resolved_root)


class LocalCorpus:
  _TOKEN_SYNONYMS = {
    'empathy': 'empati',
    'empati': 'empati',
    'care': 'omsorg',
    'omsorg': 'omsorg',
    'love': 'kærlighed',
    'kærlighed': 'kærlighed',
    'peace': 'fred',
    'fred': 'fred',
    'future': 'fremtiden',
    'fremtiden': 'fremtiden',
    'copenhagen': 'københavn',
    'københavn': 'københavn',
    'berlin': 'berlin',
    'hygge': 'hygge',
    'together': 'hinanden',
    'hinanden': 'hinanden',
    'håber': 'håbe',
    'håbe': 'håbe',
    'ønsker': 'ønske',
    'ønske': 'ønske',
    'tror': 'tro',
    'tro': 'tro',
    'husker': 'huske',
    'huske': 'huske',
    'passer': 'passe',
    'pas': 'passe',
    'elsker': 'elske',
    'elske': 'elske',
  }

  _STOPWORDS = {
    'jeg', 'du', 'han', 'hun', 'den', 'det', 'de', 'en', 'et', 'og', 'at', 'på', 'i', 'til',
    'af', 'om', 'for', 'med', 'som', 'er', 'var', 'være', 'vil', 'skal', 'have', 'har', 'had',
    'mig', 'dig', 'sig', 'min', 'mit', 'mine', 'din', 'dit', 'dine', 'vi', 'der', 'da', 'nu', 'så',
    'ikke', 'en', 'et', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'my', 'your', 'our', 'we',
  }

  def __init__(self, data_json_path: str, *, repo_root: Optional[Path] = None) -> None:
    self._bot_docs: List[Dict[str, Any]] = []
    self._chat_docs: List[Dict[str, Any]] = []
    self._bot_doc_freq: Dict[str, int] = {}
    self._bot_embeddings = None
    self._faiss_index = None
    self._embedding_model = None
    self._embedding_cache_path: Optional[Path] = None
    self._embedding_model_lock = threading.Lock()
    self._load(data_json_path, repo_root=repo_root)

  @property
  def entry_count(self) -> int:
    return len(self._bot_docs)

  @staticmethod
  def tokenize(text: str) -> List[str]:
    return re.findall(r"\b[\w'-]{2,}\b", (text or '').lower())

  @classmethod
  def _normalize_token(cls, token: str) -> Optional[str]:
    token = (token or '').strip().lower()
    if not token:
      return None
    normalized = cls._TOKEN_SYNONYMS.get(token, token)
    if normalized in cls._STOPWORDS:
      return None
    return normalized

  @classmethod
  def _normalize_tokens(cls, text: str) -> List[str]:
    tokens = []
    for token in cls.tokenize(text):
      normalized = cls._normalize_token(token)
      if normalized:
        tokens.append(normalized)
    return tokens

  def _load(self, data_json_path: str, *, repo_root: Optional[Path]) -> None:
    root = repo_root or Path(__file__).resolve().parents[3]
    data_path = Path(data_json_path)
    if not data_path.is_absolute():
      data_path = root / data_path

    if not data_path.exists():
      print(f"[INIT] Local corpus not found at {data_path}")
      return

    with data_path.open('r', encoding='utf-8') as fh:
      raw = json.load(fh)

    seen: set[str] = set()
    doc_freq: Counter[str] = Counter()
    docs: List[Dict[str, Any]] = []

    for idx, item in enumerate(raw if isinstance(raw, list) else []):
      if not isinstance(item, dict):
        continue
      slug = str(item.get('slug') or '').strip()
      text = str(item.get('text') or '').strip()
      if not slug or not text:
        continue
      key = f"{slug}|{text}"
      if key in seen:
        continue
      seen.add(key)

      tokens = self._normalize_tokens(text)
      doc_freq.update(set(tokens))
      docs.append({
        'id': slug or f'local-{idx}',
        'score': 0.0,
        'metadata': {
          'slug': slug,
          'name': str(item.get('name') or ''),
          'location': str(item.get('location') or ''),
          'date': str(item.get('date') or ''),
          'text': text,
          'points': item.get('points') if isinstance(item.get('points'), list) else [],
        },
        'text': text,
        '_tokens': tokens,
      })

    self._bot_docs = docs
    self._bot_doc_freq = dict(doc_freq)
    self._initialize_embeddings(data_path)

  def _embedding_cache_file(self, *, data_path: Path, model_name: str) -> Path:
    corpus_digest = hashlib.sha256(data_path.read_bytes()).hexdigest()[:16]
    safe_model = re.sub(r'[^a-z0-9]+', '-', model_name.lower()).strip('-') or 'embedding-model'
    return settings.retrieval_cache_path / safe_model / f'{corpus_digest}'

  def _load_embedding_cache(self, cache_path: Path) -> Optional[Any]:
    meta_path = cache_path.with_suffix('.json')
    vectors_path = cache_path.with_suffix('.npz')
    if not meta_path.exists() or not vectors_path.exists():
      return None
    try:
      with meta_path.open('r', encoding='utf-8') as fh:
        meta = json.load(fh)
      with np.load(vectors_path, allow_pickle=False) as payload:
        embeddings = payload['embeddings']
      if int(meta.get('doc_count', -1)) != len(self._bot_docs):
        return None
      if str(meta.get('model_name') or '') != settings.retrieval_embedding_model:
        return None
      return np.asarray(embeddings, dtype=np.float32)
    except Exception as exc:
      print(f'[INIT] Failed to load embedding cache {cache_path}: {exc}')
      return None

  def _save_embedding_cache(self, cache_path: Path, embeddings: Any) -> None:
    try:
      cache_path.parent.mkdir(parents=True, exist_ok=True)
      vectors_path = cache_path.with_suffix('.npz')
      meta_path = cache_path.with_suffix('.json')
      np.savez_compressed(vectors_path, embeddings=np.asarray(embeddings, dtype=np.float32))
      meta_path.write_text(
        json.dumps(
          {
            'doc_count': len(self._bot_docs),
            'model_name': settings.retrieval_embedding_model,
          },
          ensure_ascii=False,
          indent=2,
        ),
        encoding='utf-8',
      )
    except Exception as exc:
      print(f'[INIT] Failed to write embedding cache {cache_path}: {exc}')

  def _initialize_embeddings(self, data_path: Path) -> None:
    if not settings.retrieval_use_embeddings:
      return
    if np is None:
      print('[INIT] Embeddings disabled because numpy is unavailable')
      return
    if not self._bot_docs:
      return

    model_name = settings.retrieval_embedding_model.strip()
    if not model_name:
      return

    cache_path = self._embedding_cache_file(data_path=data_path, model_name=model_name)
    self._embedding_cache_path = cache_path

    try:
      cached_embeddings = self._load_embedding_cache(cache_path)
      if cached_embeddings is not None:
        self._bot_embeddings = cached_embeddings
        self._build_faiss_index()
        print(f'[INIT] Loaded cached embeddings from {cache_path}')
        return

      self._embedding_model = self._get_embedding_model(model_name)
      documents = [self._embedding_text(doc) for doc in self._bot_docs]
      embeddings = self._encode_documents(documents)
      self._bot_embeddings = np.asarray(embeddings, dtype=np.float32)
      self._save_embedding_cache(cache_path, self._bot_embeddings)
      self._build_faiss_index()
      print(f'[INIT] Built and cached multilingual embeddings with {model_name}')
    except Exception as exc:
      self._embedding_model = None
      self._bot_embeddings = None
      self._faiss_index = None
      print(f'[INIT] Embeddings unavailable for {model_name}: {exc}')

  def _get_embedding_model(self, model_name: str):
    with self._embedding_model_lock:
      model = _load_embedding_model(model_name)
      return model

  def _encode_documents(self, documents: List[str]):
    if self._embedding_model is None:
      raise RuntimeError('embedding model is not loaded')
    return self._embedding_model.encode(
      documents,
      normalize_embeddings=True,
      batch_size=32,
      show_progress_bar=False,
    )

  def _build_faiss_index(self) -> None:
    if faiss is None or np is None or self._bot_embeddings is None:
      self._faiss_index = None
      return
    vectors = np.asarray(self._bot_embeddings, dtype=np.float32)
    if vectors.size == 0:
      self._faiss_index = None
      return
    dimension = int(vectors.shape[1])
    index = faiss.IndexFlatIP(dimension)
    index.add(vectors)
    self._faiss_index = index

  @staticmethod
  def _embedding_text(doc: Dict[str, Any]) -> str:
    metadata = doc.get('metadata') or {}
    parts = [
      str(doc.get('text') or '').strip(),
      str(metadata.get('title') or '').strip(),
      str(metadata.get('name') or '').strip(),
      str(metadata.get('location') or '').strip(),
    ]
    text = ' | '.join(part for part in parts if part)
    if text and not text.lower().startswith('passage:'):
      return f'passage: {text}'
    return text

  def _dense_retrieve_bot_docs(self, query: str, *, k: int) -> List[Dict[str, Any]]:
    if np is None:
      return []

    if self._embedding_model is None:
      model_name = settings.retrieval_embedding_model.strip()
      if not model_name:
        return []
      self._embedding_model = self._get_embedding_model(model_name)
      if self._embedding_model is None:
        return []

    query_text = f'{settings.retrieval_embedding_query_prefix}{query.strip()}' if not query.lower().startswith('query:') else query
    query_embedding = self._embedding_model.encode([query_text], normalize_embeddings=True, show_progress_bar=False)
    query_vector = np.asarray(query_embedding, dtype=np.float32)[0]
    if self._faiss_index is not None:
      scores, indices = self._faiss_index.search(np.asarray([query_vector], dtype=np.float32), min(k, len(self._bot_docs)))
      if indices.size == 0:
        return []
      results: List[Dict[str, Any]] = []
      for score, index in zip(scores[0], indices[0]):
        if index < 0 or not math.isfinite(float(score)):
          continue
        doc = self._bot_docs[int(index)]
        clean = {key: value for key, value in doc.items() if key != '_tokens'}
        clean['score'] = float(score)
        clean['_dense_score'] = float(score)
        results.append(clean)
      return results

    if self._bot_embeddings is None:
      return []

    scores = self._bot_embeddings @ query_vector
    if scores.size == 0:
      return []

    top_indices = np.argsort(scores)[::-1][:k]
    results: List[Dict[str, Any]] = []
    for index in top_indices:
      score = float(scores[index])
      if not math.isfinite(score):
        continue
      doc = self._bot_docs[int(index)]
      clean = {key: value for key, value in doc.items() if key != '_tokens'}
      clean['score'] = score
      clean['_dense_score'] = score
      results.append(clean)
    return results

  def _blend_results(self, dense_docs: List[Dict[str, Any]], sparse_docs: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
    if not dense_docs:
      return sparse_docs[:k]
    if not sparse_docs:
      return dense_docs[:k]

    by_id: Dict[str, Dict[str, Any]] = {}

    def add_result(doc: Dict[str, Any], dense_rank: Optional[int] = None, sparse_rank: Optional[int] = None) -> None:
      doc_id = str(doc.get('id') or doc.get('metadata', {}).get('slug') or '')
      if not doc_id:
        return
      item = by_id.setdefault(doc_id, {**doc})
      item.update(doc)
      if dense_rank is not None:
        item['_dense_rank'] = dense_rank
      if sparse_rank is not None:
        item['_sparse_rank'] = sparse_rank

    for rank, doc in enumerate(dense_docs, start=1):
      add_result(doc, dense_rank=rank)
    for rank, doc in enumerate(sparse_docs, start=1):
      add_result(doc, sparse_rank=rank)

    blended: List[Dict[str, Any]] = []
    for doc in by_id.values():
      dense_rank = doc.get('_dense_rank')
      sparse_rank = doc.get('_sparse_rank')
      dense_bonus = 0.0 if dense_rank is None else 1.0 / (50.0 + float(dense_rank))
      sparse_bonus = 0.0 if sparse_rank is None else 1.0 / (50.0 + float(sparse_rank))
      score = float(doc.get('_dense_score') or 0.0) + float(doc.get('score') or 0.0) + dense_bonus + sparse_bonus
      clean = {key: value for key, value in doc.items() if key not in {'_tokens', '_dense_rank', '_sparse_rank', '_dense_score'}}
      clean['score'] = score
      blended.append(clean)

    blended.sort(key=lambda item: item.get('score', 0.0), reverse=True)
    return blended[:k]

  def _score_doc(self, query_tokens: List[str], tokens: List[str], total_docs: int) -> float:
    if not query_tokens or not tokens or total_docs <= 0:
      return 0.0
    tf = Counter(tokens)
    doc_len = len(tokens)
    score = 0.0
    for qt in query_tokens:
      freq = tf.get(qt, 0)
      if freq == 0:
        continue
      df = self._bot_doc_freq.get(qt, 0)
      idf = 1.0 + (total_docs / (1.0 + df))
      score += (freq / (doc_len + 1.0)) * idf
    return score

  def retrieve(
    self,
    query: str,
    *,
    index_name: str,
    chat_index_name: str,
    excluded_session_id: Optional[str],
    k: int,
  ) -> List[Dict[str, Any]]:
    if index_name == chat_index_name:
      return self._retrieve_chat_docs(query, excluded_session_id=excluded_session_id, k=k)
    return self._retrieve_bot_docs(query, k=k)

  def _retrieve_chat_docs(self, query: str, *, excluded_session_id: Optional[str], k: int) -> List[Dict[str, Any]]:
    docs = []
    for doc in self._chat_docs:
      sid = str(doc.get('metadata', {}).get('session_id') or '')
      if excluded_session_id and sid == excluded_session_id:
        continue
      docs.append(doc)

    session_matches = [d for d in docs if str(d.get('metadata', {}).get('session_id') or '') == query]
    if session_matches:
      ordered = sorted(session_matches, key=lambda d: d.get('metadata', {}).get('date', ''), reverse=True)
      return ordered[:k]

    query_tokens = self._normalize_tokens(query)
    total_docs = max(1, len(docs))
    ranked = []
    for doc in docs:
      tokens = self._normalize_tokens(str(doc.get('text') or ''))
      score = self._score_doc(query_tokens, tokens, total_docs)
      if score > 0:
        ranked.append((score, doc))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [{**doc, 'score': score} for score, doc in ranked[:k]]

  def _retrieve_bot_docs(self, query: str, *, k: int) -> List[Dict[str, Any]]:
    query_tokens = self._normalize_tokens(query)
    total_docs = max(1, len(self._bot_docs))
    ranked = []
    for doc in self._bot_docs:
      score = self._score_doc(query_tokens, doc.get('_tokens', []), total_docs)
      if score > 0:
        ranked.append((score, doc))
    ranked.sort(key=lambda x: x[0], reverse=True)

    out: List[Dict[str, Any]] = []
    for score, doc in ranked[:k]:
      clean = {key: value for key, value in doc.items() if key != '_tokens'}
      clean['score'] = score
      out.append(clean)
    dense_docs = self._dense_retrieve_bot_docs(query, k=max(k, 10))
    if dense_docs:
      return self._blend_results(dense_docs, out, k)
    return out

  def add_chat_turn(
    self,
    *,
    user_input: str,
    ai_output: str,
    user_name: str,
    user_location: str,
    session_id: str,
    continuous_data: Optional[Dict[str, Any]],
  ) -> None:
    ts_iso = datetime.now(timezone.utc).isoformat()
    doc = {
      "id": ts_iso,
      "score": 1.0,
      "metadata": {
        "user_question": user_input,
        "ai_output": ai_output,
        "user_name": user_name,
        "session_id": session_id,
        "date": ts_iso,
        "user_location": user_location,
        "text": f"User input: {user_input}\nAI output: {ai_output}",
        "continuous_data": json.dumps(continuous_data) if continuous_data else "",
      },
      "text": f"User input: {user_input}\nAI output: {ai_output}",
    }
    self._chat_docs.append(doc)

  def retrieve_session(self, session_id: str, *, k: int = 20) -> List[Dict[str, Any]]:
    docs = [
      d for d in self._chat_docs
      if str(d.get('metadata', {}).get('session_id') or '') == session_id
    ]
    docs.sort(key=lambda d: d.get('metadata', {}).get('date', ''), reverse=True)
    return docs[:k]

  def clear_session(self, session_id: str) -> None:
    if not session_id:
      return
    self._chat_docs = [
      d for d in self._chat_docs
      if str(d.get('metadata', {}).get('session_id') or '') != session_id
    ]
