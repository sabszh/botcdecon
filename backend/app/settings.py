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
  archive_db_enabled: bool = os.getenv('ARCHIVE_DB_ENABLED', 'false').lower() == 'true'
  database_url: Optional[str] = os.getenv('DATABASE_URL')
  archive_db_connect_timeout_sec: int = int(os.getenv('ARCHIVE_DB_CONNECT_TIMEOUT_SEC', '2'))
  archive_db_init_max_attempts: int = int(os.getenv('ARCHIVE_DB_INIT_MAX_ATTEMPTS', '1'))
  archive_db_retry_delay_sec: float = float(os.getenv('ARCHIVE_DB_RETRY_DELAY_SEC', '0.25'))
  admin_username: Optional[str] = os.getenv('ADMIN_USERNAME')
  admin_password: Optional[str] = os.getenv('ADMIN_PASSWORD')

  huggingface_api_key: Optional[str] = os.getenv('HUGGINGFACE_API_KEY')
  data_json_path: str = os.getenv('DATA_JSON_PATH', 'data/all.json')
  entries_source_url: Optional[str] = os.getenv('ENTRIES_SOURCE_URL', 'https://cc.n-kort.net/entries/all')
  sync_entries_on_startup: bool = os.getenv('SYNC_ENTRIES_ON_STARTUP', 'true').lower() == 'true'
  entries_sync_timeout_sec: float = float(os.getenv('ENTRIES_SYNC_TIMEOUT_SEC', '20'))
  llm_provider: str = os.getenv('LLM_PROVIDER', 'mistral').lower()
  mistral_api_key: Optional[str] = os.getenv('MISTRAL_API_KEY')
  mistral_model: str = os.getenv('MISTRAL_MODEL', 'mistral-small-latest')
  elevenlabs_api_key: Optional[str] = os.getenv('ELEVENLABS_API_KEY')
  tts_provider: str = os.getenv('TTS_PROVIDER', 'elevenlabs').lower()
  voice_id: str = os.getenv('VOICE_ID', '4PzN60Ir6O2U6RzaQ5fm')
  model_id: str = os.getenv('MODEL_ID', 'eleven_multilingual_v2')
  llm_repo_id: Optional[str] = os.getenv('LLM_REPO_ID')

  default_language: str = os.getenv('DEFAULT_LANGUAGE', 'da')

  @property
  def has_llm_backends(self) -> bool:
    return bool(self.mistral_api_key or self.huggingface_api_key)

  @property
  def has_mistral(self) -> bool:
    return self.mistral_api_key is not None

  @property
  def has_elevenlabs(self) -> bool:
    return self.elevenlabs_api_key is not None

  @property
  def has_tts(self) -> bool:
    return self.has_elevenlabs

  @property
  def has_admin_auth(self) -> bool:
    return bool(self.admin_username and self.admin_password)

  @property
  def has_archive_db(self) -> bool:
    return self.archive_db_enabled and bool(self.database_url)


settings = Settings()
