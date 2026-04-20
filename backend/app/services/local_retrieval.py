from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


class LocalCorpus:
  def __init__(self, data_json_path: str, *, repo_root: Optional[Path] = None) -> None:
    self._bot_docs: List[Dict[str, Any]] = []
    self._chat_docs: List[Dict[str, Any]] = []
    self._bot_doc_freq: Dict[str, int] = {}
    self._load(data_json_path, repo_root=repo_root)

  @property
  def entry_count(self) -> int:
    return len(self._bot_docs)

  @staticmethod
  def tokenize(text: str) -> List[str]:
    return re.findall(r"\b[\w'-]{2,}\b", (text or '').lower())

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

      tokens = self.tokenize(text)
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

    query_tokens = self.tokenize(query)
    total_docs = max(1, len(docs))
    ranked = []
    for doc in docs:
      tokens = self.tokenize(str(doc.get('text') or ''))
      score = self._score_doc(query_tokens, tokens, total_docs)
      if score > 0:
        ranked.append((score, doc))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [{**doc, 'score': score} for score, doc in ranked[:k]]

  def _retrieve_bot_docs(self, query: str, *, k: int) -> List[Dict[str, Any]]:
    query_tokens = self.tokenize(query)
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
