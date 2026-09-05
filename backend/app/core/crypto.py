"""Encrypt/decrypt secrets (user-supplied LLM API keys) at rest under CREDENTIAL_ENCRYPTION_KEY."""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class CredentialEncryptionUnavailable(Exception):
    pass


@lru_cache(maxsize=1)
def _fernet_for_key(key: str) -> Fernet:
    return Fernet(key.encode())


def _fernet() -> Fernet:
    if not settings.CREDENTIAL_ENCRYPTION_KEY:
        raise CredentialEncryptionUnavailable("CREDENTIAL_ENCRYPTION_KEY is not configured")
    return _fernet_for_key(settings.CREDENTIAL_ENCRYPTION_KEY)


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise CredentialEncryptionUnavailable(
            "credential could not be decrypted with the current key"
        ) from exc
