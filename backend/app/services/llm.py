from __future__ import annotations

import logging
from functools import lru_cache
from typing import Protocol

from huggingface_hub import InferenceClient

from ..settings import settings

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
  def generate(self, *, prompt: str, temperature: float, max_tokens: int) -> str:
    ...


class MistralApiProvider:
  def __init__(self, *, api_key: str, model: str) -> None:
    try:
      from mistralai import Mistral  # type: ignore
    except Exception as exc:  # pragma: no cover - import guard
      raise RuntimeError('mistralai package is required for Mistral provider') from exc
    self._client = Mistral(api_key=api_key)
    self._model = model

  def generate(self, *, prompt: str, temperature: float, max_tokens: int) -> str:
    response = self._client.chat.complete(
      model=self._model,
      messages=[{'role': 'user', 'content': prompt}],
      temperature=temperature,
      max_tokens=max_tokens
    )
    choices = getattr(response, 'choices', None) or []
    if not choices:
      return ''
    content = getattr(choices[0].message, 'content', '')
    if isinstance(content, list):
      return ''.join([getattr(part, 'text', '') for part in content])
    return str(content or '')


class HuggingFaceProvider:
  def __init__(self, *, api_key: str, repo_id: str | None) -> None:
    self._repo_id = repo_id
    self._client = InferenceClient(provider='cerebras', api_key=api_key)

  def generate(self, *, prompt: str, temperature: float, max_tokens: int) -> str:
    try:
      completion = self._client.chat.completions.create(
        model='meta-llama/Llama-3.1-8B-Instruct',
        messages=[{'role': 'user', 'content': prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
      )
      return completion.choices[0].message.content
    except Exception:
      if not self._repo_id:
        raise
      text = self._client.text_generation(
        prompt,
        model=self._repo_id,
        max_new_tokens=max_tokens,
        temperature=temperature,
      )
      return text


@lru_cache
def get_llm_provider() -> LLMProvider:
  provider = settings.llm_provider
  if provider == 'mistral':
    if settings.has_mistral:
      logger.info('Using Mistral LLM provider (%s)', settings.mistral_model)
      return MistralApiProvider(api_key=settings.mistral_api_key or '', model=settings.mistral_model)
    if settings.huggingface_api_key:
      logger.warning('Mistral API key missing; falling back to HuggingFace provider')
      return HuggingFaceProvider(api_key=settings.huggingface_api_key, repo_id=settings.llm_repo_id)
    raise RuntimeError('Mistral provider selected but MISTRAL_API_KEY is missing')

  if provider == 'huggingface':
    if settings.huggingface_api_key:
      logger.info('Using HuggingFace LLM provider')
      return HuggingFaceProvider(api_key=settings.huggingface_api_key, repo_id=settings.llm_repo_id)
    if settings.has_mistral:
      logger.warning('HuggingFace key missing; falling back to Mistral provider')
      return MistralApiProvider(api_key=settings.mistral_api_key or '', model=settings.mistral_model)
    raise RuntimeError('HuggingFace provider selected but HUGGINGFACE_API_KEY is missing')

  raise RuntimeError(f'Unsupported LLM provider: {provider}')
