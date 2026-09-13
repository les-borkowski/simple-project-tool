"""CREDENTIAL_ENCRYPTION_KEY must be rotatable without stranding stored credentials.

With a single key and no rotation path, rotating it made every decrypt raise; the caller
logged a warning and fell back to the server's provider key. An operator rotating for an
unrelated incident would silently move their whole user base's LLM spend onto their own
account with no error and no user-visible signal.
"""

import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core.crypto import CredentialEncryptionUnavailable, decrypt_secret, encrypt_secret

KEY_A = Fernet.generate_key().decode()
KEY_B = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _clear_key_cache():
    crypto.reset_cipher_cache()
    yield
    crypto.reset_cipher_cache()


def _set_keys(monkeypatch, value: str) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", value)
    crypto.reset_cipher_cache()


def test_a_secret_encrypted_under_the_old_key_still_decrypts_after_rotation(monkeypatch):
    _set_keys(monkeypatch, KEY_A)
    ciphertext = encrypt_secret("sk-user-secret")

    # Rotation: the new key goes first, the old one stays listed so existing rows read.
    _set_keys(monkeypatch, f"{KEY_B},{KEY_A}")

    assert decrypt_secret(ciphertext) == "sk-user-secret"


def test_new_secrets_are_encrypted_under_the_first_key(monkeypatch):
    _set_keys(monkeypatch, f"{KEY_B},{KEY_A}")
    ciphertext = encrypt_secret("sk-new-secret")

    # Readable with only the new key — so it was not written under the retired one.
    _set_keys(monkeypatch, KEY_B)
    assert decrypt_secret(ciphertext) == "sk-new-secret"


def test_dropping_the_old_key_strands_secrets_that_were_never_re_encrypted(monkeypatch):
    """The failure mode rotation must be paired with re-encryption to avoid."""
    _set_keys(monkeypatch, KEY_A)
    ciphertext = encrypt_secret("sk-user-secret")

    _set_keys(monkeypatch, KEY_B)

    with pytest.raises(CredentialEncryptionUnavailable):
        decrypt_secret(ciphertext)


def test_rotate_secret_re_encrypts_under_the_current_primary(monkeypatch):
    _set_keys(monkeypatch, KEY_A)
    old_ciphertext = encrypt_secret("sk-user-secret")

    _set_keys(monkeypatch, f"{KEY_B},{KEY_A}")
    new_ciphertext = crypto.rotate_secret(old_ciphertext)

    # Now readable with the new key alone — the old one can be retired.
    _set_keys(monkeypatch, KEY_B)
    assert decrypt_secret(new_ciphertext) == "sk-user-secret"


def test_whitespace_around_keys_is_tolerated(monkeypatch):
    _set_keys(monkeypatch, KEY_A)
    ciphertext = encrypt_secret("sk-user-secret")

    _set_keys(monkeypatch, f" {KEY_B} , {KEY_A} ")
    assert decrypt_secret(ciphertext) == "sk-user-secret"


def test_an_unconfigured_key_is_still_reported_clearly(monkeypatch):
    _set_keys(monkeypatch, "")

    with pytest.raises(CredentialEncryptionUnavailable):
        encrypt_secret("anything")


def test_a_malformed_key_is_still_reported_clearly(monkeypatch):
    _set_keys(monkeypatch, "not-a-fernet-key")

    with pytest.raises(CredentialEncryptionUnavailable):
        encrypt_secret("anything")


def test_one_malformed_key_among_several_is_rejected_rather_than_silently_skipped(monkeypatch):
    """Silently ignoring it would leave the operator believing a key is still available
    for decryption when it is not."""
    _set_keys(monkeypatch, f"{KEY_B},not-a-fernet-key")

    with pytest.raises(CredentialEncryptionUnavailable):
        encrypt_secret("anything")
