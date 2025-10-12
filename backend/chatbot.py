# -*- coding: utf-8 -*-
import os
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from pinecone import Pinecone, ServerlessSpec, CloudProvider, AwsRegion

load_dotenv()


def _cloud_from_env():
    c = os.getenv("PINECONE_CLOUD", "AWS").upper()
    return getattr(CloudProvider, c, CloudProvider.AWS)


def _region_from_env():
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
        # Use HuggingFace Endpoint for embeddings (no local model needed)
        # Using sentence-transformers/all-mpnet-base-v2 (768 dims, reliable with API)
        self.embeddings = HuggingFaceEndpointEmbeddings(
            model="sentence-transformers/all-mpnet-base-v2",
            huggingfacehub_api_token=os.getenv("HUGGINGFACE_API_KEY")
        )
        print(f"[INIT] Using HuggingFace Endpoint for embeddings")
        print(f"[INIT] Model: sentence-transformers/all-mpnet-base-v2 (768 dimensions)")
        self.pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        self.cloud = _cloud_from_env()
        self.region = _region_from_env()

        self.index_name_bot = index_name_bot or os.getenv("INDEX_NAME_BOT", "botcon")
        self.index_name_chat = index_name_chat or os.getenv("INDEX_NAME_CHAT", "bdc-interaction-data")

        # ensure indexes exist - BAAI/bge-large-en-v1.5 uses 768 dimensions (same as original)
        self._ensure_index(self.index_name_bot, dimension=768)
        self._ensure_index(self.index_name_chat, dimension=768)

        self.repo_id = repo_id or os.getenv("LLM_REPO_ID")
        self.temperature = temperature
        self.language = language.lower()  # 'da' or 'en'

        self.llm_client = InferenceClient(
            provider="cerebras",
            api_key=os.getenv("HUGGINGFACE_API_KEY"),
        )

    # ---------- helpers ----------
    def _ensure_index(self, name: str, dimension: int):
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
        return self.pc.Index(name)

    # ---------- prompts ----------
    def default_prompt_sourcedata(self, chat_history: str, original_data: str, user_input: str, user_name: str):
        if self.language == "en":
            return f"""
You are a helpful assistant connected to the artwork "Carte de Continuonus".
Your role is to connect this visitor with what other contributors have shared.

Style: grounded, clear, warm. Use 3–5 sentences. Avoid poetic language.
Anonymity: Do not use names; refer to others as "a contributor". Use at most five contributors.
Quoting: Include 2–3 brief direct quotes in double quotes from contributors when possible.
Connection: Connect contributors’ entries (how their ideas relate or differ) while staying factual and directly address the user's question in the first sentence.
Relevance: Use only items clearly related to the user's question; omit anything unrelated.

User asked: "{user_input}"
What contributors said (up to five, quoted): {original_data}
Conversation so far: {chat_history}

IMPORTANT: Respond in English, be concise, and focus on connecting people.
"""
        else:  # Danish
            return f"""
Du er en hjælpsom assistent forbundet til kunstværket "Carte de Continuonus".
Din rolle er at forbinde denne besøgende med, hvad andre bidragydere har delt.

Stil: jordnær, klar, varm. Brug 3–5 sætninger. Undgå poetisk sprog.
Anonymitet: Brug ikke navne; henvis til andre som "en bidragyder". Brug højst fem bidrag.
Citater: Medtag 2–3 korte direkte citater i dobbelte anførselstegn fra bidragydere, når det er muligt.
Forbindelse: Forbind bidragydernes indlæg (hvordan idéerne hænger sammen eller adskiller sig) og svar direkte på brugerens spørgsmål i den første sætning.
Relevans: Brug kun indhold, der tydeligt vedrører brugerens spørgsmål; udelad uvedkommende indhold.

Brugerens spørgsmål: "{user_input}"
Hvad bidragydere sagde (op til fem, citeret): {original_data}
Samtale indtil nu: {chat_history}

VIGTIGT: Svar på dansk, vær præcis, og forbind folk.
"""

    def default_prompt_conv(self, chat_history: str, user_input: str, llm_response: str, past_chat: str, user_name: str):
        if self.language == "en":
            return f"""
You are a helpful assistant for the "Carte de Continuonus" artwork.
Connect the user's question with relevant insights from previous conversations.

Tone: practical, kind, connecting people. Keep it short (1–3 sentences). Avoid names; say "a contributor said". Use at most five contributors.

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

Bruger spurgte: "{user_input}"
Tidligere svar: "{llm_response}"
Relevante tidligere samtaler (op til fem): {past_chat}
Nuværende session: {chat_history}

        VIGTIGT: Svar på dansk og undlad personlige oplysninger.
"""

    # ---------- retrieval ----------
    def retrieve_docs(self, query: str, index_name: str, excluded_session_id: Optional[str] = None, k: int = 5) -> List[Dict[str, Any]]:
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

    def format_context(self, documents: List[Dict[str, Any]], chat: bool = False) -> str:
        # Hard cap the number of items we include to five
        documents = list(documents)[:5]
        parts = []
        def _shorten(s: str, max_chars: int = 160) -> str:
            s = (s or "").replace("\n", " ").strip()
            return (s[:max_chars] + ('…' if len(s) > max_chars else ''))
        for idx, doc in enumerate(documents, start=1):
            md = doc["metadata"]
            if not chat:
                content = _shorten(doc.get("text", ""), 160)
                # Anonymise: avoid names and specifics; quote directly where possible
                parts.append(f"A contributor said: \"{content}\"")
            else:
                q = _shorten(md.get("user_question", "Unknown Question"), 120)
                a = _shorten(md.get("ai_output", "Unknown Response"), 120)
                parts.append(f'A contributor asked: "{q}" and received: "{a}"')
        return "\n".join(parts)

    # ---------- llm ----------
    def get_llm_response(self, prompt: str) -> str:
        try:
            completion = self.llm_client.chat.completions.create(
                model="meta-llama/Llama-3.1-8B-Instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=min(self.temperature, 0.4),
                max_tokens=512,
            )
            return completion.choices[0].message.content
        except Exception:
            try:
                text = self.llm_client.text_generation(
                    prompt,
                    model=self.repo_id,
                    max_new_tokens=512,
                    temperature=min(self.temperature, 0.4),
                )
                return text
            except Exception as e2:
                return f"Error invoking LLM: {e2}"

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
                 language: Optional[str] = None) -> Dict[str, Any]:
        import time

        # Update language if provided in this call
        if language:
            self.language = language.lower()

        chat_history = (chat_history + "\n\n") if chat_history else ""

        print(f"[BOT] Retrieving source documents...")
        t1 = time.time()
        # Retrieve a wider set (k=20) so the model can select the most relevant items
        source_data = self.retrieve_docs(user_input, self.index_name_bot, k=20)
        formatted_source_data = self.format_context(source_data)
        print(f"[BOT] Source retrieval took {time.time()-t1:.2f}s; showing up to 5 snippets:")
        for i, d in enumerate(source_data[:5], start=1):
            txt = (d.get("text", "") or "").replace("\n", " ")
            print(f"  [SRC#{i}] {txt[:200]}{'...' if len(txt)>200 else ''}")

        print(f"[BOT] Calling LLM (first response)...")
        t2 = time.time()
        prompt1 = self.default_prompt_sourcedata(chat_history, formatted_source_data, user_input, user_name)
        print("[BOT] Prompt1:\n" + prompt1)
        resp1 = self.get_llm_response(prompt1)
        print(f"[BOT] LLM response 1 took {time.time()-t2:.2f}s")
        print("[BOT] Resp1 snippet:\n" + (resp1[:400] if resp1 else ""))

        # Skipping past conversation context to focus on Carte (botcon) data only
        ai_output_raw = (resp1 or '').strip()
        # Do not truncate/cut off text; rely on prompt to keep it short
        ai_output = ai_output_raw

        print(f"[BOT] Upserting to vectorstore (index='{self.index_name_chat}')...")
        t5 = time.time()
        self.upsert_vectorstore(user_input, ai_output, user_name, user_location, session_id, continuous_data)
        print(f"[BOT] Upsert took {time.time()-t5:.2f}s")

        session_history = self.retrieve_session(session_id)
        return {
            "ai_output": ai_output,
            "source_data": source_data,
            "past_chat_context": [],
            "session_history": session_history,
        }

    def retrieve_session(self, session_id: str, k: int = 20) -> List[Dict[str, Any]]:
        docs = self.retrieve_docs(session_id, self.index_name_chat, excluded_session_id=None, k=k)

        def parse_dt(d):
            try:
                return datetime.fromisoformat(d.replace("Z", ""))
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)

        docs.sort(key=lambda d: parse_dt(d["metadata"].get("date", "")), reverse=True)
        return docs
