"""
Round-trip + tamper specs for services/token_crypto.

These guard the only thing standing between a database leak and an
account-takeover: the AES-GCM wrapper around stored refresh tokens. If a
ciphertext silently decrypted with the wrong key, or a tampered ciphertext
returned a usable plaintext, this layer would be useless. We test exactly
those failure modes.
"""
from __future__ import annotations

import base64
import pytest


class TestRoundTrip:
    def test_encrypt_then_decrypt_returns_plaintext(self):
        from services.token_crypto import encrypt, decrypt

        plaintext = "1//0e-some-google-refresh-token-value"
        ct, iv = encrypt(plaintext)
        assert decrypt(ct, iv) == plaintext

    def test_each_encrypt_uses_a_fresh_iv(self):
        """Re-encrypting the same plaintext must produce different
        ciphertexts. If two calls returned the same (ct, iv) pair we'd
        be leaking that two users share a token."""
        from services.token_crypto import encrypt

        ct1, iv1 = encrypt("same-plaintext")
        ct2, iv2 = encrypt("same-plaintext")
        assert (ct1, iv1) != (ct2, iv2)
        assert iv1 != iv2  # IV is the primary uniqueness source

    def test_unicode_round_trip(self):
        """Hebrew chars must survive — TEEPO is RTL and labels in flight
        could include them."""
        from services.token_crypto import encrypt, decrypt

        plaintext = "סוד-רענון-של-גוגל"
        ct, iv = encrypt(plaintext)
        assert decrypt(ct, iv) == plaintext


class TestTampering:
    def test_tampered_ciphertext_raises(self):
        """Flipping a single byte in the ciphertext must fail authentication
        rather than return garbage plaintext."""
        from services.token_crypto import encrypt, decrypt, InvalidToken

        ct, iv = encrypt("the-real-token")

        raw = bytearray(base64.urlsafe_b64decode(ct.encode("ascii")))
        raw[0] ^= 0x01  # flip lowest bit of first byte
        tampered = base64.urlsafe_b64encode(bytes(raw)).decode("ascii")

        with pytest.raises(InvalidToken):
            decrypt(tampered, iv)

    def test_wrong_iv_raises(self):
        """Using a different (valid-looking) IV must fail auth."""
        from services.token_crypto import encrypt, decrypt, InvalidToken

        ct, _iv = encrypt("the-real-token")
        # 12 bytes of zeros — valid length, but never produced for this ct.
        bad_iv = base64.urlsafe_b64encode(b"\x00" * 12).decode("ascii")

        with pytest.raises(InvalidToken):
            decrypt(ct, bad_iv)

    def test_malformed_base64_raises(self):
        """Garbage in the columns must error cleanly, not crash with a
        decoder exception leaking from a try-block boundary."""
        from services.token_crypto import decrypt, InvalidToken

        with pytest.raises(InvalidToken):
            decrypt("@@@-not-base64-@@@", "@@@-also-not-@@@")

    def test_short_iv_raises(self):
        """IV with the wrong length is rejected explicitly with a clear
        InvalidToken — not a downstream cryptography library exception."""
        from services.token_crypto import decrypt, InvalidToken

        ct = base64.urlsafe_b64encode(b"\x00" * 32).decode("ascii")
        short_iv = base64.urlsafe_b64encode(b"\x00" * 4).decode("ascii")

        with pytest.raises(InvalidToken):
            decrypt(ct, short_iv)


class TestInputValidation:
    def test_encrypt_empty_string_raises(self):
        from services.token_crypto import encrypt

        with pytest.raises(ValueError):
            encrypt("")

    def test_encrypt_non_string_raises(self):
        from services.token_crypto import encrypt

        with pytest.raises(ValueError):
            encrypt(None)  # type: ignore[arg-type]
