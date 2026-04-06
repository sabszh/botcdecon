# -*- coding: utf-8 -*-
import os
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any, Optional, Literal, Type, TypeVar

from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from pydantic import BaseModel, Field, ValidationError
try:
    from pinecone import Pinecone, ServerlessSpec, CloudProvider, AwsRegion
except Exception:  # pragma: no cover - optional dependency in local mode
    Pinecone = None  # type: ignore
    ServerlessSpec = None  # type: ignore
    CloudProvider = None  # type: ignore
    AwsRegion = None  # type: ignore
from .app.services.llm import LLMProvider, get_llm_provider
from .app.settings import settings

load_dotenv()


class StructuredHandoffDecision(BaseModel):
    decision: Literal["continue", "return"]


ParsedModelT = TypeVar("ParsedModelT", bound=BaseModel)


def _cloud_from_env():
    if CloudProvider is None:
        return None
    c = os.getenv("PINECONE_CLOUD", "AWS").upper()
    return getattr(CloudProvider, c, CloudProvider.AWS)


def _region_from_env():
    if AwsRegion is None:
        return None
    r = os.getenv("PINECONE_REGION", "US_EAST_1").upper()
    return getattr(AwsRegion, r, AwsRegion.US_EAST_1)


class ChatBot:
    def __init__(
        self,
        repo_id: str = None,
        temperature: float = 0.6,
        index_name_bot: str = None,
        index_name_chat: str = None,
        language: str = "da",
    ):
        self.retriever_provider = settings.retriever_provider
        self.embeddings = None
        self.pc = None
        self.cloud = _cloud_from_env()
        self.region = _region_from_env()
        self._bot_docs: List[Dict[str, Any]] = []
        self._chat_docs: List[Dict[str, Any]] = []
        self._bot_doc_freq: Dict[str, int] = {}

        self.index_name_bot = index_name_bot or os.getenv("INDEX_NAME_BOT", "botcon")
        self.index_name_chat = index_name_chat or os.getenv("INDEX_NAME_CHAT", "bdc-interaction-data")

        if self.retriever_provider == 'pinecone' and settings.has_pinecone and Pinecone is not None:
            # Use HuggingFace Endpoint for embeddings (no local model needed)
            self.embeddings = HuggingFaceEndpointEmbeddings(
                model="sentence-transformers/all-mpnet-base-v2",
                huggingfacehub_api_token=os.getenv("HUGGINGFACE_API_KEY")
            )
            print("[INIT] Retriever provider: pinecone")
            self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
            # ensure indexes exist
            self._ensure_index(self.index_name_bot, dimension=768)
            self._ensure_index(self.index_name_chat, dimension=768)
        else:
            self.retriever_provider = 'local'
            self._load_local_corpus()
            print(f"[INIT] Retriever provider: local ({len(self._bot_docs)} corpus entries)")

        self.repo_id = repo_id or os.getenv("LLM_REPO_ID")
        self.temperature = temperature
        self.language = language.lower()  # 'da' or 'en'

        self.llm_provider: LLMProvider = get_llm_provider()

    # ---------- helpers ----------
    def _ensure_index(self, name: str, dimension: int):
        if not self.pc or ServerlessSpec is None:
            return
        try:
            existing = {ix["name"]: ix for ix in self.pc.list_indexes()}
            if name not in existing:
                self.pc.create_index(
                    name=name,
                    dimension=dimension,
                    spec=ServerlessSpec(cloud=self.cloud, region=self.region),
                )
        except Exception:
            try:
                self.pc.create_index(
                    name=name,
                    dimension=dimension,
                    spec=ServerlessSpec(cloud=self.cloud, region=self.region),
                )
            except Exception:
                pass

    def _index(self, name: str):
        if not self.pc:
            raise RuntimeError('Pinecone index requested but client is not configured')
        return self.pc.Index(name)

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r"\b[\w'-]{2,}\b", (text or '').lower())

    def _load_local_corpus(self) -> None:
        root = Path(__file__).resolve().parent.parent
        data_path = Path(settings.data_json_path)
        if not data_path.is_absolute():
            data_path = root / data_path

        if not data_path.exists():
            print(f"[INIT] Local corpus not found at {data_path}")
            self._bot_docs = []
            self._bot_doc_freq = {}
            return

        with data_path.open('r', encoding='utf-8') as fh:
            raw = json.load(fh)

        seen: set[str] = set()
        docs: List[Dict[str, Any]] = []
        doc_freq: Counter[str] = Counter()

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

            tokens = self._tokenize(text)
            unique_tokens = set(tokens)
            doc_freq.update(unique_tokens)

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

    def _score_local_doc(self, query_tokens: List[str], tokens: List[str], total_docs: int) -> float:
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

    def _retrieve_local_docs(self, query: str, index_name: str, excluded_session_id: Optional[str], k: int) -> List[Dict[str, Any]]:
        if index_name == self.index_name_chat:
            docs = []
            for doc in self._chat_docs:
                sid = str(doc.get('metadata', {}).get('session_id') or '')
                if excluded_session_id and sid == excluded_session_id:
                    continue
                docs.append(doc)

            # Session lookup path: query can be session id.
            session_matches = [d for d in docs if str(d.get('metadata', {}).get('session_id') or '') == query]
            if session_matches:
                ordered = sorted(session_matches, key=lambda d: d.get('metadata', {}).get('date', ''), reverse=True)
                return ordered[:k]

            query_tokens = self._tokenize(query)
            total_docs = max(1, len(docs))
            ranked = []
            for doc in docs:
                tokens = self._tokenize(str(doc.get('text') or ''))
                score = self._score_local_doc(query_tokens, tokens, total_docs)
                if score > 0:
                    ranked.append((score, doc))
            ranked.sort(key=lambda x: x[0], reverse=True)
            return [
                {**doc, 'score': score}
                for score, doc in ranked[:k]
            ]

        query_tokens = self._tokenize(query)
        total_docs = max(1, len(self._bot_docs))
        ranked = []
        for doc in self._bot_docs:
            score = self._score_local_doc(query_tokens, doc.get('_tokens', []), total_docs)
            if score > 0:
                ranked.append((score, doc))
        ranked.sort(key=lambda x: x[0], reverse=True)

        out: List[Dict[str, Any]] = []
        for score, doc in ranked[:k]:
            clean = {key: value for key, value in doc.items() if key != '_tokens'}
            clean['score'] = score
            out.append(clean)
        return out

    # ---------- prompts ----------
    def default_prompt_sourcedata(self, chat_history: str, original_data: str, user_input: str, user_name: str):
        if self.language == "en":
            return f"""
SYSTEM ROLE:
You are a helpful assistant connected to the artwork "Carte de Continuonus".
Your role is to connect this visitor with what other contributors have shared.

RESPONSE RULES:
- grounded, clear, warm
- avoid poetic language
- final answer must be 3–5 sentences
- directly answer the user's question in the first sentence
- do not use names; refer to people as "a contributor", "visitor", "participant", or "guest"
- you may analyse patterns across many retrieved entries, but mention at most five contributors directly
- use only retrieved details that are relevant
- when helpful, use map metadata such as emotions, distances, dates, locations, and point coordinates
- weave 2–3 short direct quotes into the answer when they are relevant
- mention recurring or contrasting emotions inside the answer when they help explain the pattern

INPUT:
{{
  "user_question": "{user_input}",
  "conversation_so_far": "{chat_history}",
  "retrieved_contributor_context": "{original_data}"
}}

REQUIRED OUTPUT:
Return only the final visitor-facing answer as plain text.
"""
        else:  # Danish
            return f"""
SYSTEMROLLE:
Du er en hjælpsom assistent forbundet til kunstværket "Carte de Continuonus".
Din rolle er at forbinde denne besøgende med, hvad andre bidragydere har delt.

SVARREGLER:
- jordnær, klar, varm
- undgå poetisk sprog
- det endelige svar skal være 3–5 sætninger
- besvar brugerens spørgsmål direkte i den første sætning
- brug ikke navne; omtæl folk som "en bidragyder", "besøgende", "deltager" eller "gæst"
- du må gerne analysere mønstre på tværs af mange fund, men nævn højst fem bidragydere direkte
- brug kun detaljer, der er relevante for spørgsmålet
- brug gerne kortmetadata som følelser, afstande, datoer, lokationer og koordinater, når det styrker svaret
- væv 2–3 korte direkte citater ind i selve svaret, når de er relevante
- nævn tilbagevendende eller kontrasterende følelser inde i svaret, når det hjælper forklaringen

INPUT:
{{
  "user_question": "{user_input}",
  "conversation_so_far": "{chat_history}",
  "retrieved_contributor_context": "{original_data}"
}}

PÅKRÆVET OUTPUT:
Returnér kun det endelige svar til den besøgende som almindelig tekst.
"""

    def default_prompt_conv(self, chat_history: str, user_input: str, llm_response: str, past_chat: str, user_name: str):
        if self.language == "en":
            return f"""
You are a helpful assistant for the "Carte de Continuonus" artwork.
Connect the user's question with relevant insights from previous conversations.

Tone: practical, kind, connecting people. Keep it short (1–3 sentences). Avoid names; say "a contributor said". Use at most five contributors.
Vocabulary: When referring to people, vary your wording between "visitor", "contributor", "participant", or "guest" to keep phrasing fresh.

User asked: "{user_input}"
Previous response: "{llm_response}"
Relevant past conversations (up to five): {past_chat}
Current session: {chat_history}

IMPORTANT: Respond in English and do not include any personal identifiers.
"""
        else:  # Danish
            return f"""
Du er en hjælpsom assistent for kunstværket "Carte de Continuonus".
Forbind brugerens spørgsmål med relevante indsigter fra tidligere samtaler.

Tone: praktisk, venlig, forbinder mennesker. Hold det kort (1–3 sætninger). Undgå navne; sig "en bidragyder sagde". Brug højst fem bidrag.
Ordvalg: Når du omtaler personer, så variér mellem "besøgende", "bidragyder", "deltager" eller "gæst" for at undgå gentagelser.

Bruger spurgte: "{user_input}"
Tidligere svar: "{llm_response}"
Relevante tidligere samtaler (op til fem): {past_chat}
Nuværende session: {chat_history}

VIGTIGT: Svar på dansk og undlad personlige oplysninger.
"""

    # ---------- retrieval ----------
    def retrieve_docs(self, query: str, index_name: str, excluded_session_id: Optional[str] = None, k: int = 15) -> List[Dict[str, Any]]:
        if self.retriever_provider == 'local':
            docs = self._retrieve_local_docs(query, index_name, excluded_session_id, k)
            print(f"[BOT] Local retrieval index='{index_name}' k={k} -> {len(docs)} docs")
            return docs

        index = self._index(index_name)
        print(f"[BOT] Querying index='{index_name}' k={k} excluded_session_id={bool(excluded_session_id)} query_len={len(query or '')}")

        try:
            query_vec = self.embeddings.embed_query(query)
        except Exception as e:
            print(f"[ERROR] Failed to generate query embedding: {e}")
            print(f"[ERROR] This might be due to HuggingFace API issues or invalid API key")
            # Return empty results if embedding fails
            return []

        metadata_filter = None
        if index_name == self.index_name_chat and excluded_session_id:
            metadata_filter = {"session_id": {"$ne": excluded_session_id}}

        res = index.query(
            vector=query_vec,
            top_k=k,
            include_metadata=True,
            filter=metadata_filter,
        )

        docs = []
        for m in res.get("matches", []):
            md = m.get("metadata", {}) or {}
            docs.append({
                "id": m["id"],
                "score": m["score"],
                "metadata": md,
                "text": md.get("text", "")
            })
        print(f"[BOT] Retrieved {len(docs)} docs from '{index_name}'")
        return docs

    # ---------- post-process ----------
    @staticmethod
    def enforce_concise(text: str, max_sentences: int = 5, max_words: int = 120) -> str:
        if not text:
            return ''
        import re
        # Remove stage directions / poetic parentheticals
        text = re.sub(r"\([^\)]*\)", "", text)
        # Split into sentences crudely on ., !, ?
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        sentences = [s.strip() for s in sentences if s.strip()]
        sentences = sentences[:max_sentences]
        result = ' '.join(sentences)
        # Word cap
        words = result.split()
        if len(words) > max_words:
            result = ' '.join(words[:max_words]) + '…'
        return result

    @staticmethod
    def _format_points(points: Any) -> str:
        if not isinstance(points, list) or not points:
            return "none"
        parts: List[str] = []
        for point in points[:4]:
            if not isinstance(point, dict):
                continue
            emotion = str(point.get("emotion") or "").strip() or "unknown"
            distance = point.get("distance")
            x = point.get("x")
            y = point.get("y")
            details = [f"emotion={emotion}"]
            if distance is not None:
                details.append(f"distance={distance}")
            if x is not None and y is not None:
                details.append(f"coords=({x},{y})")
            parts.append(", ".join(details))
        return " | ".join(parts) if parts else "none"

    @staticmethod
    def _extract_first_json_object(text: str) -> Optional[str]:
        if not text:
            return None
        start = text.find("{")
        if start < 0:
            return None

        depth = 0
        in_string = False
        escaped = False
        for idx in range(start, len(text)):
            ch = text[idx]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue

            if ch == '"':
                in_string = True
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:idx + 1]
        return None

    def _parse_llm_json(self, raw_text: str, model_type: Type[ParsedModelT]) -> Optional[ParsedModelT]:
        payload = self._extract_first_json_object(raw_text or "")
        if not payload:
            return None
        try:
            data = json.loads(payload)
            return model_type.model_validate(data)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            return None

    def format_context(self, documents: List[Dict[str, Any]], chat: bool = False) -> str:
        documents = list(documents)[:15]
        parts = []
        def _shorten(s: str, max_chars: int = 160) -> str:
            s = (s or "").replace("\n", " ").strip()
            return (s[:max_chars] + ('…' if len(s) > max_chars else ''))
        for idx, doc in enumerate(documents, start=1):
            md = doc["metadata"]
            if not chat:
                content = _shorten(doc.get("text", ""), 220)
                location = _shorten(md.get("location", ""), 60) or "unknown"
                date = _shorten(md.get("date", ""), 40) or "unknown"
                points = self._format_points(md.get("points"))
                parts.append(
                    f'Contributor #{idx}: memory="{content}" | location={location} | date={date} | points={points}'
                )
            else:
                q = _shorten(md.get("user_question", "Unknown Question"), 120)
                a = _shorten(md.get("ai_output", "Unknown Response"), 120)
                parts.append(f'A contributor asked: "{q}" and received: "{a}"')
        return "\n".join(parts)

    # ---------- llm ----------
    def get_llm_response(
        self,
        prompt: str,
        *,
        temperature: Optional[float] = None,
        max_tokens: int = 512,
    ) -> str:
        try:
            return self.llm_provider.generate(
                prompt=prompt,
                temperature=min(self.temperature, 0.4) if temperature is None else temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            return f"Error invoking LLM: {exc}"

    @staticmethod
    def _normalize_handoff_reply(user_input: str) -> str:
        normalized = (user_input or "").strip().lower()
        normalized = re.sub(r"\s+", " ", normalized)
        normalized = re.sub(r"^[\"'“”‘’\s]+|[\"'“”‘’\s]+$", "", normalized)
        normalized = re.sub(r"[.!]+$", "", normalized)
        return normalized

    def _quick_handoff_decision(self, user_input: str) -> Optional[str]:
        normalized = self._normalize_handoff_reply(user_input)
        if not normalized:
            return "return"

        if "?" in user_input:
            return "continue"

        if len(normalized.split()) > 6:
            return None

        if self.language == "da":
            return_phrases = {
                "nej", "nej tak", "ellers tak", "det var alt", "det er alt",
                "jeg er færdig", "færdig", "slut", "videre",
            }
            continue_phrases = {
                "ja", "ja tak", "gerne", "ok", "okay", "mere",
                "et spørgsmål mere", "endnu et spørgsmål",
            }
        else:
            return_phrases = {
                "no", "no thanks", "no thank you", "i'm good", "im good",
                "that's all", "thats all", "done", "finished", "stop",
            }
            continue_phrases = {
                "yes", "yes please", "sure", "ok", "okay", "more",
                "one more", "another question",
            }

        if normalized in return_phrases:
            return "return"
        if normalized in continue_phrases:
            return "continue"
        return None

    def classify_handoff(self, user_input: str, language: Optional[str] = None) -> str:
        if language:
            self.language = language.lower()

        quick_decision = self._quick_handoff_decision(user_input)
        if quick_decision:
            return quick_decision

        if self.language == "da":
            prompt = f"""
Du afgør kun, om en museumsbesøgende vil fortsætte samtalen eller afslutte den.

REGLER:
- continue betyder, at personen vil stille et spørgsmål mere eller fortsætte samtalen
- return betyder, at personen vil videre, afslutte eller ikke spørge mere
- hvis svaret er uklart, men lyder som et nyt emne eller spørgsmål, vælg continue
- hvis svaret er uklart, men lyder som afvisning, stop, nej, færdig eller afslutning, vælg return

INPUT:
{{
  "visitor_reply": "{user_input}"
}}

PÅKRÆVET OUTPUT:
Returnér præcis ét JSON-objekt og intet andet:
{{
  "decision": "continue" | "return"
}}
"""
        else:
            prompt = f"""
Decide only whether a museum visitor wants to continue the conversation or end it.

RULES:
- continue means they want to ask something else or keep talking
- return means they want to move on, stop, or ask nothing more
- if the answer is ambiguous but sounds like a new topic or question, choose continue
- if the answer is ambiguous but sounds like refusal, stopping, being done, or ending, choose return

INPUT:
{{
  "visitor_reply": "{user_input}"
}}

REQUIRED OUTPUT:
Return exactly one JSON object and nothing else:
{{
  "decision": "continue" | "return"
}}
"""

        response = (self.get_llm_response(
            prompt,
            temperature=0.0,
            max_tokens=16,
        ) or '').strip()
        parsed = self._parse_llm_json(response, StructuredHandoffDecision)
        if parsed:
            return parsed.decision
        if 'RETURN' in response.upper():
            return 'return'
        return 'continue'

    # ---------- upsert ----------
    def upsert_vectorstore(
        self,
        user_input: str,
        ai_output: str,
        user_name: str,
        user_location: str,
        session_id: str,
        continuous_data: Optional[Dict[str, Any]] = None,
    ):
        if self.retriever_provider == 'local':
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
            return

        index = self._index(self.index_name_chat)
        ts_iso = datetime.now(timezone.utc).isoformat()

        try:
            embedding = self.embeddings.embed_documents([user_input + ai_output])[0]
        except Exception as e:
            print(f"[ERROR] Failed to generate embedding: {e}")
            print(f"[ERROR] This might be due to HuggingFace API issues or invalid API key")
            # Create a dummy embedding with correct dimensions to avoid breaking the flow
            import random
            embedding = [random.random() for _ in range(768)]
            print(f"[WARNING] Using random embedding as fallback")

        md = {
            "user_question": user_input,
            "ai_output": ai_output,
            "user_name": user_name,
            "session_id": session_id,
            "date": ts_iso,
            "user_location": user_location,
            "text": f"User input: {user_input}\nAI output: {ai_output}",
        }

        if continuous_data:
            md["continuous_data"] = json.dumps(continuous_data)

        index.upsert(vectors=[{
            "id": ts_iso,
            "values": embedding,
            "metadata": md
        }])

    # ---------- pipeline ----------
    def pipeline(self, user_input: str, user_name: str, session_id: str, user_location: str,
                 chat_history: Optional[str] = None,
                 continuous_data: Optional[Dict[str, Any]] = None,
                 language: Optional[str] = None,
                 persist: bool = True,
                 include_session_history: bool = False,
                 retrieval_k: int = 15) -> Dict[str, Any]:
        import time

        # Update language if provided in this call
        if language:
            self.language = language.lower()

        chat_history = (chat_history + "\n\n") if chat_history else ""

        print(f"[BOT] Retrieving source documents...")
        t1 = time.time()
        source_data = self.retrieve_docs(user_input, self.index_name_bot, k=max(3, retrieval_k))
        formatted_source_data = self.format_context(source_data)
        retrieval_ms = (time.time() - t1) * 1000
        print(f"[BOT] Source retrieval took {retrieval_ms/1000:.2f}s; showing up to 5 snippets:")
        for i, d in enumerate(source_data[:5], start=1):
            txt = (d.get("text", "") or "").replace("\n", " ")
            print(f"  [SRC#{i}] {txt[:200]}{'...' if len(txt)>200 else ''}")

        print(f"[BOT] Calling LLM (first response)...")
        t2 = time.time()
        prompt1 = self.default_prompt_sourcedata(chat_history, formatted_source_data, user_input, user_name)
        print("[BOT] Prompt1:\n" + prompt1)
        resp1 = self.get_llm_response(prompt1)
        llm_ms = (time.time() - t2) * 1000
        print(f"[BOT] LLM response 1 took {llm_ms/1000:.2f}s")
        print("[BOT] Resp1 snippet:\n" + (resp1[:400] if resp1 else ""))

        # Skipping past conversation context to focus on Carte (botcon) data only
        ai_output_raw = (resp1 or '').strip()
        ai_output = ai_output_raw

        upsert_ms = 0.0
        if persist:
            print(f"[BOT] Upserting to vectorstore (index='{self.index_name_chat}')...")
            t5 = time.time()
            self.upsert_vectorstore(user_input, ai_output, user_name, user_location, session_id, continuous_data)
            upsert_ms = (time.time() - t5) * 1000
            print(f"[BOT] Upsert took {upsert_ms/1000:.2f}s")

        session_history = self.retrieve_session(session_id) if include_session_history else []
        return {
            "ai_output": ai_output,
            "source_data": source_data,
            "past_chat_context": [],
            "session_history": session_history,
            "timings": {
                "retrieval_ms": round(retrieval_ms, 2),
                "llm_ms": round(llm_ms, 2),
                "upsert_ms": round(upsert_ms, 2),
            }
        }

    def retrieve_session(self, session_id: str, k: int = 20) -> List[Dict[str, Any]]:
        if self.retriever_provider == 'local':
            docs = [
                d for d in self._chat_docs
                if str(d.get('metadata', {}).get('session_id') or '') == session_id
            ]
            docs.sort(key=lambda d: d.get('metadata', {}).get('date', ''), reverse=True)
            return docs[:k]

        docs = self.retrieve_docs(session_id, self.index_name_chat, excluded_session_id=None, k=k)

        def parse_dt(d):
            try:
                return datetime.fromisoformat(d.replace("Z", ""))
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)

        docs.sort(key=lambda d: parse_dt(d["metadata"].get("date", "")), reverse=True)
        return docs
