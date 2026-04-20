# -*- coding: utf-8 -*-
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from .app.services.llm import LLMProvider, get_llm_provider
from .app.services.chat_formatting import (
    enforce_concise as enforce_concise_text,
    format_context as format_retrieval_context,
    format_points,
)
from .app.services.chat_prompts import (
    build_memory_confirmation_prompt,
    build_source_prompt,
)
from .app.services.local_retrieval import LocalCorpus
from .app.settings import settings

load_dotenv()


class ChatBot:
    def __init__(
        self,
        repo_id: str = None,
        temperature: float = 0.6,
        index_name_bot: str = None,
        index_name_chat: str = None,
        language: str = "da",
    ):
        self.source_index_name = index_name_bot or "local-source"
        self.session_index_name = index_name_chat or "local-session"
        self._local_corpus = LocalCorpus(settings.data_json_path)
        print(f"[INIT] Retriever provider: local ({self._local_corpus.entry_count} corpus entries)")

        self.repo_id = repo_id or settings.llm_repo_id
        self.temperature = temperature
        self.language = language.lower()  # 'da' or 'en'

        self.llm_provider: LLMProvider = get_llm_provider()

    # ---------- prompts ----------
    def default_prompt_sourcedata(self, chat_history: str, original_data: str, user_input: str, user_name: str):
        return build_source_prompt(self.language, chat_history, original_data, user_input)

    def default_prompt_memory_confirmation(self, original_data: str, user_input: str) -> str:
        return build_memory_confirmation_prompt(self.language, original_data, user_input)

    # ---------- retrieval ----------
    def retrieve_docs(self, query: str, index_name: str, excluded_session_id: Optional[str] = None, k: int = 15) -> List[Dict[str, Any]]:
        docs = self._local_corpus.retrieve(
            query,
            index_name=index_name,
            chat_index_name=self.session_index_name,
            excluded_session_id=excluded_session_id,
            k=k,
        )
        print(f"[BOT] Local retrieval index='{index_name}' k={k} -> {len(docs)} docs")
        return docs

    # ---------- post-process ----------
    @staticmethod
    def enforce_concise(text: str, max_sentences: int = 5, max_words: int = 120) -> str:
        return enforce_concise_text(text, max_sentences=max_sentences, max_words=max_words)

    @staticmethod
    def _format_points(points: Any) -> str:
        return format_points(points)

    def format_context(self, documents: List[Dict[str, Any]], chat: bool = False) -> str:
        return format_retrieval_context(documents, chat=chat)

    # ---------- llm ----------
    def get_llm_response(
        self,
        prompt: str,
        *,
        temperature: Optional[float] = None,
        max_tokens: int = 512,
    ) -> str:
        return self.llm_provider.generate(
            prompt=prompt,
            temperature=min(self.temperature, 0.65) if temperature is None else temperature,
            max_tokens=max_tokens,
        )

    # ---------- session memory ----------
    def store_session_memory(
        self,
        user_input: str,
        ai_output: str,
        user_name: str,
        user_location: str,
        session_id: str,
        continuous_data: Optional[Dict[str, Any]] = None,
    ):
        self._local_corpus.add_chat_turn(
            user_input=user_input,
            ai_output=ai_output,
            user_name=user_name,
            user_location=user_location,
            session_id=session_id,
            continuous_data=continuous_data,
        )

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
        source_data = self.retrieve_docs(user_input, self.source_index_name, k=max(3, retrieval_k))
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

        memory_store_ms = 0.0
        if persist:
            print("[BOT] Storing turn in local session memory...")
            t5 = time.time()
            self.store_session_memory(user_input, ai_output, user_name, user_location, session_id, continuous_data)
            memory_store_ms = (time.time() - t5) * 1000
            print(f"[BOT] Local session storage took {memory_store_ms/1000:.2f}s")

        session_history = self.retrieve_session(session_id) if include_session_history else []
        return {
            "ai_output": ai_output,
            "source_data": source_data,
            "past_chat_context": [],
            "session_history": session_history,
            "timings": {
                "retrieval_ms": round(retrieval_ms, 2),
                "llm_ms": round(llm_ms, 2),
                "memory_store_ms": round(memory_store_ms, 2),
            }
        }

    def memory_confirmation(self, user_input: str, language: Optional[str] = None, retrieval_k: int = 2) -> Dict[str, Any]:
        import time

        if language:
            self.language = language.lower()

        t1 = time.time()
        source_data = self.retrieve_docs(user_input, self.source_index_name, k=max(1, retrieval_k))
        formatted_source_data = self.format_context(source_data[:2])
        retrieval_ms = (time.time() - t1) * 1000

        if not source_data:
            raise RuntimeError('memory_confirmation_retrieval_empty')

        t2 = time.time()
        prompt = self.default_prompt_memory_confirmation(formatted_source_data, user_input)
        resp = (self.get_llm_response(prompt, temperature=0.65, max_tokens=280) or '').strip()
        llm_ms = (time.time() - t2) * 1000

        ai_output = self.enforce_concise(resp, max_sentences=4, max_words=130)
        if not ai_output:
            raise RuntimeError('memory_confirmation_empty_response')

        return {
            "ai_output": ai_output,
            "source_data": source_data[:2],
            "timings": {
                "retrieval_ms": round(retrieval_ms, 2),
                "llm_ms": round(llm_ms, 2),
            }
        }

    def retrieve_session(self, session_id: str, k: int = 20) -> List[Dict[str, Any]]:
        return self._local_corpus.retrieve_session(session_id, k=k)

    def clear_session_memory(self, session_id: str) -> None:
        self._local_corpus.clear_session(session_id)
