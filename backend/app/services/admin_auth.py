from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from ..settings import settings

security = HTTPBasic(auto_error=False)


def require_admin(credentials: HTTPBasicCredentials | None = Depends(security)) -> str:
  if not settings.has_admin_auth:
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='admin_auth_not_configured')

  if credentials is None:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail='admin_auth_required',
      headers={'WWW-Authenticate': 'Basic'}
    )

  username_ok = secrets.compare_digest(credentials.username or '', settings.admin_username or '')
  password_ok = secrets.compare_digest(credentials.password or '', settings.admin_password or '')
  if username_ok and password_ok:
    return credentials.username

  raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail='admin_auth_invalid',
    headers={'WWW-Authenticate': 'Basic'}
  )
