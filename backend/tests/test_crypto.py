import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core.config import settings
from app.core.crypto import CredentialEncryptionUnavailable, decrypt_secret, encrypt_secret


@pytest.fixture(autouse=True)
def clear_fernet_cache():
    crypto.reset_cipher_cache()
    yield
    crypto.reset_cipher_cache()


def test_round_trip(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", Fernet.generate_key().decode())

    ciphertext = encrypt_secret("hello")

    assert decrypt_secret(ciphertext) == "hello"


def test_encrypt_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", "")

    with pytest.raises(CredentialEncryptionUnavailable):
        encrypt_secret("hello")


def test_decrypt_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", "")

    with pytest.raises(CredentialEncryptionUnavailable):
        decrypt_secret("some-ciphertext")


def test_encryptions_are_not_deterministic(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", Fernet.generate_key().decode())

    assert encrypt_secret("hello") != encrypt_secret("hello")


def test_wrong_key_degrades_gracefully(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", Fernet.generate_key().decode())
    ciphertext = encrypt_secret("hello")

    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", Fernet.generate_key().decode())

    with pytest.raises(CredentialEncryptionUnavailable):
        decrypt_secret(ciphertext)


def test_malformed_key_degrades_gracefully(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", "not-a-valid-key")

    with pytest.raises(CredentialEncryptionUnavailable):
        encrypt_secret("hello")

    with pytest.raises(CredentialEncryptionUnavailable):
        decrypt_secret("some-ciphertext")

    # A key that fails to construct must not be memoised — otherwise fixing the typo
    # without restarting would keep serving the broken cipher.
    assert crypto._cache == {}
