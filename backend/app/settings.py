import os
from dataclasses import dataclass, field
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


def _split_origins(raw: str) -> List[str]:
  if raw.strip() == '*':
    return ['*']
  return [origin.strip() for origin in raw.split(',') if origin.strip()]


@dataclass
class Settings:
  debug: bool = os.getenv('DEBUG', 'false').lower() == 'true'
  environment: str = os.getenv('ENVIRONMENT', 'development')
  api_prefix: str = os.getenv('API_PREFIX', '/api')
  allow_origins: List[str] = field(default_factory=lambda: _split_origins(os.getenv('API_ALLOW_ORIGINS', '*')))
  allow_methods: List[str] = field(default_factory=lambda: ['*'])
  allow_headers: List[str] = field(default_factory=lambda: ['*'])
  allow_credentials: bool = os.getenv('API_ALLOW_CREDENTIALS', 'false').lower() == 'true'

  huggingface_api_key: Optional[str] = os.getenv('HUGGINGFACE_API_KEY')
  pinecone_api_key: Optional[str] = os.getenv('PINECONE_API_KEY')
  elevenlabs_api_key: Optional[str] = os.getenv('ELEVENLABS_API_KEY')
  voice_id: str = os.getenv('VOICE_ID', '4PzN60Ir6O2U6RzaQ5fm')
  model_id: str = os.getenv('MODEL_ID', 'eleven_multilingual_v2')
  llm_repo_id: Optional[str] = os.getenv('LLM_REPO_ID')

  default_language: str = os.getenv('DEFAULT_LANGUAGE', 'da')

  @property
  def has_llm_backends(self) -> bool:
    return all([self.huggingface_api_key, self.pinecone_api_key])

  @property
  def has_tts(self) -> bool:
    return self.elevenlabs_api_key is not None


settings = Settings()
