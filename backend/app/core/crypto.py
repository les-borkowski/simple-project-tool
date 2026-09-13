"""Encrypt/decrypt secrets (user-supplied LLM API keys) at rest under CREDENTIAL_ENCRYPTION_KEY.

CREDENTIAL_ENCRYPTION_KEY holds one *or more* comma-separated Fernet keys, newest first:

    CREDENTIAL_ENCRYPTION_KEY=<new key>,<previous key>

Encryption always uses the first; decryption tries each in turn. That is what makes the
key rotatable. With a single key and no fallback, rotating it made every stored
credential fail to decrypt — and the caller treats a decryption failure as "this user has
no credential" and falls back to the server's provider key, so an operator rotating for
an unrelated reason would silently move their whole user base's LLM spend onto their own
account, with no error and nothing visible to the user.

To rotate:
  1. Prepend the new key, keeping the old one listed. Everything keeps working.
  2. Run `python -m scripts.rotate_credentials` to re-encrypt every stored row under
     the new key.
  3. Drop the old key from the list.

Skipping step 2 strands every row that was never re-encrypted, which is the same silent
fallback as before — hence the script.
"""

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import settings


class CredentialEncryptionUnavailable(Exception):
    pass


# Keyed on the raw setting so a runtime change (tests, a reload) is picked up, while a
# steady-state process still builds the ciphers only once.
_cache: dict[str, MultiFernet] = {}


def reset_cipher_cache() -> None:
    """Drop memoised ciphers. For tests, and for any runtime settings reload."""
    _cache.clear()


def _parse_keys(raw: str) -> list[str]:
    return [k.strip() for k in raw.split(",") if k.strip()]


def _cipher() -> MultiFernet:
    raw = settings.CREDENTIAL_ENCRYPTION_KEY
    if not raw or not _parse_keys(raw):
        raise CredentialEncryptionUnavailable("CREDENTIAL_ENCRYPTION_KEY is not configured")

    cached = _cache.get(raw)
    if cached is not None:
        return cached

    fernets = []
    for key in _parse_keys(raw):
        try:
            fernets.append(Fernet(key.encode()))
        except (ValueError, TypeError) as exc:
            # Deliberately fatal rather than skipped: a typo in a retired key would
            # otherwise leave the operator believing rows are still decryptable when
            # they are not, and they would only find out when users start silently
            # falling back to the server key.
            raise CredentialEncryptionUnavailable(
                "CREDENTIAL_ENCRYPTION_KEY contains a value that is not a valid Fernet key"
            ) from exc

    cipher = MultiFernet(fernets)
    _cache[raw] = cipher
    return cipher


def encrypt_secret(plaintext: str) -> str:
    """Encrypt under the first configured key."""
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt using whichever configured key wrote it."""
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise CredentialEncryptionUnavailable(
            "credential could not be decrypted with any configured key"
        ) from exc


def rotate_secret(ciphertext: str) -> str:
    """Re-encrypt an existing value under the current primary key, without seeing it.

    MultiFernet.rotate does the decrypt/re-encrypt in one step, so the plaintext is never
    handed back to the caller.
    """
    try:
        return _cipher().rotate(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise CredentialEncryptionUnavailable(
            "credential could not be decrypted with any configured key"
        ) from exc
